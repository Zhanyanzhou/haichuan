import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { productApi, uploadApi } from "@/services/api";
import { requestRetryAfterSeconds, requestStatus } from "@/services/httpClient";
import { currentSessionEpoch, isCurrentSessionEpoch } from "@/services/sessionEpoch";
import type { ProductImage, SalesMode } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import { deriveFolderProductIdentity } from "./productFolderImportInference";
import { productImageAngle, productImageFingerprint, productImageRank } from "../productImageIntake";

export const maxFolderImageBytes = 10 * 1024 * 1024;
const imageExtension = /\.(jpe?g|png|webp|gif)$/i;
const copySuffix = /\s*[-–—]?\s*副本(?:\s*\(\d+\))?$/u;
const compare = new Intl.Collator("zh-CN", { numeric: true });

type UploadedImage = {
  mediaAssetId: number;
  storageKey: string;
  width?: number;
  height?: number;
  mimeType?: string;
  fileSize?: number;
};

export type FolderImage = {
  key: string;
  file: File;
  path: string;
  angle: string;
  fingerprint?: string;
  sourceFingerprint?: string;
  issue?: string;
  excluded?: boolean;
  uploaded?: UploadedImage;
  linkAttempted?: boolean;
  imageId?: number;
};

export type FolderDraft = {
  key: string;
  title: string;
  code: string;
  images: FolderImage[];
  selected: boolean;
  id?: number;
  saved?: boolean;
  published?: boolean;
  issue?: string;
};

export type FolderSettings = {
  categoryId: number;
  salesMode: SalesMode;
  priceMin?: number | null;
  visibility: "PUBLIC" | "MEMBER" | "PARTNER" | "INTERNAL";
};

type MediaRequest = "upload" | "attach" | "authorize";
type ImportRequest = <T>(send: () => Promise<T>, mediaRequest?: MediaRequest) => Promise<T>;

export function createFolderImportRequest(isOpen: () => boolean, onWait: (seconds: number) => void): ImportRequest {
  const epoch = currentSessionEpoch("admin");
  const mediaWindows: Record<MediaRequest, number[]> = { upload: [], attach: [], authorize: [] };
  function assertCurrent() {
    if (!isOpen() || !isCurrentSessionEpoch("admin", epoch)) throw new Error("导入会话已结束");
  }
  async function wait(seconds: number) {
    onWait(Math.ceil(seconds));
    await new Promise((resolve) => window.setTimeout(resolve, seconds * 1000 + 150));
    assertCurrent();
  }
  return async (send, mediaRequest) => {
    assertCurrent();
    if (mediaRequest) {
      // 为同一员工的其他操作预留余量，避免长批次用尽每接口每分钟 60 次的额度。
      const timestamps = mediaWindows[mediaRequest];
      const expire = () => {
        const boundary = Date.now() - 60_000;
        while (timestamps.length && timestamps[0] <= boundary) timestamps.shift();
      };
      expire();
      if (timestamps.length >= 55) await wait((timestamps[0] + 60_000 - Date.now()) / 1000);
      expire();
      timestamps.push(Date.now());
    }
    try {
      return await send();
    } catch (error) {
      // 只自动重试被限流守卫拒绝、尚未执行写入的请求。
      if (requestStatus(error) !== 429) throw error;
      const seconds = requestRetryAfterSeconds(error) ?? 60;
      if (seconds > 60) throw error;
      await wait(seconds);
      return send();
    }
  };
}

export async function inspectFolderImage(file: File, key: string, angle: FolderImage["angle"]): Promise<FolderImage> {
  const path = file.webkitRelativePath || file.name;
  const image = { key, file, path, angle };
  if (!imageExtension.test(file.name) || file.size === 0) {
    return { ...image, issue: "请选择非空的 JPG、PNG、WebP 或 GIF 图片" };
  }
  const issue = file.size > maxFolderImageBytes
    ? (file.size / 1024 / 1024).toFixed(1) + " MB，超过 10 MB"
    : undefined;
  // 仍检查常见的大图是否重复，同时限制单个文件的内存占用。
  if (file.size > maxFolderImageBytes * 3) return { ...image, issue };
  try {
    const fingerprint = await productImageFingerprint(file);
    return { ...image, fingerprint, issue };
  } catch {
    return { ...image, issue: issue || "无法读取图片，请重新选择文件" };
  }
}

export async function scanProductFolder(files: File[]) {
  const groups = new Map<string, FolderDraft>();
  const unassigned: string[] = [];
  let ignored = 0;
  const root = files[0]?.webkitRelativePath.split("/")[0] ?? "";
  const series = root.replace(/^\d+[\s._-]*/, "").trim();

  for (const file of files) {
    if (!imageExtension.test(file.name)) {
      if (file.type.startsWith("image/")) unassigned.push(file.webkitRelativePath || file.name);
      else ignored++;
      continue;
    }
    const stem = file.name.replace(imageExtension, "").replace(copySuffix, "");
    const match = /^([a-z]+[-_]?\d+)\s*[-_ ]?(.*)$/iu.exec(stem);
    if (!match) {
      unassigned.push(file.webkitRelativePath || file.name);
      continue;
    }
    const [, originalCode, tail] = match;
    const code = originalCode.toUpperCase();
    const angle = productImageAngle(stem);
    const variant = tail.replace(/(主图|正面|佩戴|侧面|背面|顶部|细节)$/u, "")
      .replace(/^(FRONT|SIDE|BACK|DETAIL)(?=$|[_ -])/i, "")
      .trim().replace(/^[\s_-]+|[\s_-]+$/g, "");
    const identity = deriveFolderProductIdentity(series, code, variant);
    let row = groups.get(identity.key);
    if (!row) {
      row = {
        ...identity,
        images: [],
        selected: true,
      };
      groups.set(identity.key, row);
    }
    row.images.push(await inspectFolderImage(file, row.images.length.toString(), angle));
  }
  const rows = [...groups.values()].sort((a, b) => compare.compare(a.key, b.key));
  for (const row of rows) {
    row.images.sort((a, b) => productImageRank(a.angle) - productImageRank(b.angle)
      || Number(copySuffix.test(a.file.name.replace(imageExtension, ""))) - Number(copySuffix.test(b.file.name.replace(imageExtension, "")))
      || compare.compare(a.path, b.path));
  }
  return { rows, unassigned, ignored };
}

