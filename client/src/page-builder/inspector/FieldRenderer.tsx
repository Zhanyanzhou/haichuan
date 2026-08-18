/**
 * FieldRenderer.tsx — 按字段定义分发到具体控件。
 * 所有控件复用 homepage-editor__inspector-* 样式体系。
 */
import TextField from "./controls/TextField";
import SegmentedField from "./controls/SegmentedField";
import SwitchField from "./controls/SwitchField";
import SelectField from "./controls/SelectField";
import PresetField from "./controls/PresetField";
import MediaField from "./controls/MediaField";
import VideoField from "./controls/VideoField";
import ArrayField from "./controls/ArrayField";
import ColorField from "../fields/ColorField";
import LinkTargetField from "./LinkTargetField";
import type {
  FieldDef,
  InspectorContext,
} from "./schema/types";

interface FieldRendererProps {
  def: FieldDef;
  ctx: InspectorContext;
  update: (patch: Record<string, any>) => void;
}

export default function FieldRenderer({ def, ctx, update }: FieldRendererProps) {
  const value = ctx.props[def.key];

  switch (def.control) {
    case "text":
    case "textarea":
      return (
        <TextField
          label={def.label}
          hint={def.hint}
          required={def.required}
          maxLength={def.maxLength}
          placeholder={def.placeholder}
          rows={def.control === "textarea" ? def.rows : undefined}
          value={typeof value === "string" ? value : ""}
          error={def.required && !(typeof value === "string" && value.trim())}
          onChange={(next) => update({ [def.key]: next })}
        />
      );

    case "segmented":
      return (
        <SegmentedField
          label={def.label}
          hint={def.hint}
          ariaLabel={def.label}
          value={typeof value === "string" ? value : ""}
          options={def.options}
          onChange={(next) => update({ [def.key]: next })}
        />
      );

    case "switch":
      return (
        <SwitchField
          label={def.label}
          hint={def.hint}
          value={Boolean(value)}
          onChange={(next) => update({ [def.key]: next })}
        />
      );

    case "select":
      return (
        <SelectField
          label={def.label}
          hint={def.hint}
          required={def.required}
          placeholder={def.placeholder}
          value={typeof value === "string" ? value : ""}
          options={def.options}
          onChange={(next) => update({ [def.key]: next })}
        />
      );

    case "color":
      return (
        <div className="homepage-editor__inspector-field">
          <label>
            {def.label}
            {def.hint ? (
              <span className="homepage-editor__inspector-hint">
                {def.hint}
              </span>
            ) : null}
          </label>
          <ColorField
            value={typeof value === "string" ? value : ""}
            onChange={(next) => update({ [def.key]: next })}
          />
        </div>
      );

    case "media": {
      const device = def.device ?? "shared";
      const focus = def.focusKeys
        ? {
            x: Number(ctx.props[def.focusKeys.x] ?? 50),
            y: Number(ctx.props[def.focusKeys.y] ?? 50),
          }
        : undefined;
      let inheritBaseValue: string | undefined;
      if (def.inheritFrom) {
        const base = ctx.props[def.inheritFrom.key];
        inheritBaseValue = typeof base === "string" ? base : "";
      }
      return (
        <MediaField
          def={def}
          device={device}
          value={typeof value === "string" ? value : ""}
          focus={focus}
          onChange={(next) => update({ [def.key]: next })}
          onFocusChange={
            def.focusKeys
              ? (x, y) =>
                  update({
                    [def.focusKeys!.x]: x,
                    [def.focusKeys!.y]: y,
                  })
              : undefined
          }
          inheritBaseValue={inheritBaseValue}
        />
      );
    }

    case "video":
      return (
        <VideoField
          fieldKey={def.key}
          value={typeof value === "string" ? value : ""}
          onChange={(next) => update({ [def.key]: next })}
          required={def.required}
        />
      );

    case "linkTarget": {
      // keyPrefix(如 "secondary")把读写切到 secondaryTargetType/secondaryProductId/secondaryLinkUrl
      const prefix = def.keyPrefix ?? "";
      const readKey = (suffix: "TargetType" | "ProductId" | "LinkUrl") =>
        prefix
          ? ctx.props[`${prefix}${suffix}`]
          : ctx.props[suffix.toLowerCase()];
      return (
        <LinkTargetField
          id={String(ctx.props.id ?? def.key)}
          targetType={readKey("TargetType")}
          productId={readKey("ProductId")}
          linkUrl={readKey("LinkUrl")}
          onChange={update}
          label={def.linkLabel ?? def.label}
          description={
            def.linkDescription ?? def.hint ?? "一个模块只设置一个明确去向"
          }
          compact={def.compact}
          keyPrefix={prefix || undefined}
        />
      );
    }

    case "preset":
      return (
        <PresetField
          label={def.label}
          hint={def.hint}
          value={typeof value === "string" ? value : ""}
          options={def.options}
          ctx={ctx}
          onApply={(patch) => update(patch)}
        />
      );

    case "custom":
      return <>{def.render({ ...ctx, update })}</>;

    case "array":
      return (
        <ArrayField
          def={def}
          value={value}
          ctx={ctx}
          onChange={(next) => update({ [def.key]: next })}
        />
      );

    default:
      return null;
  }
}

export function isFieldVisible(
  def: FieldDef,
  ctx: InspectorContext,
): boolean {
  return def.visibleWhen ? def.visibleWhen(ctx) : true;
}
