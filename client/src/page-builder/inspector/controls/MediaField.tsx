/**
 * MediaField.tsx — 媒体字段控件。
 * 组合 MediaPickerField（上传/URL/预览/规格）与可选的 ImageStatus 紧凑检查条；
 * mobile 档配置 inheritFrom 时渲染 DeviceOverrideBadge（空值即继承模型）。
 */
import { useEffect, useState } from "react";
import MediaPickerField from "../../fields/MediaPickerField";
import ImageStatus from "../ImageStatus";
import DeviceOverrideBadge from "./DeviceOverrideBadge";
import type { MediaFieldDef } from "../schema/types";

interface MediaFieldProps {
  def: MediaFieldDef;
  value: string;
  focus?: { x: number; y: number };
  device: "desktop" | "mobile" | "shared";
  onChange: (value: string) => void;
  /** 继承来源键的当前值（inheritFrom 配置时由 FieldRenderer 传入） */
  inheritBaseValue?: string;
}

/** 探测图片真实尺寸，供 ImageStatus 比例/清晰度检查。 */
function useImageNaturalSize(url: string | undefined) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!url) {
      setSize({ width: 0, height: 0 });
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled)
        setSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setSize({ width: 0, height: 0 });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return size;
}

export default function MediaField({
  def,
  value,
  focus,
  device,
  onChange,
  inheritBaseValue,
}: MediaFieldProps) {
  const natural = useImageNaturalSize(value);
  const format =
    (value || "").match(/\.(webp|avif|jpe?g|png|gif)/i)?.[1]?.toLowerCase() ||
    "";
  const showOverrideBadge = Boolean(def.inheritFrom && device === "mobile");
  const overridden = showOverrideBadge && Boolean(value && value.trim());
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
        />
      ) : null}
      {def.showSpecCheck && natural.width && (!showOverrideBadge || overridden) ? (
        <ImageStatus
          width={natural.width}
          height={natural.height}
          format={format}
          spec={def.spec}
        />
      ) : null}
    </div>
  );
}
