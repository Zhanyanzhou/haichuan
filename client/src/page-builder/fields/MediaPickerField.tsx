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
import { Upload, Button, Input, message, Spin, Popover } from "antd";
import {
  PictureOutlined,
  UploadOutlined,
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
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** 推荐尺寸信息（来自 IMAGE_SPECS） */
  spec?: MediaSpec;
  /** 是否必须填写 */
  required?: boolean;
  /** 占位提示 */
  placeholder?: string;
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 2);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function MediaPickerField({
  value,
  onChange,
  readOnly,
  spec,
  required,
  placeholder,
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
    <div className="homepage-editor__media-picker">
      {/* ═══ 推荐尺寸提示 ═══ */}
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

      {/* ═══ 预览模式 ═══ */}
      {mode === "preview" && hasValue && (
        <div className="homepage-editor__media-preview">
          <div className="homepage-editor__media-preview-img">
            <img
              src={value}
              alt="预览"
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
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
        <Upload
          accept="image/*"
          showUploadList={false}
          beforeUpload={(file) => {
            handleUpload(file);
            return false;
          }}
          disabled={readOnly || uploading}
        >
          <Button
            icon={<UploadOutlined />}
            loading={uploading}
            disabled={readOnly}
            block
            size="middle"
            style={{
              height: 48,
              border: "1px dashed #DED8CE",
              borderRadius: 4,
              color: "#8E867C",
              background: "#FAFAF8",
            }}
          >
            {uploading ? "上传中…" : placeholder || "点击上传图片"}
          </Button>
        </Upload>
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
