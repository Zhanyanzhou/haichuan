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

interface MediaFieldProps {
  def: MediaFieldDef;
  value: string;
  focus?: { x: number; y: number };
  device: "desktop" | "mobile" | "shared";
  onChange: (value: string) => void;
  onAdjustComposition?: () => void;
  /** 继承来源键的当前值（inheritFrom 配置时由 FieldRenderer 传入） */
  inheritBaseValue?: string;
  previewFit?: "cover" | "contain";
  previewZoom?: number;
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
}: MediaFieldProps) {
  const pageData = useHomepagePuck((state) => state.appState.data);
  const [sessionMediaRevision, setSessionMediaRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setSessionMediaRevision((revision) => revision + 1);
    window.addEventListener(SESSION_MEDIA_UPLOADED_EVENT, refresh);
    return () => window.removeEventListener(SESSION_MEDIA_UPLOADED_EVENT, refresh);
  }, []);
  const currentPageMedia = useMemo(
    () => {
      // 会话上传集合本身可变，revision 仅用于通知此处重新计算。
      void sessionMediaRevision;
      return [...new Set([...collectPageMedia(pageData), ...sessionUploadedMedia])];
    },
    [pageData, sessionMediaRevision],
  );
  const recentPageMedia = useMemo(
    () => [value, ...currentPageMedia.filter((url) => url !== value)]
      .filter(Boolean)
      .slice(0, 5),
    [currentPageMedia, value],
  );
  const [replaceOpen, setReplaceOpen] = useState(false);
  const showOverrideBadge = Boolean(def.inheritFrom && device === "mobile");
  const overridden = showOverrideBadge && Boolean(value && value.trim());
  const canAdjustComposition = Boolean(onAdjustComposition && value && value.trim());
  return (
    <div className="homepage-editor__inspector-field">
      <label>
        {def.label}
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
          onChange={onChange}
          spec={def.spec}
          required={def.required}
          placeholder={def.placeholder}
          previewAspectRatio={
            def.previewAspectRatio ?? `${def.spec.width} / ${def.spec.height}`
          }
          previewFocus={focus}
          previewFit={previewFit}
          previewZoom={previewZoom}
          onReplaceOpenChange={setReplaceOpen}
        />
      ) : null}
      {!showOverrideBadge || overridden ? (
        replaceOpen && currentPageMedia.length > 1 ? (
          <div
            className="homepage-editor__current-page-media"
            aria-label="最近使用的图片"
          >
            <div className="homepage-editor__current-page-media-heading">
              <strong>最近使用</strong>
              <span>{currentPageMedia.length} 张</span>
            </div>
            <div>
              {recentPageMedia.map((url) => (
                <button
                  key={url}
                  type="button"
                  className={url === value ? "is-current" : ""}
                  onClick={() => onChange(url)}
                  aria-label={url === value ? "当前使用的素材" : "使用本页素材"}
                >
                  <img src={url} alt="" loading="lazy" />
                </button>
              ))}
              {currentPageMedia.length > recentPageMedia.length ? (
                <span className="homepage-editor__current-page-media-more">
                  +{currentPageMedia.length - recentPageMedia.length}
                </span>
              ) : null}
            </div>
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
