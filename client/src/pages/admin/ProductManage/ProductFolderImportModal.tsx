import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Checkbox, Collapse, Input, InputNumber, Modal, Select, Space, Tag, Typography } from "antd";
import { Link } from "react-router-dom";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { productApi, uploadApi } from "@/services/api";
import type { Product, SalesMode } from "@/types";
import type { ProductImportCodeConflict } from "@/services/clients/productClient";
import { unwrapResponse } from "@/utils/unwrap";
import { salesModeLabels, statusMeta } from "./productManageModel";
import { canCompressFolderImage, compressFolderImage } from "./folderImageCompression";
import {
  countGalleryImages, createFolderImportRequest, findDuplicateImages, hasReadyGallery, inspectFolderImage,
  isImportCodeValid, saveFolderDraft, scanProductFolder,
  type FolderDraft, type FolderImage, type FolderSettings,
} from "./productFolderImport";
import { inferFolderCategory, type FolderCategoryInference } from "./productFolderImportInference";
import "./ProductFolderImportModal.css";

const visibilityOptions: { label: string; value: FolderSettings["visibility"] }[] = [
  { label: "全部人可见", value: "PUBLIC" },
  { label: "仅会员", value: "MEMBER" },
  { label: "仅合作商家", value: "PARTNER" },
  { label: "仅内部", value: "INTERNAL" },
];

type Props = {
  categories: { label: string; value: number }[];
  canPublish: boolean;
  canAuthorizeImages: boolean;
  onClose: () => void;
  onChanged: () => void;
};

type PendingIssue = { type: string; text: string; rowKey?: string; imageKey?: string };
type CompressionPreview = Awaited<ReturnType<typeof compressFolderImage>> & {
  source: FolderImage;
  rowKey: string;
  sourceUrl: string;
  outputUrl: string;
};

const formatImageSize = (file: File) => (file.size / (1024 * 1024)).toFixed(2) + " MB";

function FolderFileRow({ id, image, duplicate, disabled, onToggle, onReplace, onCompress }: {
  id: string;
  image: FolderImage;
  duplicate?: string;
  disabled: boolean;
  onToggle: () => void;
  onReplace: (file: File) => void;
  onCompress: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>();
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <li id={id} tabIndex={-1} className="folder-import__file">
      <div>
        <Tag>{image.angle}</Tag>
        <Button type="link" size="small" className="folder-import__preview-button" aria-expanded={!!preview} onClick={() => {
          setPreview(preview ? undefined : URL.createObjectURL(image.file));
        }}>{image.file.name}</Button>
        {image.imageId && <Tag color="green">已保存</Tag>}
        {image.excluded && <Tag>已排除</Tag>}
        {!image.excluded && image.issue && <div className="folder-import__issue">{image.issue}</div>}
        {!image.excluded && duplicate && <div className="folder-import__issue">图片内容重复 · {duplicate}</div>}
        {preview && <img className="folder-import__preview" src={preview} alt={image.angle + " · " + image.file.name} />}
      </div>
      {!image.imageId && !image.linkAttempted && (
        <Space wrap>
          <input
            ref={picker}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.gif"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onReplace(file);
            }}
          />
          <Button size="small" disabled={disabled} onClick={() => picker.current?.click()} aria-label={"替换 " + image.file.name}>替换图片</Button>
          {!image.excluded && canCompressFolderImage(image.file) && (
            <Button size="small" disabled={disabled} onClick={onCompress} aria-label={"压缩预览 " + image.file.name}>压缩预览</Button>
          )}
          <Button size="small" disabled={disabled} onClick={onToggle} aria-label={(image.excluded ? "恢复 " : "排除 ") + image.file.name}>
            {image.excluded ? "恢复" : "排除"}
          </Button>
        </Space>
      )}
    </li>
  );
}

