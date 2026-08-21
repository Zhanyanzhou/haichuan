/**
 * MediaPickerField.tsx — Puck 自定义媒体字段
 *
 * 交互模型（2026-08-16 重写，修复更换/删除死胡同）：
 * 1. 预览为默认态；点"更换"在预览下方内嵌展开上传区（预览不消失），可取消；
 * 2. URL 态：清空输入后确认 = 清除图片（不再无动作）；
 * 3. value 外部变化（撤销/预设/载入方案）自动收起所有临时面板；
 * 4. 操作按钮全部带文字：更换 / 链接 / 删除(danger)。
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Upload, Button, Input, Modal, message } from "antd";
import {
  InboxOutlined,
  LinkOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { uploadApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { ratioLabelOf } from "@/page-builder/config/imageSpecs";
import { sizeMatchStatus, useImageNaturalSize } from "./specCheck";

export const SESSION_MEDIA_UPLOADED_EVENT = "page-builder:media-uploaded";
export const sessionUploadedMedia = new Set<string>();

export interface MediaSpec {
  width: number;
  height: number;
  ratio: string;
  label: string;
}

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
  previewFit?: "cover" | "contain";
  previewZoom?: number;
  /** 更换区开合状态，用于让上层只在换图任务中显示可复用素材。 */
  onReplaceOpenChange?: (open: boolean) => void;
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
  onReplaceOpenChange,
}: MediaPickerFieldProps) {
  /** 更换面板：在预览下方内嵌展开，预览保持可见 */
  const [replaceOpen, setReplaceOpen] = useState(false);
  /** 上传区比例后缀：一律由规格派生,schema 的 placeholder 只写人话不写比例 */
  const ratioSuffix = spec ? `（${ratioLabelOf(spec)}）` : "";
  /** URL 输入态：可从更换面板或空态进入 */
  const [urlMode, setUrlMode] = useState(false);
  const [urlInput, setUrlInput] = useState(value || "");
  const [uploading, setUploading] = useState(false);
  const imgSize = useImageNaturalSize(value);
  const matchStatus = sizeMatchStatus(spec, imgSize.width, imgSize.height);
  const resolutionTooSmall = Boolean(
    spec && imgSize.loaded &&
      (imgSize.width < spec.width * 0.75 || imgSize.height < spec.height * 0.75),
  );
  const hasQualityWarning = Boolean(
    imgSize.loaded && (resolutionTooSmall || matchStatus === "watch" || matchStatus === "risk"),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const hasValue = Boolean(value && value.trim().length > 0);
  const isEmpty = !hasValue;
  const hasCropPreview = Boolean(previewAspectRatio);
  const focusX = Math.min(100, Math.max(0, previewFocus?.x ?? 50));
  const focusY = Math.min(100, Math.max(0, previewFocus?.y ?? 50));

  /* value 外部变化（上传成功 / URL 确认 / 撤销 / 预设 / 载入方案）→ 收起全部临时面板 */
  useEffect(() => {
    setReplaceOpen(false);
    setUrlMode(false);
    setUrlInput(value || "");
  }, [value]);

  useEffect(() => {
    onReplaceOpenChange?.(replaceOpen);
  }, [onReplaceOpenChange, replaceOpen]);

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
      const result = await uploadApi.uploadImage(file);
      const data = unwrapResponse<{ url: string }>(result);
      const finalUrl = data?.url || (result as any)?.data?.url;
      if (finalUrl) {
        sessionUploadedMedia.add(finalUrl);
        window.dispatchEvent(new CustomEvent(SESSION_MEDIA_UPLOADED_EVENT));
        onChange?.(finalUrl);
        message.success("上传成功");
      } else {
        message.error("上传返回结果异常");
      }
    } catch {
      message.error("上传失败，请重试");
    } finally {
      setUploading(false);
    }
    return false;
  };

  /* ── URL 输入：清空 + 确认 = 清除图片 ── */
  const confirmUrl = () => {
    const trimmed = urlInput.trim();
    onChange?.(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") confirmUrl();
  };

  /* ── 清除 ── */
  const handleClear = () => {
    const doClear = () => onChange?.("");
    if (required) {
      Modal.confirm({
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
      className="homepage-editor__media-picker"
      data-media-field={fieldKey}
      data-media-device={device}
      tabIndex={fieldKey ? -1 : undefined}
    >
      {/* ═══ 预览（有图时的默认态） ═══ */}
      {hasValue && (
        <div>
          <div
            className={`homepage-editor__media-preview-img${hasCropPreview ? " is-crop-preview" : ""}`}
            style={hasCropPreview ? { aspectRatio: previewAspectRatio } : undefined}
          >
            <img
              src={value}
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
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
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
          {!readOnly && (
            <div className="homepage-editor__media-preview-actions">
              <Button
                size="small"
                icon={<SwapOutlined />}
                onClick={() => setReplaceOpen((open) => !open)}
                title="在下方展开上传区，预览保持可见"
              >
                替换图片
              </Button>
              <Button
                size="small"
                icon={<LinkOutlined />}
                onClick={() => {
                  setUrlMode(true);
                  setReplaceOpen(false);
                }}
                title="输入或清除图片链接"
              >
                图片链接
              </Button>
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
            </div>
          )}
        </div>
      )}

      {/* ═══ 更换面板（预览下方内嵌展开） ═══ */}
      {hasValue && !readOnly && replaceOpen && !urlMode && (
        <div style={{ marginTop: 8 }}>
          <Upload.Dragger
            accept="image/*"
            showUploadList={false}
            beforeUpload={(file) => {
              void handleUpload(file);
              return false;
            }}
            disabled={uploading}
            style={{
              minHeight: 96,
              padding: "12px",
              border: "1px dashed #B8BEC1",
              borderRadius: 5,
              background: "#FFFFFF",
            }}
          >
            <InboxOutlined style={{ color: "var(--adm-action, #5F6568)", fontSize: 20 }} />
            <div style={{ marginTop: 6, color: "#181A1B", fontSize: 12 }}>
              {uploading ? "图片上传中…" : "拖入新图或点击上传（替换当前图片）"}
            </div>
          </Upload.Dragger>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <Button size="small" type="link" onClick={() => setUrlMode(true)}>
              粘贴链接
            </Button>
            <Button size="small" onClick={() => setReplaceOpen(false)}>
              取消
            </Button>
          </div>
        </div>
      )}

      {/* ═══ URL 输入态（可来自更换面板或空态） ═══ */}
      {urlMode && !readOnly && (
        <div style={{ display: "grid", gap: 8, marginTop: hasValue ? 8 : 0 }}>
          <Input
            ref={inputRef as any}
            value={urlInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setUrlInput(e.target.value)
            }
            onKeyDown={handleKeyDown}
            placeholder="输入图片 URL；清空后确认 = 删除图片"
            size="small"
            allowClear
          />
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
              minHeight: 116,
              padding: "16px 12px",
              border: "1px dashed #B8BEC1",
              borderRadius: 5,
              background: "#FFFFFF",
            }}
          >
            <InboxOutlined style={{ color: "var(--adm-action, #5F6568)", fontSize: 22 }} />
            <div style={{ marginTop: 8, color: "#181A1B", fontSize: 13 }}>
              {uploading
                ? "图片上传中…"
                : `${placeholder || "拖入图片或点击上传"}${ratioSuffix}`}
            </div>
            <div style={{ marginTop: 4, color: "#6E7477", fontSize: 11 }}>
              仅图片，单张 ≤ 10MB
            </div>
          </Upload.Dragger>
          <div
            className="homepage-editor__media-alt-actions"
            style={{ marginTop: 6 }}
          >
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
        </>
      )}

      {spec && hasQualityWarning && !imgSize.error ? (
        <div className="homepage-editor__media-warning" role="alert">
          <ExclamationCircleOutlined aria-hidden="true" />
          <span>
            {resolutionTooSmall
              ? "图片清晰度不足，建议更换更大的图片。"
              : matchStatus === "risk"
                ? "图片比例不适合，建议更换图片或进入设计调整构图。"
                : "图片比例略有偏差，请检查画布裁切结果。"}
          </span>
          <details>
            <summary>查看图片信息</summary>
            <p>当前 {imgSize.width} × {imgSize.height}；建议 {spec.width} × {spec.height}（{spec.ratio}）。</p>
          </details>
        </div>
      ) : null}
    </div>
  );
}
