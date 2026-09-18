import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type LegacyDatedUploadInventoryStatus =
  | "ALREADY_MANAGED"
  | "DATED_FILE_PRESENT"
  | "DATED_FILE_MISSING"
  | "UNSAFE"
  | "NOT_DATED_UPLOAD";

export type LegacyDatedUploadInventoryNextAction =
  | "NONE"
  | "COPY_REGISTER_EXPLICIT_REMAP"
  | "LOCATE_FILE"
  | "REJECT";

export interface LegacyUploadReference {
  url: string;
  path?: string;
  blockType?: string;
}

export interface LegacyDatedUploadInventoryEntry {
  url: string;
  path?: string;
  blockType?: string;
  storageKey: string | null;
  status: LegacyDatedUploadInventoryStatus;
  byteSize: number | null;
  checksumSha256: string | null;
  proposedManagedStorageKey: string | null;
  proposedManagedUrl: string | null;
  nextAction: LegacyDatedUploadInventoryNextAction;
  notes: string[];
}

export interface LegacyDatedUploadInventoryReport {
  mode: "dry-run";
  publicRoot: string;
  counts: Record<LegacyDatedUploadInventoryStatus, number>;
  entries: LegacyDatedUploadInventoryEntry[];
  notes: string[];
}

const DATED_STORAGE_KEY = /^(\d{4}\/\d{2}\/\d{2}\/)([^/]+)$/;

function isUnsafeStorageKey(storageKey: string) {
  const segments = storageKey.split("/");
  return (
    /[\u0000-\u001f\u007f]/u.test(storageKey)
    || storageKey.includes("\\")
    || segments.some((segment) => !segment || segment === "." || segment === "..")
  );
}

function isManagedStorageKey(storageKey: string) {
  return storageKey.startsWith("page-assets/") || storageKey.startsWith("product-assets/");
}

export function parseLegacyUploadUrl(url: string): {
  kind: "managed" | "dated" | "other-upload" | "unsafe" | "not-upload";
  storageKey?: string;
} {
  const value = url.trim();
  if (!value || /^(?:data|blob|javascript|vbscript|file):/i.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) {
    return { kind: "unsafe" };
  }
  if (/^https?:\/\//i.test(value) || value.startsWith("//")) {
    return { kind: "unsafe" };
  }
  const stored = value.match(/^\/uploads\/([^?#]+)(?:[?#].*)?$/);
  if (!stored) return { kind: "not-upload" };
  let storageKey: string;
  try {
    storageKey = decodeURIComponent(stored[1]);
  } catch {
    return { kind: "unsafe" };
  }
  if (isUnsafeStorageKey(storageKey)) return { kind: "unsafe" };
  if (isManagedStorageKey(storageKey)) return { kind: "managed", storageKey };
  if (DATED_STORAGE_KEY.test(storageKey)) return { kind: "dated", storageKey };
  return { kind: "other-upload", storageKey };
}

function collectStringLeaves(value: unknown, path: string, blockType: string | undefined, out: LegacyUploadReference[]) {
  if (typeof value === "string") {
    if (value.includes("/uploads/")) out.push({ url: value, path, ...(blockType ? { blockType } : {}) });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const nextType = item && typeof item === "object" && "type" in item && typeof item.type === "string"
        ? item.type
        : blockType;
      collectStringLeaves(item, `${path}[${index}]`, nextType, out);
    });
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      collectStringLeaves(item, path ? `${path}.${key}` : key, blockType, out);
    }
  }
}

export function extractUploadReferencesFromPuckData(puckData: unknown): LegacyUploadReference[] {
  const out: LegacyUploadReference[] = [];
  collectStringLeaves(puckData, "", undefined, out);
  const unique = new Map<string, LegacyUploadReference>();
  for (const reference of out) {
    const key = `${reference.path ?? ""}::${reference.url}`;
    if (!unique.has(key)) unique.set(key, reference);
  }
  return [...unique.values()];
}

function resolveWithinRoot(root: string, storageKey: string): string | null {
  const target = resolve(root, ...storageKey.split("/"));
  const pathFromRoot = relative(root, target);
  if (
    !pathFromRoot
    || pathFromRoot === ".."
    || pathFromRoot.startsWith(`..${sep}`)
    || isAbsolute(pathFromRoot)
  ) {
    return null;
  }
  return target;
}

