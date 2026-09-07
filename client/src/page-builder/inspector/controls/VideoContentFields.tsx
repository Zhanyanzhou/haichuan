import MediaPickerField from "../../fields/MediaPickerField";
import {
  getContractRoleRatio,
  getContractRoleRatioPresets,
} from "../../config/blockContracts";
import ImageFocusField from "./ImageFocusField";
import SelectField from "./SelectField";
import SwitchField from "./SwitchField";
import TextField from "./TextField";
import VideoField from "./VideoField";

export interface VideoContentFieldsProps {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  designValue?: Record<string, unknown>;
  onDesignChange?: (next: Record<string, string | number | boolean>) => void;
  scope: "page" | "template";
  required?: boolean;
}

const targetKeys = ["pagePath", "url", "productCode", "categorySlug", "linkUrl", "productId"] as const;
const toEditorRatio = (ratio: string) => ratio.split("/").map((part) => part.trim()).join(":");
const videoDefaultRatioByViewport = {
  desktop: getContractRoleRatio("video", "coverImage", "desktop"),
  mobile: getContractRoleRatio("video", "coverImage", "mobile"),
} as const;
const videoRatioPresetsByViewport = {
  desktop: getContractRoleRatioPresets("video", "coverImage", "desktop"),
  mobile: getContractRoleRatioPresets("video", "coverImage", "mobile"),
} as const;
const videoRatioOptions = [...new Set([
  ...videoRatioPresetsByViewport.desktop,
  ...videoRatioPresetsByViewport.mobile,
])].map((ratio) => {
  const desktop = videoRatioPresetsByViewport.desktop.includes(ratio);
  const mobile = videoRatioPresetsByViewport.mobile.includes(ratio);
  return {
    value: toEditorRatio(ratio),
    label: `${toEditorRatio(ratio)} · ${desktop && mobile ? "桌面/移动" : desktop ? "桌面" : "移动"}`,
  };
});

export default function VideoContentFields({
  value,
  onChange,
  designValue = {},
  onDesignChange,
  scope,
  required,
}: VideoContentFieldsProps) {
  const effectiveValue = scope === "template" ? { ...value, ...designValue } : value;
  const update = (key: string, nextValue: unknown) => onChange({ ...value, [key]: nextValue });
  const updateDesign = (key: string, nextValue: string | number | boolean) => {
    onDesignChange?.({
      ...designValue as Record<string, string | number | boolean>,
      [key]: nextValue,
    });
  };
  const targetType = typeof effectiveValue.targetType === "string" ? effectiveValue.targetType : "none";
  const targetField = targetType === "page"
    ? "pagePath"
    : targetType === "external"
      ? "url"
      : targetType === "product"
        ? "productCode"
        : targetType === "category"
          ? "categorySlug"
          : null;
  return (
    <div className="homepage-editor__inspector-subsection" data-video-content-scope={scope}>
      <div className="homepage-editor__inspector-field">
        <label>视频素材{required ? <em>必填</em> : null}</label>
        <VideoField
          fieldKey="videoUrl"
          value={typeof effectiveValue.videoUrl === "string" ? effectiveValue.videoUrl : ""}
          required={required}
          includePageVideos={scope === "page"}
          onChange={(videoUrl) => update("videoUrl", videoUrl)}
        />
      </div>
      <div className="homepage-editor__inspector-field">
        <label>视频封面</label>
        <MediaPickerField
          fieldKey="posterUrl"
          value={typeof effectiveValue.posterUrl === "string" ? effectiveValue.posterUrl : ""}
          previewAspectRatio={videoDefaultRatioByViewport.desktop}
          onChange={(posterUrl) => update("posterUrl", posterUrl)}
        />
      </div>
      <TextField label="视频说明" hint="播放失败和无画面场景也会显示" value={typeof effectiveValue.videoDescription === "string" ? effectiveValue.videoDescription : ""} maxLength={200} onChange={(videoDescription) => update("videoDescription", videoDescription)} />
      <TextField label="标题" value={typeof effectiveValue.title === "string" ? effectiveValue.title : ""} maxLength={80} onChange={(title) => update("title", title)} />
      <TextField label="副标题" value={typeof effectiveValue.subtitle === "string" ? effectiveValue.subtitle : ""} maxLength={200} rows={2} onChange={(subtitle) => update("subtitle", subtitle)} />
      <TextField label="行动文案" value={typeof effectiveValue.actionText === "string" ? effectiveValue.actionText : ""} maxLength={40} onChange={(actionText) => update("actionText", actionText)} />
      <SelectField
        label="行动去向"
        value={targetType}
        options={[
          { value: "none", label: "不跳转" },
          { value: "page", label: "站内页面" },
          { value: "product", label: "商品" },
          { value: "category", label: "分类" },
          { value: "external", label: "外部 HTTPS" },
        ]}
        onChange={(nextTargetType) => {
          const next: Record<string, unknown> = { ...value, targetType: nextTargetType };
          targetKeys.forEach((key) => delete next[key]);
          onChange(next);
        }}
      />
      {targetField ? (
        <TextField
          label={targetType === "page" ? "站内路径" : targetType === "external" ? "外部链接" : targetType === "product" ? "商品编号" : "分类标识"}
          value={typeof effectiveValue[targetField] === "string" ? effectiveValue[targetField] as string : ""}
          placeholder={targetType === "page" ? "/about" : targetType === "external" ? "https://example.com" : undefined}
          onChange={(nextValue) => update(targetField, nextValue)}
        />
      ) : null}
      <div className="template-editor__geometry-grid">
        <SwitchField label="自动播放" value={effectiveValue.autoPlay === true} onChange={(autoPlay) => update("autoPlay", autoPlay)} />
        <SwitchField label="循环播放" value={effectiveValue.loop !== false} onChange={(loop) => update("loop", loop)} />
        <SwitchField label="默认静音" value={effectiveValue.muted !== false} onChange={(muted) => update("muted", muted)} />
        <SwitchField label="显示控制条" value={effectiveValue.showControls !== false} onChange={(showControls) => update("showControls", showControls)} />
      </div>
      {scope === "template" ? (
        <SelectField
          label="母模板视频比例"
          hint="页面实例不能覆盖；未选择时按桌面与移动端合同分别取值"
          value={typeof effectiveValue.aspectRatio === "string" ? effectiveValue.aspectRatio : ""}
          options={videoRatioOptions}
          allowEmpty
          emptyLabel={`合同默认 · 桌面 ${toEditorRatio(videoDefaultRatioByViewport.desktop)} / 移动 ${toEditorRatio(videoDefaultRatioByViewport.mobile)}`}
          onChange={(aspectRatio) => updateDesign("aspectRatio", aspectRatio)}
        />
      ) : null}
      <ImageFocusField
        label="视频封面焦点"
        value={{
          x: typeof effectiveValue.focusX === "number" ? effectiveValue.focusX : 50,
          y: typeof effectiveValue.focusY === "number" ? effectiveValue.focusY : 50,
        }}
        onChange={({ x, y }) => onChange({ ...value, focusX: x, focusY: y })}
      />
    </div>
  );
}
