/**
 * FieldRenderer.tsx — 按字段定义分发到具体控件。
 * 所有控件复用 homepage-editor__inspector-* 样式体系。
 */
import TextField from "./controls/TextField";
import SegmentedField from "./controls/SegmentedField";
import NumberField from "./controls/NumberField";
import SwitchField from "./controls/SwitchField";
import SelectField from "./controls/SelectField";
import PresetField from "./controls/PresetField";
import MediaField from "./controls/MediaField";
import VideoField from "./controls/VideoField";
import ArrayField from "./controls/ArrayField";
import ColorField from "../fields/ColorField";
import LinkTargetField from "./LinkTargetField";
import ProductReferencesField from "../fields/ProductReferencesField";
import CategoryReferencesField from "../fields/CategoryReferencesField";
import type {
  FieldDef,
  InspectorContext,
} from "./schema/types";
import {
  getContentTemplateContract,
  getContentTemplateEditableObject,
} from "../generated/contentTemplates.generated";
import { resolveVisualNode } from "../runtime/visualLayout";
import type { PuckProps } from "../types";

interface FieldRendererProps {
  def: FieldDef;
  ctx: InspectorContext;
  update: (patch: PuckProps) => void;
  moduleType?: string;
  onRequestVisualEdit?: (nodeId: string) => void;
  taskPresentation?: "media";
  textRows?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFieldHiddenByInstanceVisibility(
  moduleType: string | undefined,
  fieldKey: string,
  props: PuckProps,
) {
  if (!moduleType) return false;
  const contract = getContentTemplateContract(moduleType);
  const editableObject = getContentTemplateEditableObject(moduleType, fieldKey)
    ?? contract?.editorCapabilities.editableObjects.find((object) =>
      object.contentFieldKeys.includes(fieldKey),
    );
  if (
    !editableObject ||
    !editableObject.capabilities.includes("visibility") ||
    !editableObject.constraints.allowHide
  ) {
    return false;
  }
  const leafNodeIds = (editableObject.nodeIds ?? []).filter(
    (nodeId) => nodeId !== editableObject.roleId,
  );
  const overrideNodeIds = leafNodeIds.includes(fieldKey)
    ? [fieldKey]
    : leafNodeIds.length > 0
      ? leafNodeIds
      : [editableObject.roleId];
  const overrides = isRecord(props.__instanceOverrides)
    ? props.__instanceOverrides
    : {};
  const container = overrides.version === 2
    ? (isRecord(overrides.nodes) ? overrides.nodes : {})
    : (isRecord(overrides.textRoles) ? overrides.textRoles : {});
  return overrideNodeIds.every((nodeId) => {
    const node = isRecord(container[nodeId]) ? container[nodeId] : {};
    return node.enabled === false;
  });
}

export default function FieldRenderer({
  def,
  ctx,
  update,
  moduleType,
  onRequestVisualEdit,
  taskPresentation,
  textRows,
}: FieldRendererProps) {
  const value = ctx.props[def.key];

  switch (def.control) {
    case "text":
    case "textarea": {
      const hiddenByInstanceVisibility = isFieldHiddenByInstanceVisibility(
        moduleType,
        def.key,
        ctx.props,
      );
      const effectiveRequired = Boolean(def.required) && !hiddenByInstanceVisibility;
      return (
        <TextField
          label={def.label}
          hint={hiddenByInstanceVisibility
            ? `${def.hint ? `${def.hint}；` : ""}当前内容已隐藏，保留的文字不会阻断发布`
            : def.hint}
          required={effectiveRequired}
          maxLength={def.maxLength}
          placeholder={def.placeholder}
          rows={textRows ?? (def.control === "textarea" ? def.rows : undefined)}
          value={typeof value === "string" ? value : ""}
          error={effectiveRequired && !(typeof value === "string" && value.trim())}
          onChange={(next) => update({ [def.key]: next })}
        />
      );
    }

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

    case "number":
      return (
        <NumberField
          label={def.label}
          hint={def.hint}
          unit={def.unit}
          min={def.min}
          max={def.max}
          step={def.step}
          value={typeof value === "number" ? value : Number(value)}
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
      const slotCapabilities = moduleType
        ? getContentTemplateContract(moduleType)?.editorCapabilities.layoutOverrides?.slots
        : undefined;
      const slotRole =
        slotCapabilities?.find((slot) => slot.roleId === def.key || slot.fieldKey === def.key)?.roleId ??
        (slotCapabilities?.length === 1 ? slotCapabilities[0].roleId : def.key);
      const viewportKey = device === "mobile" ? "mobile" : "desktop";
      const visualNode = resolveVisualNode(ctx.props, slotRole, viewportKey);
      const effectivePreviewRatio =
        Number.isFinite(visualNode.ratio)
          ? `${visualNode.ratio} / 1`
          : def.previewAspectRatio;
      const slotCapability = slotCapabilities?.find((slot) => slot.roleId === slotRole);
      const focus = def.focusKeys
        ? {
            x: Number(visualNode.focus?.x ?? ctx.props[def.focusKeys.x] ?? 50),
            y: Number(visualNode.focus?.y ?? ctx.props[def.focusKeys.y] ?? 50),
          }
        : undefined;
      let inheritBaseValue: string | undefined;
      if (def.inheritFrom) {
        const base = ctx.props[def.inheritFrom.key];
        inheritBaseValue = typeof base === "string" ? base : "";
      }
      return (
        <MediaField
          def={{ ...def, previewAspectRatio: effectivePreviewRatio }}
          device={device}
          value={typeof value === "string" ? value : ""}
          focus={focus}
          previewFit={
            visualNode.fit
          }
          previewZoom={
            visualNode.zoom
          }
          onChange={(next) => update({ [def.key]: next })}
          onAdjustComposition={
            slotCapability && onRequestVisualEdit
              ? () => onRequestVisualEdit(slotRole)
              : undefined
          }
          inheritBaseValue={inheritBaseValue}
          taskPresentation={taskPresentation}
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
      // keyPrefix(如 "secondary")把读写切到 secondaryTargetType/secondaryProductId/secondaryLinkUrl;
      // 无前缀时首字母小写驼峰,与持久化键一致
      const prefix = def.keyPrefix ?? "";
      const readKey = (suffix: "TargetType" | "ProductCode" | "ProductId" | "CategorySlug" | "LinkUrl") =>
        prefix
          ? ctx.props[`${prefix}${suffix}`]
          : ctx.props[suffix.charAt(0).toLowerCase() + suffix.slice(1)];
      const targetType = readKey("TargetType");
      const productCode = readKey("ProductCode");
      const productId = readKey("ProductId");
      const categorySlug = readKey("CategorySlug");
      const linkUrl = readKey("LinkUrl");
      return (
        <LinkTargetField
          id={String(ctx.props.id ?? def.key)}
          targetType={typeof targetType === "string" ? targetType : undefined}
          productCode={typeof productCode === "string" ? productCode : undefined}
          productId={typeof productId === "string" || typeof productId === "number" ? productId : undefined}
          categorySlug={typeof categorySlug === "string" ? categorySlug : undefined}
          linkUrl={typeof linkUrl === "string" ? linkUrl : undefined}
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

    case "productReferences":
      {
      const legacyValue = def.legacyKey ? ctx.props[def.legacyKey] : undefined;
      const legacyIds = Array.isArray(legacyValue)
        ? legacyValue.map(Number).filter((item) => Number.isInteger(item) && item > 0)
        : Number(legacyValue) > 0
          ? [Number(legacyValue)]
          : [];
      return (
        <ProductReferencesField
          value={
            Array.isArray(value)
              ? value.filter((item): item is string => typeof item === "string")
              : typeof value === "string" && value
                ? [value]
                : []
          }
          legacyIds={legacyIds}
          minProducts={def.minItems}
          maxProducts={def.maxItems}
          onChange={(codes, legacyIds) =>
            update({
              [def.key]: def.multiple === false ? codes[0] ?? "" : codes,
              ...(def.legacyKey
                ? {
                    [def.legacyKey]:
                      def.multiple === false ? legacyIds[0] ?? 0 : legacyIds,
                  }
                : {}),
            })
          }
        />
      );
      }

    case "categoryReferences":
      return (
        <CategoryReferencesField
          value={Array.isArray(value) ? value : []}
          minItems={def.minItems}
          maxItems={def.maxItems}
          onChange={(slugs) => update({ [def.key]: slugs })}
        />
      );

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
          moduleType={moduleType}
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
