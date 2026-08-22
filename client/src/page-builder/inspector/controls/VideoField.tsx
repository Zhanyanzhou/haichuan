/**
 * VideoField.tsx — 视频上传控件(2026-08-18 P1-4)。
 *
 * 交互模型对齐 MediaPickerField 2026-08-16 重写版:
 * 1. 预览为默认态(<video> 静态帧);点"更换"内嵌展开上传区,预览不消失;
 * 2. URL 态:清空输入后确认 = 清除视频;
 * 3. value 外部变化(撤销/载入方案)自动收起临时面板。
 * 上传走 uploadApi.uploadVideo(/upload/video,服务端 ≤100MB,120s 超时)。
 */
import { useEffect, useMemo, useState } from "react";
import { Upload, Button, Input, message } from "antd";
import {
  VideoCameraOutlined,
  LinkOutlined,
  DeleteOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { uploadApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { useHomepagePuck } from "@/pages/admin/HomepageConfig/editor-store";

interface VideoFieldProps {
  fieldKey?: string;
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  required?: boolean;
}

const MAX_VIDEO_MB = 100;
const sessionUploadedVideos = new Set<string>();

function collectPageVideos(value: unknown, key = "", result = new Set<string>()) {
  if (typeof value === "string") {
    if (/video/i.test(key) && /^(https?:|\/uploads\/)/i.test(value)) result.add(value);
    return result;
  }
  if (Array.isArray(value)) value.forEach((item) => collectPageVideos(item, key, result));
  else if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) =>
      collectPageVideos(child, childKey, result),
    );
  }
  return result;
}

export default function VideoField({
  fieldKey,
  value,
  onChange,
  readOnly,
  required,
}: VideoFieldProps) {
  const pageData = useHomepagePuck((state) => state.appState.data);
  const [sessionVideos, setSessionVideos] = useState(() => [
    ...sessionUploadedVideos,
  ]);
  const currentPageVideos = useMemo(
    () => [...new Set([...collectPageVideos(pageData), ...sessionVideos])],
    [pageData, sessionVideos],
  );
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [urlInput, setUrlInput] = useState(value || "");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setReplaceOpen(false);
    setUrlMode(false);
    setUrlInput(value || "");
  }, [value]);

  const handleUpload = async (file: File) => {
    if (file.type && !file.type.startsWith("video/")) {
      message.error("仅支持视频文件");
      return;
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      message.error(`视频不能超过 ${MAX_VIDEO_MB}MB`);
      return;
    }
    setUploading(true);
    try {
      const response = await uploadApi.uploadVideo(file);
      const data = unwrapResponse<{ url: string }>(response);
      if (data?.url) {
        sessionUploadedVideos.add(data.url);
        setSessionVideos([...sessionUploadedVideos]);
        onChange?.(data.url);
        message.success("视频上传成功");
        setReplaceOpen(false);
        setUrlMode(false);
      } else {
        message.error("上传返回缺少视频地址，请重试");
      }
    } catch (error) {
      // 透传服务端具体原因(如"不支持的文件类型"),与编辑器错误提取一致
      const responseMessage = (error as { response?: { data?: { message?: unknown } } })
        ?.response?.data?.message;
      message.error(
        typeof responseMessage === "string" && responseMessage.trim()
          ? responseMessage
          : "视频上传失败，请重试",
      );
    } finally {
      setUploading(false);
    }
  };

  const confirmUrl = () => {
    const next = urlInput.trim();
    if (!next) {
      onChange?.("");
      setUrlMode(false);
      setReplaceOpen(false);
      return;
    }
    if (!/^(https?:\/\/|\/)/.test(next)) {
      message.error("仅支持站内路径或 https 链接");
      return;
    }
    onChange?.(next);
    setUrlMode(false);
    setReplaceOpen(false);
  };

  const removeVideo = () => {
    onChange?.("");
    setReplaceOpen(false);
    setUrlMode(false);
  };

  if (readOnly) {
    return (
      <div className="homepage-editor__inspector-field">
        <label>视频地址</label>
        <Input value={value || ""} readOnly size="small" />
      </div>
    );
  }

  return (
    <div
      className="homepage-editor__inspector-field"
      data-media-field={fieldKey}
    >
      <label>
        视频
        {required ? <em>必填</em> : null}
        <span className="homepage-editor__inspector-hint">
          {`仅视频文件，单个 ≤ ${MAX_VIDEO_MB}MB`}
        </span>
      </label>

      {value && !urlMode && !replaceOpen ? (
        <div>
          <video
            src={value}
            controls={false}
            muted
            preload="metadata"
            style={{ width: "100%", borderRadius: 4, background: "#181A1B" }}
          />
          <div className="homepage-editor__media-actions">
            <Button size="small" icon={<SwapOutlined />} onClick={() => setReplaceOpen(true)}>
              更换
            </Button>
            <Button size="small" icon={<LinkOutlined />} onClick={() => setUrlMode(true)}>
              链接
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={removeVideo}>
              删除
            </Button>
          </div>
        </div>
      ) : null}

      {(replaceOpen || !value) && !urlMode ? (
        <div>
          <Upload.Dragger
            accept="video/*"
            showUploadList={false}
            beforeUpload={(file) => {
              void handleUpload(file);
              return false;
            }}
            disabled={uploading}
          >
            <VideoCameraOutlined style={{ color: "var(--adm-action, #5F6568)", fontSize: 22 }} />
            <div style={{ marginTop: 8, color: "#181A1B", fontSize: 13 }}>
              {uploading ? "视频上传中…" : "拖入视频或点击上传"}
            </div>
          </Upload.Dragger>
          <div className="homepage-editor__media-alt-actions" style={{ marginTop: 6 }}>
            <button type="button" onClick={() => setUrlMode(true)}>
              改用视频链接
            </button>
            {/* 取消仅在「更换」场景（已有视频）有意义；空值初始即上传态，无需取消 */}
            {value ? (
              <button type="button" onClick={() => setReplaceOpen(false)}>
                取消
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {urlMode ? (
        <div>
          <Input
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            placeholder="粘贴视频地址（https 或 /uploads/ 路径）"
            onPressEnter={confirmUrl}
            autoFocus
          />
          <div className="homepage-editor__media-alt-actions" style={{ marginTop: 6 }}>
            <button type="button" onClick={confirmUrl}>
              确认
            </button>
            <button
              type="button"
              onClick={() => {
                setUrlMode(false);
                setUrlInput(value || "");
              }}
            >
              取消
            </button>
          </div>
          <span className="homepage-editor__inspector-hint">
            清空后确认 = 删除视频
          </span>
        </div>
      ) : null}
      <details className="homepage-editor__current-page-media">
        <summary>本页与本次会话视频 · {currentPageVideos.length}</summary>
        {currentPageVideos.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4 }}>
            {currentPageVideos.map((url) => (
              <button
                key={url}
                type="button"
                className={url === value ? "is-current" : ""}
                style={{ aspectRatio: "auto", padding: 6, textAlign: "left" }}
                onClick={() => onChange?.(url)}
              >
                {url === value ? "当前视频 · " : "使用 · "}{url}
              </button>
            ))}
          </div>
        ) : (
          <p>当前页面还没有可复用视频。</p>
        )}
      </details>
    </div>
  );
}