export function ProductFolderImportModal({ categories, canPublish, canAuthorizeImages, onClose, onChanged }: Props) {
  const { modal } = App.useApp();
  const folderPicker = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<FolderDraft[]>([]);
  const [ignored, setIgnored] = useState(0);
  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<number>();
  const [salesMode, setSalesMode] = useState<SalesMode>("CUSTOM_INQUIRY");
  const [priceMin, setPriceMin] = useState<number | null>(1000);
  const [visibility, setVisibility] = useState<FolderSettings["visibility"]>("PUBLIC");
  const [categoryInference, setCategoryInference] = useState<FolderCategoryInference>();
  const [categoryInferenceAttempted, setCategoryInferenceAttempted] = useState(false);
  const [checked, setChecked] = useState<Map<string, ProductImportCodeConflict | null>>(new Map());
  const [publishKeys, setPublishKeys] = useState<string[]>([]);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [issueFilter, setIssueFilter] = useState("");
  const [jumpTarget, setJumpTarget] = useState("");
  const [compression, setCompression] = useState<CompressionPreview>();
  const importId = useId();
  useEffect(() => {
    if (!jumpTarget) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(jumpTarget);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest" });
      setJumpTarget("");
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpTarget]);
  useEffect(() => () => {
    if (compression) {
      URL.revokeObjectURL(compression.sourceUrl);
      URL.revokeObjectURL(compression.outputUrl);
    }
  }, [compression]);
  const duplicates = useMemo(() => findDuplicateImages(rows), [rows]);
  const localCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows.filter((item) => item.selected || item.id)) {
      const code = row.code.trim().toUpperCase();
      counts.set(code, (counts.get(code) || 0) + 1);
    }
    return counts;
  }, [rows]);
  const imported = rows.filter((row) => row.id);
  const saved = rows.filter((row) => row.saved);
  const pending = rows.filter((row) => !row.saved && row.selected);
  const ready = pending.filter((row) =>
    row.title.trim() && isImportCodeValid(row.code) &&
    localCounts.get(row.code.trim().toUpperCase()) === 1 &&
    (row.id || checked.get(row.code.trim()) === null) &&
    hasReadyGallery(row, duplicates),
  );
  const fresh = ready.filter((row) => !row.issue);
  const retryable = ready.filter((row) => !!row.issue);
  const issues: PendingIssue[] = unassigned.map((path) => ({ type: "未分组", text: path }));
  for (const row of pending) {
    const code = row.code.trim();
    const conflict = row.id ? undefined : checked.get(code);
    if (conflict) {
      issues.push({
        type: "款号冲突", rowKey: row.key,
        text: conflict.removed
          ? `${code} · 款号保留在历史业务记录中`
          : code + " · " + conflict.name + "（" + statusMeta[conflict.status].label + "）",
      });
    } else if ((localCounts.get(code.toUpperCase()) || 0) > 1) {
      issues.push({ type: "款号冲突", rowKey: row.key, text: code + " · 本次导入有相同款号" });
    } else if (!row.title.trim() || !isImportCodeValid(code) || (!row.id && !checked.has(code))) {
      issues.push({ type: "资料待核对", rowKey: row.key, text: row.title + " · 请补齐标题或检查款号" });
    }
    const imageCount = countGalleryImages(row);
    if (imageCount === 0 || imageCount > 9) {
      issues.push({ type: "图片数量", rowKey: row.key, text: code + " · 每款需保留 1 至 9 张图片" });
    }
    for (const image of row.images) {
      if (image.excluded) continue;
      const entry = { rowKey: row.key, imageKey: image.key };
      if (image.issue) issues.push({
        ...entry, type: canCompressFolderImage(image.file) || image.issue.includes("超过 10 MB") ? "超限" : "图片待核对",
        text: image.file.name + " · " + image.issue,
      });
      const duplicate = duplicates.get(image);
      if (duplicate) issues.push({ ...entry, type: "重复", text: image.file.name + " · 与 " + duplicate + " 内容相同" });
    }
    if (row.issue) issues.push({ type: "保存失败", rowKey: row.key, text: code + " · " + row.issue });
  }
  const issueTypes = [...new Set(issues.map((issue) => issue.type))];
  const visibleIssues = issues.filter((issue) => !issueTypes.includes(issueFilter) || issue.type === issueFilter);
  const needsCheck = pending.some((row) => !row.id && isImportCodeValid(row.code) && !checked.has(row.code.trim()));
  const publishable = saved.filter((row) => !row.published);
  const targets = publishable.filter((row) => publishKeys.includes(row.key));
  const missingSettings = [
    !categoryId ? "类目" : "",
    salesMode === "CUSTOM_INQUIRY" && priceMin == null ? "参考起价" : "",
  ].filter(Boolean);
  const settingsReady = missingSettings.length === 0
    && (salesMode !== "CUSTOM_INQUIRY" || (priceMin != null && priceMin >= 0 && priceMin <= 9_999_999));

  function patchRow(key: string, change: (row: FolderDraft) => FolderDraft) {
    setRows((current) => current.map((row) => row.key === key ? change(row) : row));
  }

  function locationId(rowKey: string, imageKey?: string) {
    return importId + "/" + encodeURIComponent(rowKey) + (imageKey === undefined ? "" : "/" + imageKey);
  }

  function openIssue(rowKey: string, imageKey?: string) {
    setActiveKeys((keys) => keys.includes(rowKey) ? keys : [...keys, rowKey]);
    setJumpTarget(locationId(rowKey, imageKey));
  }

  function previewCompression(rowKey: string, source: FolderImage) {
    void operate("正在生成压缩预览…", async () => {
      try {
        const result = await compressFolderImage(source.file);
        if (!mounted.current) return;
        setCompression({
          ...result, source, rowKey,
          sourceUrl: URL.createObjectURL(source.file), outputUrl: URL.createObjectURL(result.file),
        });
      } catch {
        setError("「" + source.file.name + "」无法生成压缩预览，请换用符合大小限制的静态 PNG、JPG 或 WebP 图片。");
      }
    });
  }

  function applyCompression(preview: CompressionPreview) {
    return operate("正在检查压缩图片…", async () => {
      const image = await inspectFolderImage(preview.file, preview.source.key, preview.source.angle);
      if (image.issue) {
        setCompression(undefined);
        setError("压缩后的图片未通过检查，请替换原文件。");
        return;
      }
      patchRow(preview.rowKey, (row) => ({
        ...row, images: row.images.map((entry) => entry.key === image.key
          ? { ...image, sourceFingerprint: preview.source.fingerprint }
          : entry),
      }));
      setCompression(undefined);
    });
  }

  async function operate(label: string, run: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError("");
    try {
      await run();
    } catch (err) {
      setError(getSafeAdminErrorMessage(err, "本次操作未完成，请核对当前结果后重试。"));
    } finally {
      setBusy("");
      lock.current = false;
    }
  }

  async function lookup(batch: FolderDraft[]) {
    const codes = [...new Set(batch.filter((row) => !row.id && isImportCodeValid(row.code)).map((row) => row.code.trim()))];
    const result = new Map<string, ProductImportCodeConflict | null>(codes.map((code) => [code, null]));
    for (let start = 0; start < codes.length; start += 50) {
      const matches = unwrapResponse<ProductImportCodeConflict[]>(await productApi.checkImportCodes(codes.slice(start, start + 50)));
      if (!Array.isArray(matches)) throw new Error("款号检查未返回结果");
      for (const match of matches) result.set(match.requestedCode, match);
    }
    setChecked((previous) => new Map([...previous, ...result]));
    return result;
  }

  function selectFolder(files: File[]) {
    if (!files.length) return;
    void operate("正在读取文件夹并检查款号…", async () => {
      const scanned = await scanProductFolder(files);
      setRows(scanned.rows);
      setIgnored(scanned.ignored);
      setUnassigned(scanned.unassigned);
      setActiveKeys([]);
      setIssueFilter("");
      setChecked(new Map());
      const inferredCategory = inferFolderCategory(scanned.rows, categories);
      setCategoryInference(inferredCategory);
      setCategoryInferenceAttempted(true);
      if (inferredCategory) setCategoryId(inferredCategory.categoryId);
      else setCategoryId(undefined);
      if (scanned.rows.length === 0) {
        setError("没有找到可按款号分组的商品图，请核对文件名。");
        return;
      }
      await lookup(scanned.rows);
    });
  }

  function save(batch: FolderDraft[]) {
    if (!batch.length) return;
    if (!categoryId) {
      setError("保存前请选择类目。");
      return;
    }
    if (salesMode === "CUSTOM_INQUIRY" && (priceMin == null || priceMin < 0 || priceMin > 9_999_999)) {
      setError("定制参考起价须为 0 至 9,999,999 元；填写 0 表示前台不公开参考价。");
      return;
    }
    void operate("正在保存商品草稿…", async () => {
      const request = createFolderImportRequest(() => mounted.current, (seconds) => setBusy("请求较多，" + seconds + " 秒后自动继续保存…"));
      // 写入前再核对一次。创建接口仍以唯一款号约束裁决并发占用。
      const matches = await lookup(pending);
      for (const [index, row] of batch.entries()) {
        if (!row.id && matches.get(row.code.trim())) continue;
        setBusy("正在保存草稿 " + (index + 1) + " / " + batch.length + " · " + row.code);
        await saveFolderDraft(row, { categoryId, salesMode, visibility, ...(salesMode === "CUSTOM_INQUIRY" ? { priceMin } : {}) }, request, (progress) => patchRow(row.key, () => progress));
      }
      onChanged();
      await lookup(pending);
    });
  }

  async function publish(authorizeImages: boolean) {
    await operate("正在上架已选草稿…", async () => {
      const request = createFolderImportRequest(() => mounted.current, (seconds) => setBusy("请求较多，" + seconds + " 秒后自动继续上架…"));
      const completed: string[] = [];
      for (const [index, row] of targets.entries()) {
        const id = row.id;
        if (!id) continue;
        setBusy("正在上架 " + (index + 1) + " / " + targets.length + " · " + row.code);
        let failure = "上架失败。请打开草稿检查主图、素材授权及销售资料后再试。";
        try {
          const current = unwrapResponse<Product>(await request(() => productApi.getById(id)));
          if (current.status !== "DRAFT" && current.status !== "PUBLISHED") {
            patchRow(row.key, (item) => ({ ...item, issue: "当前商品已不是草稿，请在商品管理中处理。" }));
            continue;
          }
          if (current.status === "DRAFT") {
            if (authorizeImages && current.visibility !== "INTERNAL") {
              failure = "图片公开使用确认未完成，请检查媒体库权限或图片状态。";
              const currentIds = new Set(current.images.map((image) => image.id));
              for (const image of row.images) {
                if (image.imageId && currentIds.has(image.imageId) && image.uploaded) {
                  const assetId = image.uploaded.mediaAssetId;
                  await request(() => uploadApi.authorizeMediaPublicUse(assetId, true), "authorize");
                }
              }
            }
            failure = current.salesMode === "DIRECT_PURCHASE"
              ? "直接销售需要有效规格和成交价，请打开草稿补齐后重试。"
              : "上架失败。请打开草稿检查主图和素材授权后再试。";
            await request(() => productApi.updateStatus(id, "PUBLISHED"));
          }
          patchRow(row.key, (item) => ({ ...item, published: true, issue: undefined }));
          completed.push(row.key);
        } catch (err) {
          patchRow(row.key, (item) => ({ ...item, issue: getSafeAdminErrorMessage(err, failure) }));
        }
      }
      setPublishKeys((keys) => keys.filter((key) => !completed.includes(key)));
      onChanged();
    });
  }

  function confirmPublish() {
    if (!canPublish || !targets.length) return;
    let authorizeImages = false;
    modal.confirm({
      title: "确认上架已选的 " + targets.length + " 件商品？",
      content: (
        <Space direction="vertical">
          <span>请先核对草稿内容和可见范围。上架后，商品将按各自的可见范围展示。</span>
          {canAuthorizeImages && (
            <Checkbox onChange={(event) => { authorizeImages = event.target.checked; }}>
              我确认这批导入图片可用于网站展示，并记录素材授权
            </Checkbox>
          )}
        </Space>
      ),
      okText: "确认批量上架",
      cancelText: "取消",
      onOk: () => publish(authorizeImages),
    });
  }

  function close() {
    if (lock.current) return;
    if (!rows.some((row) => !row.saved)) {
      onClose();
      return;
    }
    modal.confirm({
      title: "关闭本次导入？",
      content: "已创建的草稿会保留。关闭后，本次尚未保存的文件选择和导入清单将丢失。",
      okText: "关闭导入",
      cancelText: "继续处理",
      onOk: onClose,
    });
  }

  function rowItems(drafts: FolderDraft[]) {
    return drafts.map((row) => {
      const conflict = !row.id ? checked.get(row.code.trim()) : undefined;
      const localConflict = (localCounts.get(row.code.trim().toUpperCase()) || 0) > 1;
      const readyGallery = hasReadyGallery(row, duplicates);
      const imageCount = countGalleryImages(row);
      const readyRow = ready.includes(row);
      return {
        key: row.key,
        label: (
          <Space wrap className="folder-import__row-summary">
            <strong>{row.code}</strong>
            <span className="folder-import__row-title" title={row.title || row.key}>{row.title || row.key}</span>
            <Tag>{imageCount} 图</Tag>
            <Tag color={row.published ? "green" : row.saved || readyRow ? "blue" : "orange"}>
              {row.published ? "已上架" : row.saved ? "草稿已保存" : !row.selected ? "本次不导入" : readyRow ? "可保存" : "待处理"}
            </Tag>
            {conflict && <Tag color="orange">款号冲突</Tag>}
            {!row.saved && !readyGallery && <Tag color="orange">图片待处理</Tag>}
            {row.issue && <Tag color="orange">{row.saved ? "上架待核对" : "保存待核对"}</Tag>}
          </Space>
        ),
        children: (
          <div className="folder-import__details" id={locationId(row.key)} tabIndex={-1}>
            {row.issue && <Alert showIcon type="warning" message={row.issue} />}
            {row.id && (
              <Link target="_blank" rel="noopener noreferrer" to={"/admin/products/" + row.id + "/edit"}>
                {row.published ? "查看已上架商品" : "打开商品草稿（新标签页）"}
              </Link>
            )}
            {!row.saved && (
              <>
                {!row.id && (
                  <div className="folder-import__fields">
                    <label>商品标题<Input disabled={!!busy} maxLength={200} value={row.title} onChange={(event) => patchRow(row.key, (item) => ({ ...item, title: event.target.value }))} /></label>
                    <label>款号<Input disabled={!!busy} maxLength={50} value={row.code} onChange={(event) => patchRow(row.key, (item) => ({ ...item, code: event.target.value, issue: undefined }))} /></label>
                  </div>
                )}
                {localConflict && <Alert type="warning" message="本次导入有相同款号，请逐件修改。" />}
                {conflict && (
                  <Alert
                    type="warning"
                    message={conflict.removed ? `款号 ${conflict.code} 保留在历史业务记录中，请更换款号。` : (
                      <span>
                        款号 {conflict.code} 已用于
                        {" 「" + conflict.name + "」 · " + (statusMeta[conflict.status]?.label ?? conflict.status) + "。 "}
                        <Link target="_blank" rel="noopener noreferrer" to={conflict.status === "ARCHIVED"
                          ? "/admin/products?status=ARCHIVED&code=" + encodeURIComponent(conflict.code)
                          : "/admin/products/" + conflict.id + "/edit"}>
                          查看冲突商品
                        </Link>
                      </span>
                    )}
                  />
                )}
                {(imageCount === 0 || imageCount > 9) && <Alert type="warning" message="每件商品需保留 1 至 9 张图片。" />}
              </>
            )}
                <ul className="folder-import__files">
                  {row.images.map((image) => (
                    <FolderFileRow
                      key={image.key + "/" + image.path + "/" + image.file.lastModified}
                      image={image}
                      id={locationId(row.key, image.key)}
                      duplicate={duplicates.get(image)}
                      disabled={!!busy || !!row.saved}
                      onToggle={() => patchRow(row.key, (item) => ({
                        ...item, images: item.images.map((entry) => entry.key === image.key ? { ...entry, excluded: !entry.excluded } : entry),
                      }))}
                      onCompress={() => previewCompression(row.key, image)}
                      onReplace={(file) => void operate("正在检查替换图片…", async () => {
                        const replacement = await inspectFolderImage(file, image.key, image.angle);
                        patchRow(row.key, (item) => ({ ...item, images: item.images.map((entry) => entry.key === image.key ? replacement : entry) }));
                      })}
                    />
                  ))}
                </ul>
          </div>
        ),
        extra: row.published ? undefined : (
          <Checkbox
            checked={row.saved ? publishKeys.includes(row.key) : row.selected}
            disabled={!!busy || (row.saved && !canPublish)}
            aria-label={(row.saved ? "选择上架 " : "选择导入 ") + row.code}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              const selected = event.target.checked;
              if (row.saved) setPublishKeys((keys) => selected ? [...keys, row.key] : keys.filter((key) => key !== row.key));
              else {
                patchRow(row.key, (item) => ({ ...item, selected }));
                if (selected && !row.id && isImportCodeValid(row.code) && !checked.has(row.code.trim())) {
                  void operate("正在检查款号…", async () => { await lookup([row]); });
                }
              }
            }}
          />
        ),
      };
    });
  }

  return (
    <>
    <Modal title="按文件夹导入商品草稿" open width={900} onCancel={close} maskClosable={false} closable={!busy}
      footer={<Button disabled={!!busy} onClick={close}>关闭</Button>}>
      <div className="folder-import">
        <Typography.Text type="secondary" className="folder-import__intro">
          根据文件夹和文件名提取款号、标题、类目，并整理图片顺序。保存后仍可修改。
        </Typography.Text>
        <div className="folder-import__picker-row">
          <input
            type="file"
            ref={folderPicker}
            hidden
            aria-label="选择商品图片文件夹"
            {...{ webkitdirectory: "", directory: "" }}
            multiple
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              selectFolder(files);
            }}
          />
          <Button disabled={!!busy || imported.length > 0} onClick={() => folderPicker.current?.click()}>
            {rows.length ? "重新选择文件夹" : "选择文件夹"}
          </Button>
          {rows.length > 0 && (
            <div className="folder-import__stats" role="status" aria-label={`识别 ${rows.length} 款，已选 ${pending.length} 款，${ready.length} 款可保存`}>
              <span><strong>{rows.length}</strong> 识别</span>
              <span><strong>{pending.length}</strong> 已选</span>
              <span className={ready.length ? "is-ready" : ""}><strong>{ready.length}</strong> 可保存</span>
            </div>
          )}
        </div>
        {busy && <Alert type="info" showIcon message={<span role="status">{busy}</span>} />}
        {error && <Alert type="error" showIcon message={error} />}
        {ignored > 0 && <Tag>已跳过 {ignored} 个非图片文件</Tag>}
        {issues.length > 0 && (
          <section className="folder-import__issues" aria-label="待处理清单">
            <div className="folder-import__section-heading">
              <span><strong>待处理</strong><Tag color={issues.length ? "orange" : "green"}>{issues.length}</Tag></span>
              {issues.length > 0 && (
                <Select aria-label="问题类型" disabled={!!busy}
                  value={issueTypes.includes(issueFilter) ? issueFilter : ""}
                  options={[{ value: "", label: "全部问题" }, ...issueTypes.map((type) => ({ value: type, label: type }))]}
                  onChange={setIssueFilter} />
              )}
            </div>
            {visibleIssues.length > 0 && (
              <ul className="folder-import__issue-list">
                {visibleIssues.map(({ type, text, rowKey, imageKey }) => (
                  <li key={JSON.stringify([type, rowKey, imageKey, rowKey === undefined ? text : undefined])}>
                    <Tag color="orange">{type}</Tag>
                    {rowKey === undefined
                      ? <span>{text} · 请核对文件名或格式</span>
                      : <Button type="link" size="small" className="folder-import__preview-button" disabled={!!busy}
                        onClick={() => openIssue(rowKey, imageKey)}>{text}</Button>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {rows.length > 0 && (
          <>
            <section className="folder-import__settings" aria-label="批量设置">
              <div className="folder-import__section-heading">
                <span><strong>批量设置</strong><Tag color="blue">已预填</Tag></span>
              </div>
              <div className="folder-import__fields">
                <label>类目<Select aria-label="统一类目" showSearch optionFilterProp="label" options={categories} value={categoryId} onChange={(value) => { setCategoryId(value); setCategoryInference(undefined); }} disabled={!!busy || imported.length > 0} placeholder="选择类目" /></label>
                <label>销售方式<Select aria-label="统一销售方式" options={Object.entries(salesModeLabels).map(([value, label]) => ({ value, label }))} value={salesMode} onChange={(value) => { setSalesMode(value); if (value === "CUSTOM_INQUIRY" && priceMin == null) setPriceMin(1000); else if (value !== "CUSTOM_INQUIRY") setPriceMin(null); }} disabled={!!busy || imported.length > 0} /></label>
                {salesMode === "CUSTOM_INQUIRY" ? <label>参考起价<InputNumber aria-label="统一定制参考起价" min={0} max={9_999_999} precision={2} value={priceMin} onChange={setPriceMin} suffix="元起" disabled={!!busy || imported.length > 0} /><span className="folder-import__field-help">前台参考价，非成交价</span></label> : null}
                <label>可见范围<Select aria-label="上架后可见范围" options={visibilityOptions} value={visibility} onChange={setVisibility} disabled={!!busy || imported.length > 0} /></label>
              </div>
              {categoryInference && (
                <div className="folder-import__auto-summary" role="status">
                  <Tag color="green">自动识别</Tag>
                  <strong>{categoryInference.categoryLabel}</strong>
                  <span>来自“{categoryInference.keyword}” · {categoryInference.matchedRows}/{categoryInference.totalRows} 款</span>
                </div>
              )}
              {categoryInferenceAttempted && !categoryInference && !categoryId && (
                <div className="folder-import__compact-notice is-warning">类目未识别，请选择一次；混合类目建议分批导入。</div>
              )}
              {!settingsReady && (
                <div className="folder-import__compact-notice is-warning">还需确认：{missingSettings.join("、")}</div>
              )}
            </section>
            {rows.some((row) => !row.saved) && (
              <>
                <Space wrap className="folder-import__actions">
                  <Button disabled={!!busy || !pending.length} onClick={() => void operate("正在检查款号…", async () => { await lookup(pending); })}>
                    重新检查款号
                  </Button>
                  <Button type="primary" disabled={!!busy || !settingsReady || !fresh.length} onClick={() => save(fresh)}>保存草稿 · {fresh.length}</Button>
                  {pending.some((row) => !!row.issue) && (
                    <Button disabled={!!busy || !settingsReady || !retryable.length} onClick={() => save(retryable)}>
                      重试失败项（{retryable.length} 件）
                    </Button>
                  )}
                  {needsCheck && <span>款号变更后，请重新检查。</span>}
                </Space>
                <Collapse collapsible="header" activeKey={activeKeys} onChange={setActiveKeys} items={rowItems(rows.filter((row) => !row.saved))} />
              </>
            )}
            {saved.length > 0 && (
              <>
                <Typography.Title level={5}>核对已保存的草稿（{saved.length} 件）</Typography.Title>
                <Space wrap>
                  <span role="status">已上架 {saved.length - publishable.length} 件</span>
                  {canPublish && (
                    <>
                      <Checkbox disabled={!!busy || !publishable.length} checked={!!publishable.length && targets.length === publishable.length}
                        indeterminate={targets.length > 0 && targets.length < publishable.length}
                        onChange={(event) => setPublishKeys(event.target.checked ? publishable.map((row) => row.key) : [])}>
                        选择全部待上架草稿
                      </Checkbox>
                      <Button type="primary" disabled={!!busy || !targets.length} onClick={confirmPublish}>批量上架（{targets.length} 件）</Button>
                    </>
                  )}
                </Space>
                <Collapse collapsible="header" items={rowItems(saved)} />
              </>
            )}
          </>
        )}
      </div>
    </Modal>
    {compression && (
      <Modal title="压缩图片预览" open width={760}
        onCancel={() => setCompression(undefined)}
        onOk={() => applyCompression(compression)}
        cancelText="保留原图" okText="使用压缩图" confirmLoading={!!busy} maskClosable={false}>
        <Typography.Paragraph>{compression.source.file.name}</Typography.Paragraph>
        <div className="folder-import__comparison">
          <figure>
            <img src={compression.sourceUrl} alt="压缩前原图" />
            <figcaption>原图 · {formatImageSize(compression.source.file)} · {compression.original.width} × {compression.original.height}</figcaption>
          </figure>
          <figure>
            <img src={compression.outputUrl} alt="压缩后图片" />
            <figcaption>WebP · {formatImageSize(compression.file)} · {compression.output.width} × {compression.output.height}</figcaption>
          </figure>
        </div>
      </Modal>
    )}
    </>
  );
}
