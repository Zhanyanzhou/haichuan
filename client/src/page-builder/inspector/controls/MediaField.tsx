/**
 * MediaField.tsx — 媒体字段控件。
 * 组合 MediaPickerField（上传/URL/预览/规格）与可选的 ImageStatus 紧凑检查条；
 * 配置 focusKeys 且已有图片时内嵌 FocusPicker 可视化焦点拖拽(回写双端焦点键);
 * mobile 档配置 inheritFrom 时渲染 DeviceOverrideBadge（空值即继承模型）。
 */
import { useState } from "react";
import { AimOutlined } from "@ant-design/icons";
import MediaPickerField from "../../fields/MediaPickerField";
import DeviceOverrideBadge from "./DeviceOverrideBadge";
import type { MediaFieldDef } from "../schema/types";
import SharedPageMediaPicker from "../../fields/SharedPageMediaPicker";

interface MediaFieldProps {
  def: MediaFieldDef;
  value: string;
  focus?: { x: number; y: number };
  device: "desktop" | "mobile" | "shared";
  onChange: (value: string) => void;
  onAdjustComposition?: () => void;
  onFocusChange?: (next: { x: number; y: number }) => void;
  /** 继承来源键的当前值（inheritFrom 配置时由 FieldRenderer 传入） */
  inheritBaseValue?: string;
  previewFit?: "cover" | "contain" | "fill";
  previewZoom?: number;
  taskPresentation?: "media";
}

export default function MediaField({
  def,
  value,
  focus,
  device,
  onChange,
  onAdjustComposition,
  onFocusChange,
  inheritBaseValue,
  previewFit,
  previewZoom,
  taskPresentation,
}: MediaFieldProps) {
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
          onFocusChange={onFocusChange}
          onOpenPageMedia={() => setPageMediaOpen((open) => !open)}
          pageMediaOpen={pageMediaOpen}
          taskPresentation={taskPresentation === "media"}
        />
      ) : null}
      {!showOverrideBadge || overridden ? (
        <SharedPageMediaPicker
          open={pageMediaOpen}
          currentValue={value}
          onSelect={selectMedia}
        />
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