export function inventoryLegacyDatedUploads(
  references: readonly LegacyUploadReference[],
  options: { publicRoot: string },
): LegacyDatedUploadInventoryReport {
  const publicRoot = resolve(options.publicRoot);
  const entries = references.map((reference): LegacyDatedUploadInventoryEntry => {
    const parsed = parseLegacyUploadUrl(reference.url);
    const base = {
      url: reference.url,
      ...(reference.path ? { path: reference.path } : {}),
      ...(reference.blockType ? { blockType: reference.blockType } : {}),
    };
    if (parsed.kind === "unsafe") {
      return {
        ...base,
        storageKey: parsed.storageKey ?? null,
        status: "UNSAFE",
        byteSize: null,
        checksumSha256: null,
        proposedManagedStorageKey: null,
        proposedManagedUrl: null,
        nextAction: "REJECT",
        notes: ["地址不安全，禁止登记或回填"],
      };
    }
    if (parsed.kind === "managed") {
      return {
        ...base,
        storageKey: parsed.storageKey ?? null,
        status: "ALREADY_MANAGED",
        byteSize: null,
        checksumSha256: null,
        proposedManagedStorageKey: parsed.storageKey ?? null,
        proposedManagedUrl: reference.url,
        nextAction: "NONE",
        notes: ["已是受控 page-assets/product-assets 路径，不按历史日期文件处理"],
      };
    }
    if (parsed.kind !== "dated") {
      return {
        ...base,
        storageKey: parsed.storageKey ?? null,
        status: "NOT_DATED_UPLOAD",
        byteSize: null,
        checksumSha256: null,
        proposedManagedStorageKey: null,
        proposedManagedUrl: null,
        nextAction: "REJECT",
        notes: ["不是 YYYY/MM/DD 历史上传路径；在原路径补 MediaAsset 也不能通过现行 resolver"],
      };
    }
    const storageKey = parsed.storageKey!;
    const physical = resolveWithinRoot(publicRoot, storageKey);
    if (!physical || !existsSync(physical)) {
      return {
        ...base,
        storageKey,
        status: "DATED_FILE_MISSING",
        byteSize: null,
        checksumSha256: null,
        proposedManagedStorageKey: null,
        proposedManagedUrl: null,
        nextAction: "LOCATE_FILE",
        notes: ["公开根内找不到对应文件，不能登记"],
      };
    }
    const bytes = readFileSync(physical);
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    const extensionMatch = storageKey.match(/(\.[A-Za-z0-9]+)$/);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";
    const proposedManagedStorageKey = `page-assets/${checksumSha256}${extension}`;
    return {
      ...base,
      storageKey,
      status: "DATED_FILE_PRESENT",
      byteSize: statSync(physical).size,
      checksumSha256,
      proposedManagedStorageKey,
      proposedManagedUrl: `/uploads/${proposedManagedStorageKey}`,
      nextAction: "COPY_REGISTER_EXPLICIT_REMAP",
      notes: [
        "现行 resolver 在查库前拒绝日期路径，原路径补登记不能解除发布阻断",
        "恢复方式：复制到 page-assets/{checksum}{ext}、建立 MediaAsset 与公开授权，再由运营显式改页面引用",
        "禁止移动原文件、禁止静默改写页面",
      ],
    };
  });

  const counts: LegacyDatedUploadInventoryReport["counts"] = {
    ALREADY_MANAGED: 0,
    DATED_FILE_PRESENT: 0,
    DATED_FILE_MISSING: 0,
    UNSAFE: 0,
    NOT_DATED_UPLOAD: 0,
  };
  entries.forEach((entry) => {
    counts[entry.status] += 1;
  });

  return {
    mode: "dry-run",
    publicRoot,
    counts,
    entries,
    notes: [
      "本报告只读，不写数据库、不复制文件、不改页面。",
      "--apply 未开放；复制登记与页面引用替换必须单独授权且显式确认。",
    ],
  };
}

export function parseLegacyDatedUploadInventoryArgs(args: readonly string[]): {
  inputPath: string;
  publicRoot: string;
} {
  if (args.includes("--apply")) {
    throw new Error("历史日期上传盘点只支持 dry-run，禁止 --apply 和数据库写入");
  }
  const inputIndex = args.indexOf("--input");
  const inputPath = inputIndex >= 0 ? args[inputIndex + 1]?.trim() : "";
  if (!inputPath) {
    throw new Error("请用 --input <snapshot.json> 提供页面快照或 URL 列表");
  }
  const rootIndex = args.indexOf("--public-root");
  const publicRoot = rootIndex >= 0
    ? args[rootIndex + 1]?.trim()
    : resolve(process.cwd(), "uploads");
  if (!publicRoot) throw new Error("--public-root 不能为空");
  return { inputPath, publicRoot };
}

function readInputReferences(inputPath: string): LegacyUploadReference[] {
  const parsed = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;
  if (Array.isArray(parsed)) {
    return parsed.map((item) => {
      if (typeof item === "string") return { url: item };
      if (item && typeof item === "object" && "url" in item && typeof item.url === "string") {
        return item as LegacyUploadReference;
      }
      throw new Error("回填输入数组项必须是 URL 字符串或 { url } 对象");
    });
  }
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.urls)) {
      return record.urls.map((url) => {
        if (typeof url !== "string") throw new Error("urls 必须是字符串数组");
        return { url };
      });
    }
    if ("puckData" in record) {
      return extractUploadReferencesFromPuckData(record.puckData);
    }
    if ("content" in record || "root" in record) {
      return extractUploadReferencesFromPuckData(record);
    }
  }
  throw new Error("输入必须是 URL 数组、{ urls } 或含 puckData 的页面快照");
}

function main(): void {
  const { inputPath, publicRoot } = parseLegacyDatedUploadInventoryArgs(process.argv.slice(2));
  const report = inventoryLegacyDatedUploads(readInputReferences(inputPath), { publicRoot });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