export function findDuplicateImages(rows: FolderDraft[]) {
  const firstByHash = new Map<string, string>();
  const duplicates = new Map<FolderImage, string>();
  for (const row of rows) {
    if (!row.selected && !row.id) continue;
    for (const image of row.images) {
      if (image.excluded) continue;
      const hashes = [image.sourceFingerprint, image.fingerprint].filter((hash): hash is string => !!hash);
      const first = hashes.map((hash) => firstByHash.get(hash)).find(Boolean);
      if (first) duplicates.set(image, first);
      for (const hash of hashes) {
        if (!firstByHash.has(hash)) firstByHash.set(hash, first || image.path);
      }
    }
  }
  return duplicates;
}

export function countGalleryImages(row: FolderDraft) {
  return row.images.filter((image) => !image.excluded).length;
}

export function hasReadyGallery(row: FolderDraft, duplicates: Map<FolderImage, string>) {
  const count = countGalleryImages(row);
  return count > 0 && count <= 9 && row.images.every(
    (image) => image.excluded || (!image.issue && !duplicates.has(image)),
  );
}

export function isImportCodeValid(code: string) {
  return code.trim().length > 0 && Array.from(code.trim()).length <= 50;
}

async function findLinkedImage(productId: number, assetId: number, request: ImportRequest) {
  const product = unwrapResponse<{ images: (ProductImage & { mediaAssetId?: number })[] }>(
    await request(() => productApi.getById(productId)),
  );
  return product.images.find((image) => image.mediaAssetId === assetId)?.id;
}

export async function saveFolderDraft(
  original: FolderDraft,
  settings: FolderSettings,
  request: ImportRequest,
  onProgress: (row: FolderDraft) => void,
) {
  let row = original;
  const update = (patch: Partial<FolderDraft>) => {
    row = { ...row, ...patch };
    onProgress(row);
  };
  const updateImage = (key: string, patch: Partial<FolderImage>) =>
    update({ images: row.images.map((image) => image.key === key ? { ...image, ...patch } : image) });

  let failure = "草稿保存结果待确认。请检查款号和商品列表后重试。";
  try {
    let id = row.id;
    if (!id) {
      const draft = unwrapResponse<{ id: number; status: string }>(await request(() => productApi.create({
        name: row.title.trim(), code: row.code.trim(), ...settings,
        ...(settings.salesMode === "CUSTOM_INQUIRY" ? { priceMin: settings.priceMin ?? 1000 } : {}),
        // 图片无法确认材质，避免继承普通新建接口的足金默认值。
        materialType: "OTHER",
        status: "DRAFT", publishMode: "WAREHOUSE", requireNewCode: true,
      })));
      if (!draft.id || draft.status !== "DRAFT") throw new Error("未取得草稿");
      id = draft.id;
      update({ id });
    }
    const included = row.images.filter((image) => !image.excluded);
    const imageIds: number[] = [];
    for (const [sortOrder, image] of included.entries()) {
      if (image.imageId) {
        imageIds.push(image.imageId);
        continue;
      }
      failure = "「" + image.file.name + "」未能保存到草稿，请重试或到草稿中核对。";
      const uploaded = image.uploaded ??
        unwrapResponse<UploadedImage[]>(await request(() => uploadApi.uploadProductImage(image.file), "upload"))[0];
      if (!uploaded?.mediaAssetId || !uploaded.storageKey) throw new Error("未取得图片");
      updateImage(image.key, { uploaded });
      let imageId = image.linkAttempted ? await findLinkedImage(id, uploaded.mediaAssetId, request) : undefined;
      if (!imageId) {
        updateImage(image.key, { linkAttempted: true });
        const linked = unwrapResponse<ProductImage>(await request(() => productApi.addImage(id, {
          ...uploaded, sortOrder,
          // 现有图库以 SIDE 承载非首图，导入清单保留侧面和背面标签。
          type: sortOrder === 0 ? "FRONT" : "SIDE",
        }), "attach"));
        imageId = linked.id;
      }
      if (!imageId) throw new Error("未取得商品图片");
      updateImage(image.key, { imageId });
      imageIds.push(imageId);
    }
    failure = "图片已上传，草稿主图尚未确认。请重试保存草稿。";
    await request(() => productApi.setCoverImage(id, imageIds[0]));
    update({ saved: true, issue: undefined, selected: false });
  } catch (error) {
    update({ issue: getSafeAdminErrorMessage(error, failure) });
  }
}
