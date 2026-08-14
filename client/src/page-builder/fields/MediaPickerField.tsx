/**
 * MediaPickerField.tsx — Puck 自定义媒体字段
 *
 * 替代纯文本 URL 输入，提供：
 * 1. 直接上传图片（复用现有 uploadApi）
 * 2. 手动输入 URL（保留兼容）
 * 3. 显示推荐尺寸和当前图片尺寸
 * 4. 图片预览
 */

import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { Upload, Button, Input, message } from "antd";
import {
  InboxOutlined,
  LinkOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { uploadApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";

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
}

/** 图片加载状态检测，返回实际尺寸 */
function useImageSize(url: string | undefined): {
  loaded: boolean;
  width: number;
  height: number;
  error: boolean;
} {
  const [state, setState] = useState({
    loaded: false,
    width: 0,
    height: 0,
    error: false,
  });

  useEffect(() => {
    if (!url || url.trim().length === 0) {
      setState({ loaded: false, width: 0, height: 0, error: false });
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled)
        setState({
          loaded: true,
          width: img.naturalWidth,
          height: img.naturalHeight,
          error: false,
        });
    };
    img.onerror = () => {
      if (!cancelled)
        setState({ loaded: false, width: 0, height: 0, error: true });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}

/** 对比推荐尺寸与实际尺寸，返回匹配状态 */
function sizeMatchStatus(
  spec: MediaSpec | undefined,
  actualWidth: number,
  actualHeight: number,
): "good" | "watch" | "risk" | null {
  if (!spec || actualWidth === 0) return null;
  const ratioTolerance = 0.08;
  const targetRatio = spec.width / spec.height;
  const actualRatio = actualWidth / actualHeight;
  const deviation = Math.abs(actualRatio - targetRatio) / targetRatio;
  if (deviation <= ratioTolerance) return "good";
  if (deviation <= ratioTolerance * 3) return "watch";
  return "risk";
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
}: MediaPickerFieldProps) {
  const [mode, setMode] = useState<"upload" | "url" | "preview">(
    value ? "preview" : "upload",
  );
  const [urlInput, setUrlInput] = useState(value || "");
  const [uploading, setUploading] = useState(false);
  const imgSize = useImageSize(value);
  const matchStatus = sizeMatchStatus(spec, imgSize.width, imgSize.height);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasValue = Boolean(value && value.trim().length > 0);
  const isEmpty = !hasValue;
  const hasCropPreview = Boolean(previewAspectRatio);
  const focusX = Math.min(100, Math.max(0, previewFocus?.x ?? 50));
  const focusY = Math.min(100, Math.max(0, previewFocus?.y ?? 50));

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
        onChange?.(finalUrl);
        setUrlInput(finalUrl);
        setMode("preview");
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

  /* ── URL 输入 ── */
  const confirmUrl = () => {
    const trimmed = urlInput.trim();
    if (trimmed) {
      onChange?.(trimmed);
      setMode("preview");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") confirmUrl();
  };

  /* ── 清除 ── */
  const handleClear = () => {
    onChange?.("");
    setUrlInput("");
    setMode("upload");
  };

  /* ── 切换到上传模式 ── */
  const switchToUpload = () => setMode("upload");
  const switchToUrl = () => setMode("url");

  /* ── 尺寸状态指示 ── */
  const statusLabel: Record<string, string> = {
    good: "尺寸合适",
    watch: "比例略有偏差",
    risk: "建议更换图片",
  };
  const statusColor: Record<string, string> = {
    good: "#5C8C5F",
    watch: "#9A792E",
    risk: "#B15645",
  };

  return (
    <div
      className="homepage-editor__media-picker"
      data-media-field={fieldKey}
      data-media-device={device}
      tabIndex={fieldKey ? -1 : undefined}
    >
      {/* ═══ 预览模式 ═══ */}
      {mode === "preview" && hasValue && (
        <div className="homepage-editor__media-preview">
          <div
            className={`homepage-editor__media-preview-img${hasCropPreview ? " is-crop-preview" : ""}`}
            style={hasCropPreview ? { aspectRatio: previewAspectRatio } : undefined}
          >
            <img
              src={value}
              alt="预览"
              style={{
                objectFit: hasCropPreview ? "cover" : "contain",
                objectPosition: `${focusX}% ${focusY}%`,
                width: "100%",
                height: "100%",
                background: "#F5F2ED",
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <p className="homepage-editor__media-preview-note">
            {hasCropPreview
              ? `画布裁切预览 · 焦点 ${Math.round(focusX)}% × ${Math.round(focusY)}%`
              : "原图缩略；实际画布会按当前设备与焦点位置裁切显示。"}
          </p>
          <div className="homepage-editor__media-preview-actions">
            {!readOnly && (
              <>
                <Button
                  size="small"
                  icon={<SwapOutlined />}
                  onClick={switchToUpload}
                  title="更换图片"
                >
                  更换
                </Button>
                <Button
                  size="small"
                  icon={<LinkOutlined />}
                  onClick={switchToUrl}
                  title="输入 URL"
                />
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleClear}
                  title={required ? "该图片为必填项，清除后请重新上传" : "清除"}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ 上传模式 ═══ */}
      {(mode === "upload" || (mode === "preview" && !hasValue)) && (
        <Upload.Dragger
          accept="image/*"
          showUploadList={false}
          beforeUpload={(file) => {
            void handleUpload(file);
            return false;
          }}
          disabled={readOnly || uploading}
          style={{
            minHeight: 116,
            padding: "16px 12px",
            border: "1px dashed #CDB981",
            borderRadius: 5,
            background: "#FCFAF5",
          }}
        >
          <InboxOutlined style={{ color: "#B8944E", fontSize: 22 }} />
          <div style={{ marginTop: 8, color: "#4A4239", fontSize: 13 }}>
            {uploading ? "图片上传中…" : placeholder || "拖入图片或点击上传"}
          </div>
          <div style={{ marginTop: 4, color: "#91877A", fontSize: 11 }}>
            支持拖拽、点击上传；仅图片，单张不超过 10MB
          </div>
        </Upload.Dragger>
      )}

      {/* ═══ URL 输入模式 ═══ */}
      {mode === "url" && (
        <div style={{ display: "grid", gap: 8 }}>
          <Input
            ref={inputRef as any}
            value={urlInput}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setUrlInput(e.target.value)
            }
            onKeyDown={handleKeyDown}
            placeholder="输入图片 URL 或 /uploads/xxx.jpg"
            size="small"
            allowClear
          />
          <div style={{ display: "flex", gap: 6 }}>
            <Button size="small" type="primary" ghost onClick={confirmUrl}>
              确认
            </Button>
            <Button size="small" onClick={switchToUpload}>
              返回上传
            </Button>
          </div>
        </div>
      )}

      {/* ═══ 空状态辅助操作 ═══ */}
      {isEmpty && !readOnly && mode !== "url" && (
        <div
          className="homepage-editor__media-alt-actions"
          style={{ marginTop: 6 }}
        >
          <button
            type="button"
            onClick={switchToUrl}
            style={{
              border: 0,
              background: "transparent",
              color: "#8E867C",
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

      {/* 推荐比例紧跟图片操作区，便于先选图、再核对素材是否适合当前模板。 */}
      {spec && (
        <div className="homepage-editor__media-spec-hint">
          <span>{spec.label}</span>
          {imgSize.loaded && (
            <span
              style={{ color: statusColor[matchStatus || "good"] }}
              className="homepage-editor__media-match"
            >
              {matchStatus === "good" && <CheckCircleOutlined />}
              {matchStatus === "watch" && <ExclamationCircleOutlined />}
              {matchStatus === "risk" && <ExclamationCircleOutlined />}
              {imgSize.width}×{imgSize.height} — {statusLabel[matchStatus || "good"]}
            </span>
          )}
        </div>
      )}

      {/* ═══ 匹配状态底部提示 ═══ */}
      {imgSize.loaded && matchStatus === "risk" && (
        <div
          style={{
            marginTop: 5,
            padding: "6px 8px",
            borderRadius: 3,
            background: "#FFF8F5",
            border: "1px solid #F0D8CE",
            color: "#A24324",
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          当前图片比例与推荐比例偏差较大，可能被裁切或留白。
        </div>
      )}
    </div>
  );
}
