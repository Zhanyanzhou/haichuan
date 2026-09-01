/**
 * MediaField.tsx — 媒体字段控件。
 * 组合 MediaPickerField（上传/URL/预览/规格）与可选的 ImageStatus 紧凑检查条；
 * 配置 focusKeys 且已有图片时内嵌 FocusPicker 可视化焦点拖拽(回写双端焦点键);
 * mobile 档配置 inheritFrom 时渲染 DeviceOverrideBadge（空值即继承模型）。
 */
import { useEffect, useMemo, useState } from "react";
import { AimOutlined } from "@ant-design/icons";
import MediaPickerField from "../../fields/MediaPickerField";
import DeviceOverrideBadge from "./DeviceOverrideBadge";
import type { MediaFieldDef } from "../schema/types";
import { useHomepagePuck } from "@/pages/admin/HomepageConfig/editor-store";
import {
  SESSION_MEDIA_UPLOADED_EVENT,
  sessionUploadedMedia,
} from "../../fields/MediaPickerField";
import {
  PAGE_MEDIA_LIBRARY_CHANGED_EVENT,
  readPageMediaLibrary,
} from "../../fields/pageMediaLibrary";

interface MediaFieldProps {
  def: MediaFieldDef;
  value: string;
  focus?: { x: number; y: number };
  device: "desktop" | "mobile" | "shared";
  onChange: (value: string) => void;
  onAdjustComposition?: () => void;
  /** 继承来源键的当前值（inheritFrom 配置时由 FieldRenderer 传入） */
  inheritBaseValue?: string;
  previewFit?: "cover" | "contain" | "fill";
  previewZoom?: number;
  taskPresentation?: "media";
}

const MEDIA_KEY = /(image|media|poster|cover|avatar|logo|thumbnail)/i;

function collectPageMedia(value: unknown, key = "", result = new Set<string>()) {
  if (typeof value === "string") {
    if (MEDIA_KEY.test(key) && /^(https?:|\/uploads\/|data:image\/)/i.test(value)) result.add(value);
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectPageMedia(item, key, result));
    return result;
  }
  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) =>
      collectPageMedia(child, childKey, result),
    );
  }
  return result;
}

export default function MediaField({
  def,
  value,
  focus,
  device,
  onChange,
  onAdjustComposition,
  inheritBaseValue,
  previewFit,
  previewZoom,
  taskPresentation,
}: MediaFieldProps) {
  const pageData = useHomepagePuck((state) => state.appState.data);
  const [mediaRevision, setMediaRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setMediaRevision((revision) => revision + 1);
    window.addEventListener(SESSION_MEDIA_UPLOADED_EVENT, refresh);
    window.addEventListener(PAGE_MEDIA_LIBRARY_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(SESSION_MEDIA_UPLOADED_EVENT, refresh);
      window.removeEventListener(PAGE_MEDIA_LIBRARY_CHANGED_EVENT, refresh);
    };
  }, []);
  const currentPageMedia = useMemo(
    () => {
      // 会话上传集合本身可变，revision 仅用于通知此处重新计算。
      void mediaRevision;
      return [...new Set([...collectPageMedia(pageData), ...sessionUploadedMedia])];
    },
    [mediaRevision, pageData],
  );
  const availablePageMedia = useMemo(() => {
    void mediaRevision;
    const libraryItems = readPageMediaLibrary().filter((item) => item.type === "image");
    const items = new Map<string, { url: string; name: string }>();
    if (value) items.set(value, { url: value, name: "当前图片" });
    libraryItems.forEach((item) => items.set(item.url, { url: item.url, name: item.name }));
    currentPageMedia.forEach((url, index) => {
      if (!items.has(url)) items.set(url, { url, name: `当前页面图片 ${index + 1}` });
    });
    return [...items.values()];
  }, [currentPageMedia, mediaRevision, value]);
  const [pageMediaOpen, setPageMediaOpen] = useState(false);
  const showOverrideBadge = Boolean(def.inheritFrom && device === "mobile");
  const overridden = showOverrideBadge && Boolean(value && value.trim());
  const canAdjustComposition = Boolean(onAdjustComposition && value && value.trim());
  const selectMedia = (nextValue: string) => {
    setPageMediaOpen(false);
    onChange(nextValue);
  };
  const taskLabel = taskPresentation === "media"
    ? def.label.replace(/^(桌面端|移动端)/, "")
    : def.label;
  return (
    <div
      className="homepage-editor__inspector-field"
      data-task-presentation={taskPresentation}
    >
      <label>
        {taskLabel}
        {def.required ? <em>必填</em> : null}
        {def.hint ? (
          <span className="homepage-editor__inspector-hint">{def.hint}</span>
        ) : null}
      </label>
      {showOverrideBadge ? (
        <DeviceOverrideBadge
          label={def.inheritFrom!.label}
          overridden={overridden}
          hasBaseValue={Boolean(inheritBaseValue && inheritBaseValue.trim())}
          onOverride={() => {
            // 开始单独设置:拷贝继承值为初值,便于在桌面图基础上重裁
            onChange(inheritBaseValue || "");
          }}
          onInherit={() => {
            // 恢复继承:清空 mobile 键,渲染层回退桌面图
            onChange("");
          }}
        />
      ) : null}
      {!showOverrideBadge || overridden ? (
        <MediaPickerField
          fieldKey={def.key}
          device={device}
          value={value}
          onChange={selectMedia}
          spec={def.spec}
          required={def.required}
          placeholder={def.placeholder}
          previewAspectRatio={
            def.previewAspectRatio ?? `${def.spec.width} / ${def.spec.height}`
          }
          previewFocus={focus}
          previewFit={previewFit}
          previewZoom={previewZoom}
          onOpenPageMedia={() => setPageMediaOpen((open) => !open)}
          pageMediaOpen={pageMediaOpen}
          taskPresentation={taskPresentation === "media"}
        />
      ) : null}
      {!showOverrideBadge || overridden ? (
        pageMediaOpen ? (
          <div
            className="homepage-editor__current-page-media"
            aria-label="选择本页与当前浏览器图片"
            role="region"
          >
            <div className="homepage-editor__current-page-media-heading">
              <strong>本页与当前浏览器图片</strong>
              <span>{availablePageMedia.length} 张</span>
            </div>
            <p className="homepage-editor__current-page-media-empty">
              这里只汇总当前页面引用和本浏览器上传记录，不是跨设备的账号素材库。
            </p>
            {availablePageMedia.length > 0 ? (
              <div className="homepage-editor__current-page-media-items">
                {availablePageMedia.map((item) => (
                  <button
                    key={item.url}
                    type="button"
                    className={item.url === value ? "is-current" : ""}
                    onClick={() => selectMedia(item.url)}
                    aria-label={item.url === value ? `当前素材：${item.name}` : `使用素材：${item.name}`}
                  >
                    <img src={item.url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="homepage-editor__current-page-media-empty">
                当前页面和浏览器暂无可复用图片，可使用“更换图片”上传。
              </p>
            )}
          </div>
        ) : null
      ) : null}
      {canAdjustComposition ? (
        <div className="homepage-editor__inspector-subsection homepage-editor__media-design-entry">
          <button
            type="button"
            className="homepage-editor__media-focus-toggle"
            onClick={onAdjustComposition}
          >
            <AimOutlined />
            <span>在画布中调整构图</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
