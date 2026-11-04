/**
 * MediaPickerField.tsx — Puck 自定义媒体字段
 *
 * 交互模型：
 * 1. 有图时只保留一个等比例预览；点击预览或“更换图片”共用同一文件选择器；
 * 2. URL 态：清空输入后确认 = 清除图片（不再无动作）；
 * 3. value 外部变化（撤销/预设/载入方案）自动收起所有临时面板；
 * 4. 操作按钮全部带文字：更换 / 链接 / 删除(danger)。
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { App as AntdApp, Upload, Button, Input, type InputRef } from "antd";
import {
  InboxOutlined,
  LinkOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  PictureOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { uploadApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { ratioLabelOf } from "@/page-builder/config/imageSpecs";
import { useImageNaturalSize } from "./specCheck";
import {
  addPageMediaItem,
  PAGE_MEDIA_LIBRARY_CHANGED_EVENT,
  readPageMediaLibrary,
  type PageMediaItem,
} from "./pageMediaLibrary";
import {
  describeImageSlotAdvice,
  designCanvasWidthOnDevice,
  parseFrameAspect,
} from "../config/imageDeliveryGeometry";
import { cachedImageFactFields, trustedDisplaySize } from "./trustedMediaSize";
import { resolveManagedTemplateMediaPreviewUrl } from "../template-definition/managedMediaPreview";
import ImageFocusPad from "../inspector/controls/ImageFocusPad";
import SharedPageMediaPicker from "./SharedPageMediaPicker";
import { type MediaSpec } from "./mediaSpec";

export const SESSION_MEDIA_UPLOADED_EVENT = "page-builder:media-uploaded";

function isManagedPageAssetUrl(url: string): boolean {
  const path = url.trim().split(/[?#]/, 1)[0];
  if (!path.startsWith("/uploads/page-assets/") || path.includes("\\")) return false;
  const segments = path.slice("/uploads/".length).split("/");
  return segments.length >= 2
    && segments.every((segment) => segment && segment !== "." && segment !== "..");
}

function useLibraryMediaItem(url: string): PageMediaItem | null {
  const [items, setItems] = useState<PageMediaItem[]>(() => readPageMediaLibrary());
  useEffect(() => {
    const sync = () => setItems(readPageMediaLibrary());
    window.addEventListener(PAGE_MEDIA_LIBRARY_CHANGED_EVENT, sync);
    window.addEventListener(SESSION_MEDIA_UPLOADED_EVENT, sync);
    return () => {
      window.removeEventListener(PAGE_MEDIA_LIBRARY_CHANGED_EVENT, sync);
      window.removeEventListener(SESSION_MEDIA_UPLOADED_EVENT, sync);
    };
  }, []);
  const path = url.split("?")[0];
  if (!path) return null;
  return items.find((item) => item.url.split("?")[0] === path) ?? null;
}

type MediaFactsFetchState = "idle" | "loading" | "ready" | "unknown" | "error";

/** 本地缓存只作初值；缺尺寸时经受控只读接口补事实，迟到响应不覆盖后来选中的图。 */
function useResolvedMediaSource(
  url: string,
  cached: PageMediaItem | null,
  enabled: boolean,
): {
  source: { displayWidth: number; displayHeight: number; animated?: boolean } | null;
  fetchState: MediaFactsFetchState;
  retry: () => void;
} {
  const [remote, setRemote] = useState<PageMediaItem | null>(null);
  const [fetchState, setFetchState] = useState<MediaFactsFetchState>(() => (
    trustedDisplaySize(cached) ? "ready" : "idle"
  ));
  const [retryToken, setRetryToken] = useState(0);
  const requestSeq = useRef(0);

  useEffect(() => {
    setRemote(null);
    if (!enabled || !url) {
      setFetchState("idle");
      return;
    }
    if (trustedDisplaySize(cached)) {
      setFetchState("ready");
      return;
    }
    if (!isManagedPageAssetUrl(url)) {
      setFetchState("unknown");
      return;
    }
    const seq = ++requestSeq.current;
    const requestedUrl = url.split("?")[0];
    setFetchState("loading");
    let cancelled = false;
    void (async () => {
      try {
        const result = await uploadApi.getPageMediaByUrl(url);
        const data = unwrapResponse<PageMediaAssetLike>(result);
        if (cancelled || requestSeq.current !== seq) return;
        const currentPath = url.split("?")[0];
        if (currentPath !== requestedUrl) return;
        const trusted = trustedDisplaySize(data);
        if (trusted && data?.url) {
          const item: PageMediaItem = {
            url: data.url,
            type: "image",
            name: data.name || "页面图片",
            createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
            ...cachedImageFactFields({ ...data, ...trusted, metadataStatus: "measured" }),
          };
          addPageMediaItem(item);
          setRemote(item);
          setFetchState("ready");
          return;
        }
        setRemote(null);
        setFetchState("unknown");
      } catch {
        if (cancelled || requestSeq.current !== seq) return;
        setRemote(null);
        setFetchState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, cached?.displayWidth, cached?.displayHeight, cached?.metadataStatus, cached?.mediaRevision, enabled, retryToken]);

  const trustedCached = trustedDisplaySize(cached);
  const trustedRemote = trustedDisplaySize(remote);
  const sourceItem = trustedCached ? cached : trustedRemote ? remote : null;
  const sourceSize = trustedCached ?? trustedRemote;
  return {
    source: sourceItem && sourceSize
      ? {
        displayWidth: sourceSize.displayWidth,
        displayHeight: sourceSize.displayHeight,
        animated: sourceItem.animated,
      }
      : null,
    fetchState,
    retry: () => setRetryToken((token) => token + 1),
  };
}

type PageMediaAssetLike = {
  url?: string;
  name?: string;
  width?: number;
  height?: number;
  displayWidth?: number;
  displayHeight?: number;
  animated?: boolean;
  metadataStatus?: "measured" | "unknown";
  mediaRevision?: string;
  createdAt?: string;
};

export type { MediaSpec } from "./mediaSpec";
export { mediaSpecFromRecommendation, mediaSpecMatchingFrame } from "./mediaSpec";

interface MediaPickerFieldProps {
  /** 用于属性面板导览定位当前上传卡片 */
  fieldKey?: string;
  /** 当前素材所属终端；用于在属性面板按设备过滤字段 */
  device?: "desktop" | "mobile" | "shared";
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** 推荐尺寸信息（来自 IMAGE_SPECS） */
  spec?: MediaSpec;
  /** 是否必须填写 */
  required?: boolean;
  /** 占位提示 */
  placeholder?: string;
  /**
   * 右侧素材卡按模板实际容器比例模拟裁切；不传时仍展示完整原图。
   * 值采用 CSS aspect-ratio 语法，例如 "16 / 9"。
   */
  previewAspectRatio?: string;
  /** 与画布相同的图片焦点坐标（百分比） */
  previewFocus?: { x: number; y: number };
  previewFit?: "cover" | "contain" | "fill";
  previewZoom?: number;
  /** 在预览上拖动焦点；提供后预览不再兼作更换图片入口。 */
  onFocusChange?: (next: { x: number; y: number }) => void;
  /** 同一页面同时出现两块取景板时，用来区分无障碍名称。 */
  focusAriaLabel?: string;
  focusDisabled?: boolean;
  /** 当前画布这一端的画框，例如 4:3、4:5。有值时信息行显示画框，不再显示文件自身比例。 */
  frameLabel?: string;
  /**
   * 当前端还没有自己的文件时，用这张图显示效果。
   * 替换、链接仍通过 onChange 写入当前端；删除只在已有自己的文件时出现。
   */
  fallbackSrc?: string;
  /** 打开页面素材选择区。 */
  onOpenPageMedia?: () => void;
  pageMediaOpen?: boolean;
  /** 参考图对应的媒体任务布局：保留真实上传链路，只改变信息层级。 */
  taskPresentation?: boolean;
  /** 仅把本地图片读入当前内存会话，不上传、不登记到页面素材库。 */
  sessionOnly?: boolean;
}

export default function MediaPickerField({
  fieldKey,
  device = "shared",
  value,
  onChange,
  readOnly,
  spec,
  required,
  placeholder,
  previewAspectRatio,
  previewFocus,
  previewFit,
  previewZoom,
  onFocusChange,
  focusAriaLabel,
  focusDisabled = false,
  frameLabel,
  fallbackSrc,
  onOpenPageMedia,
  pageMediaOpen = false,
  taskPresentation = false,
  sessionOnly = false,
}: MediaPickerFieldProps) {
  const { message, modal } = AntdApp.useApp();
  /** 上传区比例后缀：一律由规格派生,schema 的 placeholder 只写人话不写比例 */
  const ratioSuffix = spec ? `（${ratioLabelOf(spec)}）` : "";
  /** URL 输入态：可从更换面板或空态进入 */
  const [urlMode, setUrlMode] = useState(false);
  const [urlInput, setUrlInput] = useState(value || "");
  const [uploading, setUploading] = useState(false);
  const [builtinPageMediaOpen, setBuiltinPageMediaOpen] = useState(false);
  const usesBuiltinPageMedia = !sessionOnly && !onOpenPageMedia;
  const openPageMedia = onOpenPageMedia ?? (usesBuiltinPageMedia
    ? () => setBuiltinPageMediaOpen((open) => !open)
    : undefined);
  const pageMediaExpanded = onOpenPageMedia ? pageMediaOpen : builtinPageMediaOpen;
  const ownValue = value?.trim() ?? "";
  const inheritedValue = fallbackSrc?.trim() ?? "";
  const displayValue = ownValue || inheritedValue;
  const previewSrc = resolveManagedTemplateMediaPreviewUrl(displayValue);
  const imgSize = useImageNaturalSize(previewSrc);
  const hasOwnValue = ownValue.length > 0;
  const usingInherited = !hasOwnValue && inheritedValue.length > 0;
  const libraryItem = useLibraryMediaItem(displayValue);
  const {
    source: measuredSource,
    fetchState: factsFetchState,
    retry: retryFacts,
  } = useResolvedMediaSource(displayValue, libraryItem, !sessionOnly && Boolean(displayValue));
  const deliveryDevice = device === "mobile" ? "mobile" : "desktop";
  const frameAspect = parseFrameAspect(frameLabel)
    ?? parseFrameAspect(previewAspectRatio)
    ?? parseFrameAspect(spec?.ratio);
  const canvasWidth = spec?.designCanvasWidth ?? spec?.width;
  const designWidth = canvasWidth && canvasWidth > 0
    ? designCanvasWidthOnDevice(deliveryDevice, canvasWidth)
    : undefined;
  const designHeight = designWidth && frameAspect
    ? designWidth * frameAspect.height / frameAspect.width
    : undefined;
  const advice = describeImageSlotAdvice({
    device: deliveryDevice,
    designWidth,
    designHeight,
    uploadWidth: spec?.width,
    uploadHeight: spec?.height,
    designCanvasWidth: spec?.designCanvasWidth,
    frameAspect,
    objectFit: previewFit ?? "cover",
    authorScale: previewZoom,
    source: measuredSource,
    inherited: usingInherited,
  });
  const hasQualityWarning = Boolean(displayValue && (advice.pixelsLow || advice.cropHeavy));
  const qualityState = imgSize.error
    ? "error"
    : factsFetchState === "error"
      ? "error"
      : hasQualityWarning
        ? "warning"
        : measuredSource
          ? "good"
          : displayValue
            ? "loading"
            : "idle";
  const sourcePixelsLabel = factsFetchState === "loading" && !measuredSource
    ? `${usingInherited ? "沿用桌面图。" : ""}正在读取原图像素…`
    : factsFetchState === "error" && !measuredSource
      ? `${usingInherited ? "沿用桌面图。" : ""}原图像素读取失败。可重试，或打开本页图片后再检测。`
      : factsFetchState === "unknown" && !measuredSource
        ? `${usingInherited ? "沿用桌面图。" : ""}原图像素未知。外链或不在本站素材库中的图无法自动检测。`
        : advice.source;
  const inputRef = useRef<InputRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasValue = displayValue.length > 0;
  const isEmpty = !hasValue;
  const hasCropPreview = Boolean(previewAspectRatio);
  const focusX = Math.min(100, Math.max(0, previewFocus?.x ?? 50));
  const focusY = Math.min(100, Math.max(0, previewFocus?.y ?? 50));

  /* value 外部变化（上传成功 / URL 确认 / 撤销 / 预设 / 载入方案）→ 收起全部临时面板 */
  useEffect(() => {
    setUrlMode(false);
    setUrlInput(value || "");
  }, [value]);

  const selectPageMedia = (nextValue: string) => {
    setBuiltinPageMediaOpen(false);
    onChange?.(nextValue);
  };

  /* ── 上传 ── */
  const handleUpload = async (file: File) => {
    const isImage = file.type.startsWith("image/");
    if (!isImage) {
      message.error("只能上传图片文件");
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      message.error("图片不能超过 10MB");
      return false;
    }

    setUploading(true);
    try {
      if (sessionOnly) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener("load", () => (
            typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("invalid result"))
          ));
          reader.addEventListener("error", () => reject(reader.error ?? new Error("read failed")));
          reader.readAsDataURL(file);
        });
        onChange?.(dataUrl);
        message.success("图片已载入本次试排");
        return false;
      }
      const result = await uploadApi.uploadImage(file);
      const data = unwrapResponse<{
        url: string;
        width?: number;
        height?: number;
        displayWidth?: number;
        displayHeight?: number;
        animated?: boolean;
        metadataStatus?: "measured" | "unknown";
        mediaRevision?: string;
      }>(result);
      const finalUrl = data?.url;
      if (finalUrl) {
        const facts = cachedImageFactFields(data ?? {});
        if (facts.metadataStatus === "measured" || facts.metadataStatus === "unknown") {
          addPageMediaItem({
            url: finalUrl,
            type: "image",
            name: file.name || "未命名图片",
            createdAt: new Date().toISOString(),
            ...facts,
          });
        }
        window.dispatchEvent(new CustomEvent(SESSION_MEDIA_UPLOADED_EVENT));
        onChange?.(finalUrl);
        message.success("上传成功");
      } else {
        message.error("上传返回结果异常");
      }
    } catch {
      message.error(sessionOnly ? "图片读取失败，请重试" : "上传失败，请重试");
    } finally {
      setUploading(false);
    }
    return false;
  };

  const openFilePicker = () => {
    if (!uploading && !readOnly) fileInputRef.current?.click();
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void handleUpload(file);
  };

  /* ── URL 输入：清空 + 确认 = 清除图片 ── */
  const confirmUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      onChange?.("");
      return;
    }
    const isManagedPath = trimmed.startsWith("/")
      && !trimmed.startsWith("//")
      && !trimmed.includes("\\")
      && !trimmed.split(/[?#]/, 1)[0].split("/").includes("..");
    let isHttpsUrl = false;
    try {
      const parsed = new URL(trimmed);
      isHttpsUrl = parsed.protocol === "https:" && Boolean(parsed.hostname);
    } catch {
      isHttpsUrl = false;
    }
    if (!isManagedPath && !isHttpsUrl) {
      message.error("图片链接必须是本站路径或完整的 HTTPS 地址");
      return;
    }
    onChange?.(trimmed);
    if (isHttpsUrl) {
      message.warning(sessionOnly
        ? "外链图片只用于本次试排，刷新或重开后消失"
        : "外链图片仅用于草稿预览；发布前请使用“更换图片”上传到本站");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") confirmUrl();
  };

  /* ── 清除 ── */
  const handleClear = () => {
    const doClear = () => onChange?.("");
    if (required) {
      modal.confirm({
        title: "删除这张图片？",
        content: "该图片为必填项，删除后请重新上传或填写链接。",
        okText: "删除",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: doClear,
      });
    } else {
      doClear();
    }
  };

  return (
    <div
      className={`homepage-editor__media-picker${taskPresentation ? " is-task-presentation" : ""}`}
      data-media-field={fieldKey}
      data-media-device={device}
      data-media-inherited={usingInherited ? "true" : undefined}
      data-media-frame={frameLabel || undefined}
      data-workspace-field-control="media-picker"
      data-workspace-field-shared="true"
      data-has-page-media={!sessionOnly && Boolean(openPageMedia) ? "true" : "false"}
      data-media-session-only={sessionOnly ? "true" : undefined}
      tabIndex={fieldKey ? -1 : undefined}
    >
      {!readOnly ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFileInputChange}
        />
      ) : null}
      {/* ═══ 预览（有图时的默认态） ═══ */}
      {hasValue && (
        <div>
          {onFocusChange && !imgSize.error ? (
            <>
              <ImageFocusPad
                value={{ x: focusX, y: focusY }}
                disabled={Boolean(readOnly || uploading || focusDisabled)}
                previewSrc={previewSrc}
                previewAlt="预览"
                previewFit={previewFit ?? (hasCropPreview ? "cover" : "contain")}
                previewZoom={previewZoom}
                previewAspectRatio={previewAspectRatio}
                ariaLabel={focusAriaLabel ?? "拖动调整画面焦点"}
                onChange={onFocusChange}
              />
              <p className="image-focus-pad__hint">拖动画面中的点调整构图；更换图片请用下方按钮。</p>
            </>
          ) : (
          <button
            type="button"
            className="homepage-editor__media-preview-trigger"
            aria-label="点击更换当前图片"
            title="点击更换当前图片"
            disabled={Boolean(readOnly || uploading)}
            onClick={openFilePicker}
          >
            <div
              className={`homepage-editor__media-preview-img${hasCropPreview ? " is-crop-preview" : ""}`}
              style={hasCropPreview ? { aspectRatio: previewAspectRatio } : undefined}
            >
              <img
                src={previewSrc}
                alt="预览"
                style={{
                  objectFit: hasCropPreview ? "cover" : "contain",
                  ...(previewFit ? { objectFit: previewFit } : {}),
                  objectPosition: `${focusX}% ${focusY}%`,
                  transform: `scale(${Math.min(2, Math.max(1, previewZoom ?? 1))})`,
                  transformOrigin: `${focusX}% ${focusY}%`,
                  width: "100%",
                  height: "100%",
                  background: "#F4F5F5",
                  // 复用素材探测状态，替换成功后恢复；不遗留 DOM 上的隐藏样式。
                  display: imgSize.error ? "none" : undefined,
                }}
              />
              {imgSize.error ? (
                <div
                  className="homepage-editor__media-preview-error"
                  role="alert"
                >
                  <ExclamationCircleOutlined />
                  <strong>当前图片暂不可用</strong>
                  <span>请替换图片，或检查图片链接是否仍然有效。</span>
                </div>
              ) : null}
            </div>
          </button>
          )}
          {taskPresentation && spec ? (
            <p className="homepage-editor__media-recommendation">
              建议 {spec.width} × {spec.height} · {spec.ratio} · 2K+
            </p>
          ) : null}
          {!readOnly && (
            <div
              className="homepage-editor__media-preview-actions"
              data-has-page-media={!taskPresentation && openPageMedia ? "true" : "false"}
            >
              <Button
                size="small"
                icon={<SwapOutlined />}
                disabled={uploading}
                onClick={openFilePicker}
                title="选择新图片替换当前图片"
              >
                {taskPresentation ? "更换图片" : "替换图片"}
              </Button>
              {taskPresentation || openPageMedia ? (
                <Button
                  size="small"
                  icon={<PictureOutlined />}
                  className={pageMediaExpanded ? "is-active" : undefined}
                  aria-label={taskPresentation ? "选择本页图片" : "本页图片"}
                  aria-pressed={pageMediaExpanded}
                  disabled={!openPageMedia}
                  onClick={openPageMedia}
                >
                  {taskPresentation ? "选择本页图片" : "本页图片"}
                </Button>
              ) : null}
              <Button
                size="small"
                icon={<LinkOutlined />}
                className={taskPresentation ? "is-secondary-media-action" : undefined}
                onClick={() => {
                  setUrlMode(true);
                }}
                title="输入或清除图片链接"
              >
                图片链接
              </Button>
              {hasOwnValue ? (
                <details className="homepage-editor__media-more-actions">
                  <summary aria-label="更多图片操作">更多</summary>
                  <div>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={handleClear}
                    >
                      删除图片
                    </Button>
                  </div>
                </details>
              ) : null}
            </div>
          )}
          <dl
            className="homepage-editor__media-facts"
            data-media-quality={qualityState}
            aria-label="图片信息"
            role="status"
          >
            <div>
              <dt>设计画框</dt>
              <dd data-image-design="true">{advice.design}</dd>
            </div>
            <div>
              <dt>原图像素</dt>
              <dd data-image-source-pixels="true" data-media-facts-state={factsFetchState}>
                {sourcePixelsLabel}
                {(factsFetchState === "error" || (factsFetchState === "unknown" && isManagedPageAssetUrl(displayValue))) && !measuredSource && !readOnly ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="homepage-editor__media-facts-retry"
                      onClick={retryFacts}
                    >
                      重试
                    </button>
                  </>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>清晰度</dt>
              <dd data-image-sharpness="true">{advice.sharpness}</dd>
            </div>
            <div>
              <dt>构图</dt>
              <dd data-image-crop="true">{advice.crop}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* ═══ URL 输入态（可来自更换面板或空态） ═══ */}
      {urlMode && !readOnly && (
        <div style={{ display: "grid", gap: 8, marginTop: hasValue ? 8 : 0 }}>
          <Input
            ref={inputRef}
            value={urlInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setUrlInput(e.target.value)
            }
            onKeyDown={handleKeyDown}
            placeholder="输入图片 URL；清空后确认 = 删除图片"
            size="small"
            allowClear
          />
          <small className="homepage-editor__media-url-hint">
            {sessionOnly
              ? "图片链接只用于本次编辑，刷新或重开模板后消失。"
              : "HTTPS 外链可用于草稿预览；正式发布前需上传到本站，避免失效或被第三方撤回。"}
          </small>
          <div style={{ display: "flex", gap: 6 }}>
            <Button size="small" type="primary" ghost onClick={confirmUrl}>
              确认
            </Button>
            <Button
              size="small"
              onClick={() => {
                setUrlMode(false);
                setUrlInput(value || "");
              }}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* ═══ 空态上传（无图且不在 URL 态） ═══ */}
      {isEmpty && !readOnly && !urlMode && (
        <>
          <Upload.Dragger
            accept="image/*"
            showUploadList={false}
            beforeUpload={(file) => {
              void handleUpload(file);
              return false;
            }}
            disabled={uploading}
            style={{
              minHeight: taskPresentation ? 188 : 116,
              padding: taskPresentation ? "28px 16px" : "16px 12px",
              border: "1px dashed #B8BEC1",
              borderRadius: 5,
              background: "#FFFFFF",
            }}
          >
            <InboxOutlined style={{ color: "var(--adm-action, #5F6568)", fontSize: 22 }} />
            <div style={{ marginTop: 8, color: "#181A1B", fontSize: 13 }}>
              {uploading
                  ? sessionOnly ? "图片读取中…" : "图片上传中…"
                : taskPresentation
                  ? "拖入图片，或点击选择文件"
                  : `${placeholder || "拖入图片或点击上传"}${ratioSuffix}`}
            </div>
            <div style={{ marginTop: 4, color: "#6E7477", fontSize: 11 }}>
              {taskPresentation ? `${ratioSuffix || "推荐使用高分辨率图片"} · 单张 ≤ 10MB` : "仅图片，单张 ≤ 10MB"}
            </div>
          </Upload.Dragger>
          {taskPresentation && spec ? (
            <p className="homepage-editor__media-recommendation">
              建议 {spec.width} × {spec.height} · {spec.ratio} · 2K+
            </p>
          ) : null}
          {taskPresentation ? (
            <div className="homepage-editor__media-empty-actions">
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  void handleUpload(file);
                  return false;
                }}
                disabled={uploading}
              >
                <Button size="small" icon={<PictureOutlined />} disabled={uploading}>
                  上传图片
                </Button>
              </Upload>
              <Button
                size="small"
                icon={<PictureOutlined />}
                disabled={!openPageMedia}
                className={pageMediaExpanded ? "is-active" : undefined}
                aria-label="选择本页图片"
                aria-pressed={pageMediaExpanded}
                onClick={openPageMedia}
              >
                选择本页图片
              </Button>
              <button
                type="button"
                className="homepage-editor__media-link-entry"
                onClick={() => setUrlMode(true)}
              >
                粘贴图片链接
              </button>
            </div>
          ) : (
            <div
              className="homepage-editor__media-alt-actions"
              style={{ marginTop: 6 }}
            >
              {openPageMedia ? (
                <Button
                  size="small"
                  icon={<PictureOutlined />}
                  className={pageMediaExpanded ? "is-active" : undefined}
                  aria-label="本页图片"
                  aria-pressed={pageMediaExpanded}
                  onClick={openPageMedia}
                >
                  本页图片
                </Button>
              ) : null}
              <button
                type="button"
                onClick={() => setUrlMode(true)}
                style={{
                  border: 0,
                  background: "transparent",
                  color: "#6E7477",
                  cursor: "pointer",
                  fontSize: 11,
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                或粘贴图片链接
              </button>
            </div>
          )}
        </>
      )}

      {displayValue && hasQualityWarning && !imgSize.error ? (
        <div className="homepage-editor__media-warning" role="alert">
          <ExclamationCircleOutlined aria-hidden="true" />
          <span>
            {advice.pixelsLow ? advice.sharpness : advice.crop}
          </span>
          <details>
            <summary>查看图片信息</summary>
            <p>{advice.source}{advice.design}</p>
          </details>
        </div>
      ) : null}
      {usesBuiltinPageMedia && !readOnly ? (
        <SharedPageMediaPicker
          open={pageMediaExpanded}
          currentValue={value}
          onSelect={selectPageMedia}
        />
      ) : null}
    </div>
  );
}
