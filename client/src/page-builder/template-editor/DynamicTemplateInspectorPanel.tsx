import TemplateSlotControls, { SIMPLE_SLOT_TYPES } from "./TemplateSlotControls";
import TemplateNativeDesignControls from "./TemplateNativeDesignControls";
import TemplateLayoutConversionControls from "./TemplateLayoutConversionControls";
import "./templatePageScopeControls.css";
import { resolveTemplateDefinitionForBreakpoint, type ResolvedTemplateDefinition } from "../template-definition/responsive";
import { adaptLegacyResponsiveUpdate } from "../template-definition/operations";
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  ArrowsAltOutlined,
  BarsOutlined,
  BgColorsOutlined,
  BorderOutlined,
  ColumnHeightOutlined,
  ColumnWidthOutlined,
  CompressOutlined,
  EnterOutlined,
  EyeInvisibleOutlined,
  ExpandOutlined,
  FontSizeOutlined,
  FullscreenOutlined,
  LinkOutlined,
  MenuOutlined,
  OneToOneOutlined,
  PictureOutlined,
  ShoppingOutlined,
  SunOutlined,
  SwapOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignMiddleOutlined,
  VerticalAlignTopOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import { Alert, App as AntdApp, Button, Input, Select, Slider } from "antd";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import NumberField, {
  focusFirstInvalidNumberField,
  useCommittedNumberInput,
} from "../inspector/controls/NumberField";
import ImageFocusField from "../inspector/controls/ImageFocusField";
import SelectField from "../inspector/controls/SelectField";
import SwitchField from "../inspector/controls/SwitchField";
import TextField from "../inspector/controls/TextField";
import TemplateCompositionControls from "./TemplateCompositionControls";
import TemplateContainerControls from "./TemplateContainerControls";
import { getTemplateComposition } from "./templateCompositionPresets";
import {
  getDynamicTemplateNodeRegistryEntry,
  getDynamicTemplateStructureLockOwnerId,
  getEffectiveDynamicTemplateInstanceEditPolicy,
  getDynamicTemplateApplicableResponsiveGroups,
  createTemplateInspectorBatchPlan,
  getEffectiveContractRoleDesignValue,
  createDynamicTemplateResponsivePlan,
  DYNAMIC_TEMPLATE_RESPONSIVE_GROUP_LABELS,
  DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS,
  DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH,
  DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES,
  addDynamicTemplateNode,
  moveDynamicTemplateNode,
  resolveTemplateDesignFrame,
  setDynamicTemplateNodeStructureLocked,
  validateDynamicTemplateDefinition,
  validateDynamicTemplatePublishDefinition,
  type TemplateDefinitionV2,
  type DynamicTemplateBoxSpacing,
  type DynamicTemplateLength,
  type DynamicTemplateLengthUnit,
  type DynamicTemplateResponsiveRules,
  type DynamicTemplateSlotDefinition,
  type DynamicTemplateValidationIssue,
  type DynamicTemplateResponsiveGroup,
  type TemplateInspectorBatchFieldPlan,
} from "../template-definition";
import {
  findDynamicTemplateParentId,
  getDynamicTemplateAllowedParentIds,
  parseCommaSeparatedValues,
} from "./dynamicTemplateEditorUtils";
import {
  resolveContractRoleForDevice,
  useTemplateEditorSession,
} from "./templateEditorSession";
import {
  isSameTemplateEditorSelectionTarget,
  type TemplateEditorSelectionSnapshot,
} from "./templateEditorSelection";
import {
  objectPositionToPercent,
  percentToObjectPosition,
} from "../template-definition/imagePosition";
import {
  getContentTemplateContract,
  type ContentTemplateEditableCapability,
} from "../generated/contentTemplates.generated";
import {
  getDynamicTemplatePageFieldDataAttributes,
  getDynamicTemplatePageFieldDescriptors,
  PAGE_FIELD_CONTROL_KIND_LABELS,
  type DynamicTemplatePageFieldDescriptor,
} from "../dynamic-template-instance/pageFieldDescriptors";
import {
  getContentTemplateModuleTypeForSlotType,
} from "../template-definition/validateTemplateDefinition";
import {
  isVisualRecord,
  resolveVisualNode,
  setVisualOverridePath,
  type VisualRect,
} from "../runtime/visualLayout";
import {
  getTemplateContractRoleLabel,
  TEMPLATE_CONTRACT_KIND_LABELS,
} from "./contractRolePresentation";
import { editorPages } from "../config/editorPages";
import { TEMPLATE_NODE_NAME_MAX_LENGTH } from "./templateEditorLimits";
import {
  getTemplateInspectorCapabilities,
  getTemplateResponsiveSource,
  hasTemplateInspectorCapability,
  resolveTemplateInspectorDesignFields,
  resolveTemplateInspectorIssueTarget,
} from "./templateInspectorCapabilities";

const LENGTH_UNIT_OPTIONS: Array<{ value: DynamicTemplateLengthUnit; label: string }> = [
  { value: "px", label: "像素" },
  { value: "%", label: "父容器比例" },
  { value: "rem", label: "基础字号倍数" },
  { value: "vw", label: "画布宽度比例" },
  { value: "vh", label: "画布高度比例" },
];

const GRID_COLUMN_PRESETS = [
  { key: "1:1", label: "均分双列", columns: [1, 1] },
  { key: "2:1", label: "左侧更宽", columns: [2, 1] },
  { key: "1:2", label: "右侧更宽", columns: [1, 2] },
  { key: "1:1:1", label: "均分三列", columns: [1, 1, 1] },
] as const;

const CONTRACT_ROLE_TYPOGRAPHY_SIZE_OPTIONS = [
  { value: "xs", label: "极小", preset: "small" },
  { value: "sm", label: "小", preset: "small" },
  { value: "md", label: "标准", preset: "standard" },
  { value: "lg", label: "大", preset: "large" },
  { value: "xl", label: "特大", preset: "large" },
] as const;

const CONTRACT_ROLE_TYPOGRAPHY_COLOR_OPTIONS = [
  { token: "ink", value: "#181A1B", label: "墨黑" },
  { token: "mineral", value: "#5F6568", label: "矿物灰" },
  { token: "ivory", value: "#FFFFFF", label: "象牙白" },
] as const;

const PAGE_FIELD_OVERRIDE_LABELS = [
  ["position", "位置"],
  ["size", "尺寸"],
  ["zIndex", "层级"],
  ["imageFit", "图片适配"],
  ["imageFocus", "图片焦点"],
  ["typography", "文字样式"],
  ["spacing", "间距"],
] as const;

const RESPONSIVE_COPY_DIALOG_UNAVAILABLE = "确认窗口暂时不可用，请刷新编辑器后重试。未写入草稿。";

function describePageFieldValidation(field: DynamicTemplatePageFieldDescriptor) {
  const validation = field.validation;
  const parts: string[] = [];
  if (validation.minLength !== undefined) parts.push(`最小 ${validation.minLength} 字`);
  if (validation.maxLength !== undefined) parts.push(`最大 ${validation.maxLength} 字`);
  if (validation.recommendedWidth !== undefined || validation.recommendedHeight !== undefined) {
    parts.push(`建议 ${validation.recommendedWidth ?? "不限"} × ${validation.recommendedHeight ?? "不限"} 像素`);
  }
  if (validation.minItems !== undefined) parts.push(`最少 ${validation.minItems} 项`);
  if (validation.maxItems !== undefined) parts.push(`最多 ${validation.maxItems} 项`);
  if (validation.allowedProtocols?.length) parts.push(`跳转 ${validation.allowedProtocols.join("/")}`);
  return parts.join("；") || "未设置额外限制";
}

function describePageFieldOverrides(field: DynamicTemplatePageFieldDescriptor) {
  const policy = field.effectiveDesignOverrideCapabilities;
  if (!policy) return "不开放设计覆盖";
  const allowed = PAGE_FIELD_OVERRIDE_LABELS
    .filter(([key]) => policy[key] === true && (!["typography", "spacing"].includes(key) || supportsPageTextDesign(field)))
    .map(([, label]) => label);
  if (!allowed.length) return "不开放设计覆盖";
  const limits: string[] = [];
  if (policy.position) limits.push(`偏移不超过 ${policy.maxOffsetPercent}%`);
  if (policy.size) limits.push(`宽度 ${policy.minWidthPercent}%–${policy.maxWidthPercent}%`);
  if (policy.typography && supportsPageTextDesign(field)) limits.push(`字号 ${policy.minFontSizePx}–${policy.maxFontSizePx} 像素`);
  if (policy.spacing && supportsPageTextDesign(field)) limits.push(`间距不超过 ${policy.maxSpacingPx} 像素`);
  return `允许${allowed.join("/")}覆盖${limits.length ? `；${limits.join("；")}` : ""}`;
}

function supportsPageTextDesign(field: DynamicTemplatePageFieldDescriptor) {
  return ["heading", "text", "richText", "badge"].includes(field.slotType);
}

/** 只读取共同字段描述，不创建页面实例或样例内容。 */
function PageFieldFormPreview({ fields, onLocate }: {
  fields: DynamicTemplatePageFieldDescriptor[];
  onLocate: (nodeId: string) => void;
}) {
  return <details className="template-editor__page-form-preview">
    <summary>查看页面字段 · {fields.length} 项 · 只读</summary>
    <p className="homepage-editor__inspector-hint">按页面表单顺序查看；点击字段名称可定位模板对象。这里不填写或保存页面内容。</p>
    {fields.map((field, index) => <div key={field.slotId} className="template-editor__page-form-field">
      <span className="template-editor__page-form-order">当前查看范围第 {index + 1} 项 · {PAGE_FIELD_CONTROL_KIND_LABELS[field.controlKind]}</span>
      <button type="button" className="template-editor__page-form-label" onClick={() => onLocate(field.nodeId)}>
        {field.label}<span>{field.required ? "必填" : "可选"} · 定位对象</span>
      </button>
      {field.controlKind === "text"
        ? <input aria-label={`${field.label}页面表单示意`} readOnly value="" placeholder="文字输入（只读示意）" />
        : <div className="template-editor__page-form-placeholder" role="img" aria-label={`${field.label}：${PAGE_FIELD_CONTROL_KIND_LABELS[field.controlKind]}控件示意`}>
          {PAGE_FIELD_CONTROL_KIND_LABELS[field.controlKind]}
        </div>}
      <span>{field.editable ? "页面可填写" : "内容只读"} · {field.hideable ? "页面可隐藏" : "页面不可手动隐藏"}</span>
      <span>{describePageFieldValidation(field)}</span>
      <span>{describePageFieldOverrides(field)}</span>
      {field.required && (!field.editable || field.hideable) ? <strong className="template-editor__page-field-conflict">规则冲突：必填字段必须可填写且不可隐藏</strong> : null}
    </div>)}
  </details>;
}

function describeResponsiveCopyValue(value: unknown): string {
  if (value === undefined || value === null) return "未设置";
  if (Array.isArray(value)) return value.map(describeResponsiveCopyValue).join(" : ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.value === "number" && typeof record.unit === "string") return `${record.value}${record.unit}`;
    return Object.entries(record).map(([key, entry]) => `${key} ${describeResponsiveCopyValue(entry)}`).join("，");
  }
  return String(value);
}

type TemplateInspectorPanel = "definition" | "layout" | "rules";
type TemplateInspectorContext = "root" | "node" | "slot" | "role";

type TemplateInspectorPanelOption = {
  panel: TemplateInspectorPanel;
  label: string;
};

const TEMPLATE_INSPECTOR_PANELS: Record<TemplateInspectorContext, TemplateInspectorPanelOption[]> = {
  root: [
    { panel: "definition", label: "模板信息" },
    { panel: "layout", label: "模板尺寸" },
    { panel: "rules", label: "发布设置" },
  ],
  node: [
    { panel: "definition", label: "结构" },
    { panel: "layout", label: "布局样式" },
    { panel: "rules", label: "限制" },
  ],
  slot: [
    { panel: "definition", label: "槽位职责" },
    { panel: "layout", label: "显示样式" },
    { panel: "rules", label: "页面可编辑" },
  ],
  role: [
    { panel: "definition", label: "对象职责" },
    { panel: "layout", label: "显示样式" },
    { panel: "rules", label: "页面可编辑" },
  ],
};

function LengthField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value?: DynamicTemplateLength;
  onChange: (value: DynamicTemplateLength | undefined) => void;
  placeholder?: string;
}) {
  return (
    <div className="template-editor__length-field">
      <NumberField
        label={label}
        min={0}
        max={10000}
        value={value?.value}
        placeholder={placeholder}
        onChange={(next) => onChange({ value: next, unit: value?.unit ?? "px" })}
        onClear={() => onChange(undefined)}
      />
      <Select
        value={value?.unit ?? "px"}
        options={LENGTH_UNIT_OPTIONS}
        onChange={(unit) => onChange({ value: value?.value ?? 0, unit })}
        aria-label={`${label}单位`}
      />
    </div>
  );
}

type VisualChoiceOption<T extends string> = {
  value: T;
  label: string;
  accessibleLabel?: string;
  icon?: ReactNode;
  swatch?: string;
  ratio?: string;
  disabledReason?: string;
};

function VisualChoiceField<T extends string>({
  label,
  accessibleLabel,
  value,
  options,
  onChange,
  columns = 3,
  hint,
}: {
  label: string;
  accessibleLabel?: string;
  value: T;
  options: Array<VisualChoiceOption<T>>;
  onChange: (value: T) => void;
  columns?: 2 | 3 | 4 | 5;
  hint?: string;
}) {
  const choiceLabel = accessibleLabel ?? label;
  return (
    <div className="homepage-editor__inspector-field template-editor__visual-field">
      <label>{label}</label>
      <div
        className="template-editor__visual-choices"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        role="group"
        aria-label={choiceLabel}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "is-active" : ""}
            aria-label={`${choiceLabel}：${option.accessibleLabel ?? option.label}${option.disabledReason ? `（${option.disabledReason}）` : ""}`}
            aria-pressed={value === option.value}
            title={option.disabledReason ?? option.label}
            disabled={Boolean(option.disabledReason)}
            onClick={() => {
              if (!option.disabledReason) onChange(option.value);
            }}
          >
            {option.swatch ? (
              <span
                className="template-editor__visual-swatch"
                style={{ background: option.swatch }}
                aria-hidden="true"
              />
            ) : option.ratio ? (
              <span className="template-editor__ratio-preview" aria-hidden="true">
                <i style={{ aspectRatio: option.ratio.replace(":", " / ") }} />
              </span>
            ) : (
              <span className="template-editor__visual-icon" aria-hidden="true">{option.icon}</span>
            )}
            <span className="template-editor__visual-label">{option.label}</span>
          </button>
        ))}
      </div>
      {hint ? <span className="homepage-editor__inspector-hint">{hint}</span> : null}
    </div>
  );
}

function VisualMultiChoiceField<T extends string>({
  label,
  values,
  options,
  onChange,
  hint,
}: {
  label: string;
  values: T[];
  options: Array<VisualChoiceOption<T>>;
  onChange: (values: T[]) => void;
  hint?: string;
}) {
  return (
    <div className="homepage-editor__inspector-field template-editor__visual-field">
      <label>{label}</label>
      <div className="template-editor__visual-choices" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="group" aria-label={label}>
        {options.map((option) => {
          const active = values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={active ? "is-active" : ""}
              aria-label={`${label}：${option.label}`}
              aria-pressed={active}
              title={option.label}
              onClick={() => {
                const next = active
                  ? values.filter((value) => value !== option.value)
                  : [...values, option.value];
                onChange(next);
              }}
            >
              <span className="template-editor__visual-icon" aria-hidden="true">{option.icon}</span>
              <span className="template-editor__visual-label">{option.label}</span>
            </button>
          );
        })}
      </div>
      {hint ? <span className="homepage-editor__inspector-hint">{hint}</span> : null}
    </div>
  );
}

function RatioField({
  label,
  value,
  presets,
  customDefault,
  onChange,
}: {
  label: string;
  value: string;
  presets: Array<{ value: string; label: string }>;
  customDefault: string;
  onChange: (value: string) => void;
}) {
  const presetValues = new Set(["auto", ...presets.map((preset) => preset.value)]);
  const customActive = !presetValues.has(value);
  const [ratioWidth, ratioHeight] = (customActive ? value : customDefault)
    .split(":")
    .map((part) => Number(part));
  const safeWidth = Number.isFinite(ratioWidth) && ratioWidth > 0 ? ratioWidth : 4;
  const safeHeight = Number.isFinite(ratioHeight) && ratioHeight > 0 ? ratioHeight : 3;

  return (
    <>
      <VisualChoiceField
        label={label}
        value={customActive ? "custom" : value}
        columns={presets.length > 3 ? 3 : 5}
        options={[
          { value: "auto", label: "自适应", icon: <ArrowsAltOutlined /> },
          ...presets.map((preset) => ({ ...preset, ratio: preset.value })),
          { value: "custom", label: "自定义", icon: <OneToOneOutlined /> },
        ]}
        onChange={(next) => onChange(next === "custom" ? customDefault : next)}
      />
      {customActive ? (
        <div className="template-editor__ratio-numbers" role="group" aria-label={`${label}自定义数值`}>
          <NumberField
            label={`${label}宽`}
            min={1}
            max={100}
            value={safeWidth}
            onChange={(next) => onChange(`${next}:${safeHeight}`)}
          />
          <span aria-hidden="true">:</span>
          <NumberField
            label={`${label}高`}
            min={1}
            max={100}
            value={safeHeight}
            onChange={(next) => onChange(`${safeWidth}:${next}`)}
          />
        </div>
      ) : null}
    </>
  );
}

type CanvasObjectMeasurement = {
  x: number;
  y: number;
  width: number;
  height: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
};

const EMPTY_LENGTH: DynamicTemplateLength = { value: 0, unit: "px" };

function findElementByData(
  owner: ParentNode,
  attribute: "data-template-node-id" | "data-content-role",
  value: string,
) {
  return Array.from(owner.querySelectorAll<HTMLElement>(`[${attribute}]`))
    .find((element) => element.getAttribute(attribute) === value);
}

function useCanvasObjectMeasurement({
  definition,
  nodeId,
  roleId,
  device,
}: {
  definition?: TemplateDefinitionV2;
  nodeId?: string;
  roleId?: string;
  device: "desktop" | "mobile";
}) {
  const [measurement, setMeasurement] = useState<CanvasObjectMeasurement | null>(null);

  useLayoutEffect(() => {
    if (!definition || !nodeId) {
      setMeasurement(null);
      return undefined;
    }
    const frame = document.querySelector<HTMLIFrameElement>(".template-editor__viewport-frame");
    if (!frame) {
      setMeasurement(null);
      return undefined;
    }
    const activeFrame = frame;
    const activeNodeId = nodeId;

    setMeasurement(null);
    let disposed = false;
    let attachedDocument: Document | null = null;
    let detachDocument: (() => void) | null = null;
    let scheduleAttachedMeasurement: (() => void) | null = null;

    const connectDocument = () => {
      if (disposed) return;
      const nextDocument = activeFrame.contentDocument;
      if (nextDocument === attachedDocument && scheduleAttachedMeasurement) {
        scheduleAttachedMeasurement();
        return;
      }

      detachDocument?.();
      detachDocument = null;
      scheduleAttachedMeasurement = null;
      attachedDocument = null;
      setMeasurement(null);

      if (!nextDocument) return;
      const frameDocument = nextDocument;
      const ownerWindow = frameDocument.defaultView;
      if (!ownerWindow) return;
      const activeWindow = ownerWindow;

      attachedDocument = frameDocument;
      let documentDisposed = false;
      let animationFrameId: number | null = null;
      let observedNode: HTMLElement | null = null;
      let observedParent: HTMLElement | null = null;
      const parentId = roleId ? activeNodeId : findDynamicTemplateParentId(definition, activeNodeId);

      const resizeObserver = new activeWindow.ResizeObserver(() => scheduleMeasurement());
      const mutationObserver = new activeWindow.MutationObserver(() => {
        refreshResizeTargets();
        scheduleMeasurement();
      });

      function refreshResizeTargets() {
        const nextNode = findElementByData(frameDocument, "data-template-node-id", activeNodeId) ?? null;
        const nextParent = parentId
          ? findElementByData(frameDocument, "data-template-node-id", parentId) ?? null
          : frameDocument.querySelector<HTMLElement>(".template-editor__viewport-content");
        if (observedNode !== nextNode) {
          if (observedNode) resizeObserver.unobserve(observedNode);
          if (nextNode) resizeObserver.observe(nextNode);
          observedNode = nextNode;
        }
        if (observedParent !== nextParent) {
          if (observedParent) resizeObserver.unobserve(observedParent);
          if (nextParent) resizeObserver.observe(nextParent);
          observedParent = nextParent;
        }
      }

      function readMeasurement() {
        animationFrameId = null;
        if (disposed || documentDisposed || activeFrame.contentDocument !== frameDocument) return;
        const nodeElement = findElementByData(frameDocument, "data-template-node-id", activeNodeId);
        const target = roleId && nodeElement
          ? findElementByData(nodeElement, "data-content-role", roleId)
          : nodeElement;
        const parent = parentId
          ? findElementByData(frameDocument, "data-template-node-id", parentId)
          : frameDocument.querySelector<HTMLElement>(".template-editor__viewport-content");
        if (!target || !parent) {
          setMeasurement(null);
          return;
        }
        const targetRect = target.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const parentWidth = Math.max(1, parentRect.width);
        const parentHeight = Math.max(1, parentRect.height);
        const next: CanvasObjectMeasurement = {
          x: targetRect.left - parentRect.left,
          y: targetRect.top - parentRect.top,
          width: targetRect.width,
          height: targetRect.height,
          xPercent: ((targetRect.left - parentRect.left) / parentWidth) * 100,
          yPercent: ((targetRect.top - parentRect.top) / parentHeight) * 100,
          widthPercent: (targetRect.width / parentWidth) * 100,
          heightPercent: (targetRect.height / parentHeight) * 100,
        };
        setMeasurement((current) => current && Object.keys(next).every((key) => (
          Math.abs(current[key as keyof CanvasObjectMeasurement] - next[key as keyof CanvasObjectMeasurement]) < 0.05
        )) ? current : next);
      }

      function scheduleMeasurement() {
        if (disposed || documentDisposed || animationFrameId !== null) return;
        animationFrameId = activeWindow.requestAnimationFrame(readMeasurement);
      }

      // Document is a stable, valid MutationObserver target even before HTML parsing
      // creates body, and it also covers a body replacement within the same document.
      mutationObserver.observe(frameDocument, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style", "hidden"],
      });
      refreshResizeTargets();
      scheduleAttachedMeasurement = scheduleMeasurement;
      const timers = [0, 50, 200].map((delay) => activeWindow.setTimeout(scheduleMeasurement, delay));
      const handlePageHide = () => {
        if (attachedDocument !== frameDocument) return;
        detachDocument?.();
        detachDocument = null;
        scheduleAttachedMeasurement = null;
        attachedDocument = null;
      };
      activeWindow.addEventListener("pagehide", handlePageHide);

      detachDocument = () => {
        if (documentDisposed) return;
        documentDisposed = true;
        resizeObserver.disconnect();
        mutationObserver.disconnect();
        timers.forEach((timer) => activeWindow.clearTimeout(timer));
        if (animationFrameId !== null) activeWindow.cancelAnimationFrame(animationFrameId);
        activeWindow.removeEventListener("pagehide", handlePageHide);
        observedNode = null;
        observedParent = null;
      };
    };

    activeFrame.addEventListener("load", connectDocument);
    connectDocument();

    return () => {
      disposed = true;
      activeFrame.removeEventListener("load", connectDocument);
      detachDocument?.();
      detachDocument = null;
      scheduleAttachedMeasurement = null;
      attachedDocument = null;
    };
  }, [definition, device, nodeId, roleId]);

  return measurement;
}

function formatCanvasMetric(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function CanvasMeasurementSummary({ measurement }: { measurement: CanvasObjectMeasurement | null }) {
  if (!measurement) {
    return <p className="template-editor__panel-empty-copy" role="status">正在读取当前画布数值…</p>;
  }
  const metrics = [
    ["横向位置 X", measurement.x, measurement.xPercent],
    ["纵向位置 Y", measurement.y, measurement.yPercent],
    ["实际宽度 W", measurement.width, measurement.widthPercent],
    ["实际高度 H", measurement.height, measurement.heightPercent],
  ] as const;
  return (
    <>
      <div className="template-editor__dimension-summary" role="group" aria-label="当前画布数值">
        {metrics.map(([label, pixels, percent]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{formatCanvasMetric(pixels)} px</strong>
            <small>{formatCanvasMetric(percent)}% · 相对父级</small>
          </div>
        ))}
      </div>
      <span className="homepage-editor__inspector-hint">拖动或缩放画布对象时实时更新；输入值写入当前画布的模板规则。</span>
    </>
  );
}

function getUniformSpacing(value?: DynamicTemplateBoxSpacing) {
  if (!value) return undefined;
  const sides = [value.top, value.right, value.bottom, value.left];
  return sides.every((side) => side.value === value.top.value && side.unit === value.top.unit)
    ? value.top
    : undefined;
}

function BoxSpacingField({
  label,
  value,
  onChange,
}: {
  label: "内边距" | "外边距";
  value?: DynamicTemplateBoxSpacing;
  onChange: (value: DynamicTemplateBoxSpacing | undefined) => void;
}) {
  const uniform = getUniformSpacing(value);
  const updateSide = (side: keyof DynamicTemplateBoxSpacing, next?: DynamicTemplateLength) => {
    const base = value ?? {
      top: EMPTY_LENGTH,
      right: EMPTY_LENGTH,
      bottom: EMPTY_LENGTH,
      left: EMPTY_LENGTH,
    };
    onChange({
      ...base,
      [side]: next ?? { value: 0, unit: base[side].unit },
    });
  };
  return (
    <>
      <div className="homepage-editor__inspector-field">
        <label>{`统一${label}`}</label>
        <LengthField
          label={`统一${label}`}
          value={uniform}
          placeholder={value ? "四边数值不同" : "未设置"}
          onChange={(next) => onChange(next ? {
            top: next,
            right: next,
            bottom: next,
            left: next,
          } : undefined)}
        />
      </div>
      {value ? (
        <section className="template-editor__settings-section"><h3>分别设置{label}</h3>
          <div className="template-editor__geometry-grid">
            {(["top", "right", "bottom", "left"] as const).map((side) => {
              const sideLabel = ({ top: "上", right: "右", bottom: "下", left: "左" })[side];
              return (
                <div className="homepage-editor__inspector-field" key={side}>
                  <label>{sideLabel}</label>
                  <LengthField
                    label={`${label}${sideLabel}`}
                    value={value[side]}
                    onChange={(next) => updateSide(side, next)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}

function ContractRoleIcon({ kind }: { kind: keyof typeof TEMPLATE_CONTRACT_KIND_LABELS }) {
  if (kind === "media") return <PictureOutlined />;
  if (kind === "video") return <VideoCameraOutlined />;
  if (kind === "text") return <FontSizeOutlined />;
  if (kind === "action") return <LinkOutlined />;
  if (kind === "product") return <ShoppingOutlined />;
  return <AppstoreOutlined />;
}

function BatchNumberEditor({
  label,
  value,
  mixed,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  mixed: boolean;
  onCommit: (value: number) => void;
}) {
  const inputId = `template-batch-${label.replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, "-")}`;
  const transaction = useCommittedNumberInput({
    label,
    value,
    min: -10000,
    max: 10000,
    onCommit,
    commitUnchanged: true,
  });
  return (
    <div className="homepage-editor__inspector-field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        ref={transaction.inputRef}
        type="text"
        role="spinbutton"
        inputMode="decimal"
        data-committed-number-input="true"
        value={transaction.draft}
        placeholder={mixed ? "混合值" : undefined}
        aria-invalid={transaction.error ? "true" : undefined}
        onChange={(event) => transaction.setDraft(event.target.value)}
        onBlur={transaction.onBlur}
        onKeyDown={transaction.onKeyDown}
      />
      {transaction.error ? (
        <span className="homepage-editor__field-error" role="alert">
          请输入有效的{label}。{transaction.error}
        </span>
      ) : null}
    </div>
  );
}

function BatchValueEditor({
  field,
  resetKey,
  onCommit,
}: {
  field: TemplateInspectorBatchFieldPlan;
  resetKey: number;
  onCommit: (value: unknown) => void;
}) {
  const sameValue = field.value?.kind === "same" ? field.value.value : undefined;
  const mixed = field.value?.kind === "mixed";
  const [draftValue, setDraftValue] = useState(
    sameValue === undefined ? "" : typeof sameValue === "string" ? sameValue : JSON.stringify(sameValue),
  );
  const [error, setError] = useState<string | null>(null);
  const editingRef = useRef(false);
  useEffect(() => {
    if (editingRef.current) return;
    setDraftValue(sameValue === undefined ? "" : typeof sameValue === "string" ? sameValue : JSON.stringify(sameValue));
    setError(null);
  }, [resetKey, sameValue]);
  if (typeof sameValue === "number" || (mixed && ["role.zIndex", "responsive.order"].includes(field.field))) {
    return (
      <BatchNumberEditor
        key={`${field.field}:${resetKey}`}
        label={field.label}
        value={typeof sameValue === "number" ? sameValue : undefined}
        mixed={mixed}
        onCommit={onCommit}
      />
    );
  }
  if (typeof sameValue === "boolean") {
    return (
      <label className="homepage-editor__inspector-field">
        <span>{field.label}</span>
        <select
          aria-label={field.label}
          value={String(sameValue)}
          onChange={(event) => onCommit(event.target.value === "true")}
        >
          <option value="true">开启</option>
          <option value="false">关闭</option>
        </select>
      </label>
    );
  }
  const commit = () => {
    if (!editingRef.current) return true;
    const normalized = draftValue.trim();
    if (!normalized) {
      setError(`请输入有效的${field.label}。`);
      return false;
    }
    try {
      const value = typeof sameValue === "string" ? draftValue : JSON.parse(normalized);
      editingRef.current = false;
      setError(null);
      onCommit(value);
      return true;
    } catch {
      setError(`${field.label}格式无效，未修改任何对象。`);
      return false;
    }
  };
  return (
    <div className="homepage-editor__inspector-field">
      <label htmlFor={`template-batch-value-${field.field}`}>{field.label}</label>
      <input
        id={`template-batch-value-${field.field}`}
        value={draftValue}
        placeholder={mixed ? "混合值；请输入完整值" : undefined}
        aria-invalid={error ? "true" : undefined}
        onChange={(event) => {
          editingRef.current = true;
          setDraftValue(event.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (commit()) event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            editingRef.current = false;
            setDraftValue(sameValue === undefined ? "" : typeof sameValue === "string" ? sameValue : JSON.stringify(sameValue));
            setError(null);
            event.currentTarget.blur();
          }
        }}
      />
      {error ? <span className="homepage-editor__field-error" role="alert">{error}</span> : null}
    </div>
  );
}

function TemplateBatchInspector({
  definition,
  device,
  selectionSnapshot,
}: {
  definition: TemplateDefinitionV2;
  device: "desktop" | "mobile";
  selectionSnapshot: TemplateEditorSelectionSnapshot;
}) {
  const executeCommand = useTemplateEditorSession((state) => state.executeCommand);
  const [batchError, setBatchError] = useState<{ code: string; message: string } | null>(null);
  const [editorResetKey, setEditorResetKey] = useState(0);
  const plan = useMemo(() => createTemplateInspectorBatchPlan({
    definition,
    device,
    targets: selectionSnapshot.targets,
    ...(selectionSnapshot.primaryTarget ? { primaryTarget: selectionSnapshot.primaryTarget } : {}),
  }), [definition, device, selectionSnapshot]);
  useEffect(() => {
    setBatchError(null);
  }, [plan.fingerprint]);
  const commitField = (field: TemplateInspectorBatchFieldPlan, value: unknown) => {
    const result = executeCommand({
      type: "batch-update-design-field",
      label: `批量修改${field.label}`,
      device,
      targets: plan.targets,
      ...(plan.primaryTarget ? { primaryTarget: plan.primaryTarget } : {}),
      field: field.field,
      value,
      reviewedPlan: plan,
    });
    if (!result.ok) {
      setBatchError({ code: result.code, message: result.message });
      setEditorResetKey((current) => current + 1);
      return;
    }
    setBatchError(null);
  };
  return (
    <aside
      className="homepage-editor__inspector template-editor__inspector"
      aria-label="模板属性"
      data-template-inspector-view="batch"
      data-template-inspector-device={device}
    >
      <section className="template-editor__batch-inspector" role="region" aria-label="多选属性">
        <header className="homepage-editor__inspector-header">
          <span className="template-editor__inspector-object-icon" aria-hidden="true"><ApartmentOutlined /></span>
          <div className="homepage-editor__inspector-heading">
            <span className="homepage-editor__inspector-eyebrow">当前选择</span>
            <strong className="homepage-editor__inspector-title">{plan.targets.length} 个对象</strong>
            <span className="template-editor__inspector-breadcrumb">一次提交形成一步撤销历史</span>
          </div>
        </header>
        <div className="homepage-editor__inspector-scroll">
          <div className="template-editor__batch-targets" aria-label="批量目标">
            {plan.targetPlans.map((targetPlan) => (
              <div
                key={`${targetPlan.target.targetId}:${targetPlan.target.roleId ?? "node"}`}
                data-template-batch-target-id={targetPlan.target.targetId}
                data-template-batch-target-role-id={targetPlan.target.roleId}
              >
                <strong>{targetPlan.nodeName ?? targetPlan.target.targetId}</strong>
                {targetPlan.target.roleId ? <span>{targetPlan.target.roleId}</span> : null}
              </div>
            ))}
          </div>
          {batchError ? (
            <div
              className="template-editor__command-error"
              role="alert"
              aria-label="批量修改失败"
              data-template-batch-error-code={batchError.code}
            >
              <strong>{batchError.code}</strong>
              <span>{batchError.message}</span>
            </div>
          ) : null}
          {plan.commonFields.length === 0 ? (
            <div role="status" aria-label="无共同批量字段">
              所选 {plan.targets.length} 个对象没有可共同批量编辑的字段。请调整选择后再试。
            </div>
          ) : plan.commonFields.map((field) => (
            <section
              key={field.field}
              className="template-editor__batch-field"
              data-template-batch-field={field.field}
              data-batch-value-state={field.value?.kind ?? "unavailable"}
            >
              <div className="template-editor__batch-field-state">
                <strong>{field.label}</strong>
                <span>{field.value?.kind === "mixed" ? "混合值" : "相同值"}</span>
              </div>
              <BatchValueEditor
                key={`${field.field}:${editorResetKey}`}
                field={field}
                resetKey={editorResetKey}
                onCommit={(value) => commitField(field, value)}
              />
            </section>
          ))}
          {plan.fields.filter((field) => !field.applicableToAll).map((field) => (
            <div
              key={`excluded:${field.field}`}
              className="template-editor__batch-field-exclusion"
              role="status"
              aria-label="批量字段不适用"
            >
              {field.label}不能应用到全部 {plan.targets.length} 个对象
              {field.exclusions[0]?.message ? `：${field.exclusions[0].message}` : "。"}
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

import type {
  PublishedDraftAvailability,
  TemplatePublishReview,
} from "./TemplateWorkspaceController";
import type { TemplateInspectorIssueTarget } from "./templateInspectorCapabilities";

export default function DynamicTemplateInspectorPanel({
  localOnly = false,
  workspaceVisible = true,
  metadataOpenRequest = 0,
  validationOpenRequest = 0,
  publishReview = null,
  publishIssueEditing = false,
  publishedDraftAvailability = null,
  onSelectPublishIssue,
  onPrepareIssueTarget,
  onEditPublishIssue,
  onOpenPublishReview,
  onConfirmPublish,
  onCancelPublishReview,
  onRecheckPublishReview,
  onRetryPublishVerification,
  onRetryFailedPublish,
  onRetryCatalogRefresh,
  onReloadPublishedDraft,
  onUsePublishedTemplate,
}: {
  localOnly?: boolean;
  workspaceVisible?: boolean;
  metadataOpenRequest?: number;
  /** 只读制作检查请求；不进入发布流程，也不保存草稿。 */
  validationOpenRequest?: number;
  publishReview?: TemplatePublishReview | null;
  publishIssueEditing?: boolean;
  publishedDraftAvailability?: PublishedDraftAvailability | null;
  onSelectPublishIssue?: (index: number) => void;
  onPrepareIssueTarget?: (target: TemplateInspectorIssueTarget) => void;
  onEditPublishIssue?: (target: TemplateInspectorIssueTarget) => boolean;
  onOpenPublishReview?: () => void;
  onConfirmPublish?: () => void;
  onCancelPublishReview?: () => void;
  onRecheckPublishReview?: () => void;
  onRetryPublishVerification?: () => void;
  onRetryFailedPublish?: () => void;
  onRetryCatalogRefresh?: () => void;
  onReloadPublishedDraft?: () => void;
  onUsePublishedTemplate?: () => void;
}) {
  const publishReviewRef = useRef<HTMLElement>(null);
  const validationSectionRef = useRef<HTMLElement>(null);
  const inspectorPanelRef = useRef<HTMLElement>(null);
  const issueFocusRequestRef = useRef(0);
  const handledMetadataOpenRequestRef = useRef(0);
  const handledValidationOpenRequestRef = useRef(0);
  const { modal } = AntdApp.useApp();
  useEffect(() => {
    if (!workspaceVisible || !publishReview?.requestId) return;
    let secondFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        publishReviewRef.current?.scrollIntoView({ block: "nearest" });
        publishReviewRef.current?.focus();
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [publishReview?.requestId, workspaceVisible]);
  const draft = useTemplateEditorSession((state) => state.draft);
  const previewDocument = useTemplateEditorSession((state) => state.previewDocument);
  const breakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const baseline = useTemplateEditorSession((state) => state.baseline);
  const device = useTemplateEditorSession((state) => state.device);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  const selectedContractRole = useTemplateEditorSession((state) => state.selectedContractRole);
  const selectionSnapshot = useTemplateEditorSession((state) => state.selectionSnapshot);
  const inspectorTask = useTemplateEditorSession((state) => state.inspectorTask);
  const inspectorView = useTemplateEditorSession((state) => state.inspectorView);
  const executeCommand = useTemplateEditorSession((state) => state.executeCommand);
  const lastCommandResult = useTemplateEditorSession((state) => state.lastCommandResult);
  const clearLastCommandResult = useTemplateEditorSession((state) => state.clearLastCommandResult);
  const setDynamicVersionNote = useTemplateEditorSession((state) => state.setDynamicVersionNote);
  const selectObject = useTemplateEditorSession((state) => state.selectObject);
  const setDevice = useTemplateEditorSession((state) => state.setDevice);
  const productionReviewFacts = useTemplateEditorSession((state) => state.productionReviewFacts);
  const confirmDeviceReview = useTemplateEditorSession((state) => state.confirmDeviceReview);
  const confirmPageScopeReview = useTemplateEditorSession((state) => state.confirmPageScopeReview);
  const setInspectorTask = useTemplateEditorSession((state) => state.setInspectorTask);
  const setInspectorView = useTemplateEditorSession((state) => state.setInspectorView);
  const dynamicDraft = useMemo(() => draft ? {
    ...draft,
    definition: resolveTemplateDefinitionForBreakpoint(previewDocument ?? draft.definition, breakpoint),
  } : null, [draft, previewDocument, breakpoint]);
  const metadataDetailsRef = useRef<HTMLElement>(null);
  const [gridColumnsError, setGridColumnsError] = useState<string | null>(null);
  // 名称和视觉职责原位可见，目录资料按需展开；问题定位仍能直接打开对应字段。
  const [metadataDetailsOpen, setMetadataDetailsOpen] = useState(false);
  const [rootSettingsOpen, setRootSettingsOpen] = useState(false);
  const [defaultContentFocus, setDefaultContentFocus] = useState<{ nodeId: string; slotId: string; requestId: number } | null>(null);
  const [locateIssueNotice, setLocateIssueNotice] = useState<string | null>(null);
  const [locateUnlockOwnerId, setLocateUnlockOwnerId] = useState<string | null>(null);
  const [locateIssueRecovery, setLocateIssueRecovery] = useState(false);
  const [pendingIssueFocus, setPendingIssueFocus] = useState<{
    requestId: number;
    templateId: string;
    target: TemplateInspectorIssueTarget;
    source: "review" | "validation";
  } | null>(null);
  const [selectedResponsiveGroups, setSelectedResponsiveGroups] = useState<DynamicTemplateResponsiveGroup[]>([]);
  const selectionNodeId = dynamicDraft && selectedNodeId && dynamicDraft.definition.nodes[selectedNodeId]
    ? selectedNodeId
    : dynamicDraft?.definition.rootNodeId;
  const selectionNode = selectionNodeId ? dynamicDraft?.definition.nodes[selectionNodeId] : undefined;
  const selectedRoleId = selectedContractRole && selectedContractRole.nodeId === selectionNodeId
    ? selectedContractRole.roleId
    : undefined;
  const inspectorContext: TemplateInspectorContext = selectedRoleId
    ? "role"
    : selectionNodeId === dynamicDraft?.definition.rootNodeId
      ? "root"
      : selectionNode?.slotId
        ? "slot"
        : "node";
  const selectionContextKey = [
    dynamicDraft?.definition.templateId ?? "",
    selectionNodeId ?? "",
    selectedRoleId ?? "",
  ].join(":");

  useEffect(() => {
    setGridColumnsError(null);
  }, [device, selectionContextKey]);
  useEffect(() => {
    const openSettings = () => {
      if (focusFirstInvalidNumberField()) return;
      const state = useTemplateEditorSession.getState();
      if (!state.draft || state.previewMode || state.activeInteraction) return;
      state.selectObject(state.draft.definition.rootNodeId);
      state.setInspectorTask("design");
      state.setInspectorView("context");
      setLocateIssueNotice(null);
      setLocateUnlockOwnerId(null);
      setLocateIssueRecovery(false);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const input = inspectorPanelRef.current?.querySelector<HTMLInputElement>('[data-template-inspector-field="name"] input');
        input?.scrollIntoView({ block: "nearest" });
        input?.focus();
        input?.select();
      }));
    };
    window.addEventListener("template-editor:open-settings", openSettings);
    return () => window.removeEventListener("template-editor:open-settings", openSettings);
  }, []);
  useEffect(() => {
    const openMetadata = () => {
      if (focusFirstInvalidNumberField()) return;
      const state = useTemplateEditorSession.getState();
      const rootNodeId = state.draft?.definition.rootNodeId;
      if (rootNodeId) state.selectObject(rootNodeId);
      state.setInspectorTask("design");
      state.setInspectorView("context");
      setRootSettingsOpen(true);
      setMetadataDetailsOpen(true);
      window.requestAnimationFrame(() => {
        metadataDetailsRef.current?.scrollIntoView({ block: "nearest" });
      });
    };
    window.addEventListener("template-editor:open-metadata", openMetadata);
    return () => window.removeEventListener("template-editor:open-metadata", openMetadata);
  }, []);
  useEffect(() => {
    const openDefaultContent = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: unknown; slotId?: unknown }>).detail;
      const state = useTemplateEditorSession.getState();
      if (!state.draft || state.previewMode || focusFirstInvalidNumberField()
        || typeof detail?.nodeId !== "string" || typeof detail.slotId !== "string"
        || state.draft.definition.nodes[detail.nodeId]?.slotId !== detail.slotId) return;
      state.selectObject(detail.nodeId);
      state.setInspectorTask("design");
      state.setInspectorView("context");
      setDefaultContentFocus({ nodeId: detail.nodeId, slotId: detail.slotId, requestId: Date.now() });
    };
    window.addEventListener("template-editor:open-default-content", openDefaultContent);
    return () => window.removeEventListener("template-editor:open-default-content", openDefaultContent);
  }, []);
  useEffect(() => {
    if (!workspaceVisible || !defaultContentFocus || selectionNodeId !== defaultContentFocus.nodeId) return;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => {
      const field = inspectorPanelRef.current?.querySelector<HTMLElement>(`[data-template-default-content="${CSS.escape(defaultContentFocus.slotId)}"]`);
      if (!field) return;
      field.scrollIntoView({ block: "nearest" });
      field.querySelector<HTMLElement>("button:not(:disabled),input:not(:disabled):not([type=file]):not([type=hidden]),textarea:not(:disabled)")?.focus();
    }); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [defaultContentFocus, selectionNodeId, workspaceVisible]);
  useEffect(() => {
    if (
      !workspaceVisible
      || metadataOpenRequest <= 0
      || metadataOpenRequest <= handledMetadataOpenRequestRef.current
    ) return undefined;
    handledMetadataOpenRequestRef.current = metadataOpenRequest;
    if (focusFirstInvalidNumberField()) return undefined;
    const state = useTemplateEditorSession.getState();
    const rootNodeId = state.draft?.definition.rootNodeId;
    if (!rootNodeId) return undefined;
    state.selectObject(rootNodeId);
    state.setInspectorTask("design");
    state.setInspectorView("context");
    setRootSettingsOpen(true);
    setMetadataDetailsOpen(true);
    let secondFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        metadataDetailsRef.current?.scrollIntoView({ block: "nearest" });
        inspectorPanelRef.current
          ?.querySelector<HTMLInputElement>('[data-template-inspector-field="name"] input')
          ?.focus();
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [metadataOpenRequest, workspaceVisible]);
  useEffect(() => {
    if (!workspaceVisible || validationOpenRequest <= handledValidationOpenRequestRef.current) return;
    if (focusFirstInvalidNumberField()) return;
    const state = useTemplateEditorSession.getState();
    if (!state.draft || state.activeInteraction) return;
    handledValidationOpenRequestRef.current = validationOpenRequest;
    state.selectObject(state.draft.definition.rootNodeId);
    state.setInspectorTask("design");
    state.setInspectorView("context");
    let secondFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        validationSectionRef.current?.scrollIntoView({ block: "nearest" });
        validationSectionRef.current?.focus();
      });
    });
    return () => { window.cancelAnimationFrame(frame); window.cancelAnimationFrame(secondFrame); };
  }, [validationOpenRequest, workspaceVisible]);
  const canvasMeasurement = useCanvasObjectMeasurement({
    definition: dynamicDraft?.definition,
    nodeId: selectionNodeId,
    roleId: selectedRoleId,
    device,
  });
  const validation = useMemo(
    () => draft ? validateDynamicTemplateDefinition(draft.definition) : null,
    [draft],
  );
  const publishValidation = useMemo(
    () => draft ? validateDynamicTemplatePublishDefinition(draft.definition) : null,
    [draft],
  );
  useEffect(() => {
    if (!pendingIssueFocus || !dynamicDraft) return;
    const definition = dynamicDraft.definition;
    if (pendingIssueFocus.templateId !== definition.templateId) {
      setPendingIssueFocus(null);
      return;
    }

    const { target } = pendingIssueFocus;
    const activeNodeId = selectedNodeId && definition.nodes[selectedNodeId]
      ? selectedNodeId
      : definition.rootNodeId;
    if (
      target.objectId !== activeNodeId
      || target.task !== inspectorTask
      || target.view !== inspectorView
      || (target.device && target.device !== device)
    ) return;

    let cancelled = false;
    let frame = 0;
    let attemptsRemaining = 4;
    let structureSettleFrames = 2;
    const finish = () => setPendingIssueFocus((current) => (
      current?.requestId === pendingIssueFocus.requestId ? null : current
    ));
    const focusReviewFallback = () => {
      const lockOwner = target.destination === "inspector-field"
        ? getDynamicTemplateStructureLockOwnerId(definition, target.objectId)
        : null;
      setLocateUnlockOwnerId(lockOwner);
      setLocateIssueNotice(lockOwner
        ? `“${definition.nodes[lockOwner]?.name ?? "上级对象"}”的结构已锁定，请先定位并关闭“锁定位置、尺寸和层级”，再返回本条问题。`
        : target.reason ?? (target.destination === "unavailable"
          ? "当前问题没有可安全直接编辑的字段。"
          : `“${target.field}”当前不可直接编辑。请先恢复该字段所需的设置。`));
      setLocateIssueRecovery(target.destination === "inspector-field" && target.access !== "editable");
      inspectorPanelRef.current?.focus();
      finish();
    };
    const markAndFocus = (destination: HTMLElement, focusTarget: HTMLElement) => {
      document.querySelectorAll<HTMLElement>("[data-template-inspector-located]")
        .forEach((element) => delete element.dataset.templateInspectorLocated);
      destination.dataset.templateInspectorLocated = "true";
      destination.scrollIntoView({ block: "nearest", behavior: "smooth" });
      focusTarget.focus();
      if (target.destination === "structure-region" || target.destination === "structure-slot") {
        setLocateIssueNotice(target.reason ?? "请在结构工具中完成选择。");
      } else if (pendingIssueFocus.source === "validation" && target.access !== "editable") {
        setLocateIssueNotice(target.reason ?? `“${target.field}”由系统管理，不能在此直接修改。`);
        setLocateIssueRecovery(true);
      }
      finish();
    };
    const retryOrFinish = () => {
      attemptsRemaining -= 1;
      if (attemptsRemaining > 0) frame = window.requestAnimationFrame(locate);
      else focusReviewFallback();
    };
    const locate = () => {
      if (cancelled) return;
      if (target.destination === "unavailable") {
        focusReviewFallback();
        return;
      }
      if (target.destination === "structure-region" || target.destination === "structure-slot") {
        if (target.destination === "structure-slot") {
          const trigger = document.querySelector<HTMLButtonElement>(
            '.template-editor__add-trigger[aria-label="添加槽位"]',
          );
          if (trigger?.getAttribute("aria-expanded") !== "true") trigger?.click();
        }
        const destination = target.destination === "structure-slot"
          ? document.querySelector<HTMLElement>(
              '[role="region"][aria-label="常用内容槽位"], [role="region"][aria-label="先创建区域并添加"]',
            )
          : document.querySelector<HTMLElement>(`[data-template-inspector-field="${CSS.escape(target.field)}"]`);
        if (!destination) {
          retryOrFinish();
          return;
        }
        if (structureSettleFrames > 0) {
          structureSettleFrames -= 1;
          frame = window.requestAnimationFrame(locate);
          return;
        }
        const focusTarget = destination.matches("button,input,select,textarea,[tabindex]")
          ? destination
          : destination.querySelector<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]",
            );
        if (!focusTarget) {
          retryOrFinish();
          return;
        }
        markAndFocus(destination, focusTarget);
        return;
      }

      const field = inspectorPanelRef.current?.querySelector<HTMLElement>(
        `[data-template-inspector-field="${CSS.escape(target.field)}"]`,
      ) ?? (target.field.startsWith("responsive.*.")
        ? inspectorPanelRef.current?.querySelector<HTMLElement>(
            `[data-template-design-property="${CSS.escape(target.field.replace(/^responsive\.\*\./, "node."))}"]`,
          )
        : null);
      if (!field) {
        retryOrFinish();
        return;
      }
      let ancestor: HTMLElement | null = field;
      while (ancestor && ancestor !== inspectorPanelRef.current) {
        if (ancestor.hidden) {
          ancestor.parentElement?.querySelector<HTMLButtonElement>(
            ':scope > button[aria-expanded="false"]',
          )?.click();
        }
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
        ancestor = ancestor.parentElement;
      }
      const focusTarget = target.access === "editable"
        ? field.matches("input:not(:disabled):not([readonly]),button:not(:disabled),select:not(:disabled),textarea:not(:disabled):not([readonly]),[tabindex]:not([tabindex='-1']):not([aria-disabled='true'])")
          ? field
          : field.querySelector<HTMLElement>(
              "input:not(:disabled):not([readonly]),button:not(:disabled),select:not(:disabled),textarea:not(:disabled):not([readonly]),[tabindex]:not([tabindex='-1']):not([aria-disabled='true'])",
            )
        : field;
      if (!focusTarget) {
        retryOrFinish();
        return;
      }
      markAndFocus(field, focusTarget);
    };
    frame = window.requestAnimationFrame(locate);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [device, dynamicDraft, inspectorTask, inspectorView, pendingIssueFocus, selectedNodeId]);
  if (!dynamicDraft || !validation) return null;

  const definition = dynamicDraft.definition;
  // 当前断点投影会把旧合同的 desktop/mobile 都替换为同一份有效值；
  // 跨画布复制与来源判断必须读取会话原始定义，否则真实差异会被误判为无差异。
  const responsiveDefinition = draft!.definition;
  if (selectionSnapshot.targets.length > 1 && !publishReview) {
    if (Number(definition.schemaVersion) >= 2) return <aside className="homepage-editor__inspector template-editor__inspector" aria-label="模板属性"><div className="homepage-editor__inspector-scroll"><TemplateNativeDesignControls nodeIds={selectionSnapshot.targets.filter((target) => !target.roleId).map((target) => target.targetId)} /></div></aside>;
    return (
      <TemplateBatchInspector
        definition={definition}
        device={device}
        selectionSnapshot={selectionSnapshot}
      />
    );
  }
  const activeNodeId = selectedNodeId && definition.nodes[selectedNodeId]
    ? selectedNodeId
    : definition.rootNodeId;
  const node = definition.nodes[activeNodeId];
  const isRoot = activeNodeId === definition.rootNodeId;
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  const pageFields = getDynamicTemplatePageFieldDescriptors(definition);
  const pageField = slot
    ? pageFields.find((field) => field.slotId === slot.slotId)
    : undefined;
  // 与页面实例 selectedTextSlot 保持一致；图标虽使用文字输入，不开放文字排版。
  const supportsPageTextStyles = Boolean(pageField && supportsPageTextDesign(pageField));
  const contentContractModuleType = slot
    ? getContentTemplateModuleTypeForSlotType(slot.type)
    : undefined;
  const contentContract = contentContractModuleType
    ? getContentTemplateContract(contentContractModuleType)
    : undefined;
  const selectedRoleObject = selectedContractRole?.nodeId === activeNodeId
    ? contentContract?.editorCapabilities.editableObjects.find(
      (object) => object.roleId === selectedContractRole.roleId,
    )
    : undefined;
  const selectedRoleDefinition = selectedRoleObject
    ? contentContract?.roles.find((role) => role.id === selectedRoleObject.roleId)
    : undefined;
  const selectedRoleApplicable = !selectedRoleDefinition?.appliesTo
    || selectedRoleDefinition.appliesTo.includes(device);
  const selectedRoleSupports = (capability: ContentTemplateEditableCapability) => {
    if (!selectedRoleObject?.capabilities.includes(capability)) return false;
    const viewports = selectedRoleObject.capabilityViewports?.[capability];
    return !viewports || viewports.includes(device);
  };
  const selectedRoleVisual = selectedRoleObject ? resolveVisualNode({
    __instanceOverrides: node.props.contentTemplateLayoutData,
  }, selectedRoleObject.roleId, device) : undefined;
  const selectedRoleRect = selectedRoleObject && contentContract
    ? getEffectiveContractRoleDesignValue(definition, activeNodeId, selectedRoleObject.roleId, device, "rect")
    : undefined;
  const selectedRoleZIndex = selectedRoleObject
    ? getEffectiveContractRoleDesignValue(definition, activeNodeId, selectedRoleObject.roleId, device, "zIndex")
    : undefined;
  const selectedRoleMediaLayout = selectedRoleObject
    ? contentContract?.editorCapabilities.layoutOverrides?.slots?.find(
      (candidate) => candidate.roleId === selectedRoleObject.roleId,
    )
    : undefined;
  const selectedRoleTextLayout = selectedRoleObject
    ? contentContract?.editorCapabilities.layoutOverrides?.textRoles?.find(
      (candidate) => candidate.roleId === selectedRoleObject.roleId,
    )
    : undefined;
  const selectedRoleLayoutRoot: Record<string, unknown> | undefined = isVisualRecord(node.props.contentTemplateLayoutData)
    ? node.props.contentTemplateLayoutData
    : undefined;
  const selectedRoleNodes: Record<string, unknown> | undefined = isVisualRecord(selectedRoleLayoutRoot?.nodes)
    ? selectedRoleLayoutRoot.nodes
    : undefined;
  const selectedRoleValue = selectedRoleObject
    ? selectedRoleNodes?.[selectedRoleObject.roleId]
    : undefined;
  const selectedRoleRecord: Record<string, unknown> | undefined = isVisualRecord(selectedRoleValue)
    ? selectedRoleValue
    : undefined;
  const selectedRoleRects = isVisualRecord(selectedRoleRecord?.rectByViewport)
    ? selectedRoleRecord.rectByViewport
    : undefined;
  const selectedRoleLayers = isVisualRecord(selectedRoleRecord?.zIndexByViewport)
    ? selectedRoleRecord.zIndexByViewport
    : undefined;
  const selectedRoleHasDeviceOverride = Boolean(
    selectedRoleObject
    && (selectedRoleRects?.[device] !== undefined || selectedRoleLayers?.[device] !== undefined),
  );
  const selectedRoleHasTypographyOverride = Boolean(
    selectedRoleRecord && isVisualRecord(selectedRoleRecord.typography),
  );
  const rules = node.responsive[device];
  const designFieldResolution = resolveTemplateInspectorDesignFields({
    definition,
    device,
    targetId: activeNodeId,
    ...(selectedRoleObject ? { roleId: selectedRoleObject.roleId } : {}),
  });
  const hasDesignField = (field: string) => designFieldResolution.fields.some((candidate) => candidate.field === field);
  const applicableResponsiveGroups = getDynamicTemplateApplicableResponsiveGroups(responsiveDefinition, activeNodeId, device, selectedRoleObject?.roleId);
  const activeSelectedResponsiveGroups = selectedResponsiveGroups.filter((group) => applicableResponsiveGroups.includes(group));
  const toggleResponsiveGroup = (group: DynamicTemplateResponsiveGroup, checked: boolean) => setSelectedResponsiveGroups((current) => (
    checked ? [...new Set([...current, group])] : current.filter((candidate) => candidate !== group)
  ));
  const registry = getDynamicTemplateNodeRegistryEntry(node.type);
  const inspectorObjectContext = inspectorContext === "root"
    ? { scope: "root" as const, node }
    : inspectorContext === "role" && slot && selectedRoleObject
      ? { scope: "role" as const, node, slot, roleId: selectedRoleObject.roleId }
      : inspectorContext === "slot" && slot
        ? { scope: "slot" as const, node, slot }
        : { scope: "node" as const, node };
  const inspectorCapabilities = getTemplateInspectorCapabilities(inspectorObjectContext);
  const hasCapability = (field: string) => hasTemplateInspectorCapability(
    inspectorCapabilities,
    field,
  );
  const isLayoutContainer = registry.canHaveChildren;
  const registrySlotType = registry.kind === "slot" ? registry.slotType : undefined;
  const isImageSlot = registrySlotType === "image";
  const instancePolicy: Partial<NonNullable<typeof node.instanceEditPolicy>> =
    pageField?.effectiveDesignOverrideCapabilities
      ?? (slot ? getEffectiveDynamicTemplateInstanceEditPolicy(node, { ...slot, editable: true }) : null)
      ?? {};

  const updateDefinition = (
    mutate: (next: ResolvedTemplateDefinition) => void,
    label = "更新模板字段",
  ) => executeCommand({ type: "transform-definition", label, transform: (next) => adaptLegacyResponsiveUpdate(next, breakpoint, mutate) });
  const updateRules = (mutate: (next: DynamicTemplateResponsiveRules) => void) => {
    updateDefinition((next) => mutate(next.nodes[activeNodeId].responsive[device]));
  };
  const updateSlot = (mutate: (next: DynamicTemplateSlotDefinition) => void) => {
    if (!node.slotId) return false;
    return updateDefinition((next) => mutate(next.slots[node.slotId!]));
  };
  const updateInstancePolicy = (
    mutate: (next: NonNullable<typeof node.instanceEditPolicy>) => void,
  ) => {
    const effectivePolicy = pageField?.effectiveDesignOverrideCapabilities;
    if (!slot || !effectivePolicy) return false;
    return updateDefinition((next) => {
      const target = next.nodes[activeNodeId];
      target.instanceEditPolicy ??= structuredClone(effectivePolicy);
      mutate(target.instanceEditPolicy);
    });
  };
  const updateSelectedRoleLayoutPath = (
    path: string[],
    value: unknown,
    label = "更新模板字段",
  ) => {
    if (!selectedRoleObject) return;
    updateDefinition((next) => {
      const target = next.nodes[activeNodeId];
      const updated = setVisualOverridePath(target.props.contentTemplateLayoutData, path, value);
      if (updated) target.props.contentTemplateLayoutData = updated;
      else delete target.props.contentTemplateLayoutData;
    }, label);
  };
  const updateSelectedRoleDesignField = (field: string, value: unknown, label: string) => {
    const descriptor = designFieldResolution.fields.find((candidate) => candidate.field === field);
    if (!descriptor || !designFieldResolution.context) return;
    updateDefinition(
      (next) => descriptor.applyValue(next, designFieldResolution.context!, value),
      label,
    );
  };
  const hasSelectedRoleDesignField = (field: string) => designFieldResolution.fields.some(
    (candidate) => candidate.field === field,
  );
  const updateSelectedRoleRect = (key: keyof VisualRect, percent: number) => {
    if (!selectedRoleObject || !selectedRoleRect || !contentContract) return;
    const constraints = selectedRoleObject.constraints;
    const safeArea = contentContract.defaultGeometryByViewport[device].safeArea;
    const bounds = constraints.safeAreaRequired
      ? safeArea
      : { x: 0, y: 0, width: 1, height: 1 };
    const requested = percent / 100;
    const next = { ...selectedRoleRect };
    if (key === "x") {
      next.x = Math.max(bounds.x, Math.min(bounds.x + bounds.width - next.width, requested));
    } else if (key === "y") {
      next.y = Math.max(bounds.y, Math.min(bounds.y + bounds.height - next.height, requested));
    } else if (key === "width") {
      next.width = Math.max(
        constraints.minSize.width,
        Math.min(constraints.maxSize.width, bounds.x + bounds.width - next.x, requested),
      );
    } else {
      next.height = Math.max(
        constraints.minSize.height,
        Math.min(constraints.maxSize.height, bounds.y + bounds.height - next.y, requested),
      );
    }
    updateSelectedRoleLayoutPath(
      ["nodes", selectedRoleObject.roleId, "rectByViewport", device],
      next,
    );
  };

  const restoreSelectedRoleCurrentDevice = () => {
    if (!selectedRoleObject) return;
    updateDefinition((next) => {
      const target = next.nodes[activeNodeId];
      let layoutData: Record<string, unknown> | undefined = target.props.contentTemplateLayoutData;
      for (const path of [
        ["nodes", selectedRoleObject.roleId, "rectByViewport", device],
        ["nodes", selectedRoleObject.roleId, "zIndexByViewport", device],
      ]) {
        layoutData = setVisualOverridePath(layoutData, path, undefined);
      }
      if (layoutData) target.props.contentTemplateLayoutData = layoutData;
      else delete target.props.contentTemplateLayoutData;
    }, `恢复${selectedRoleLabel ?? "当前对象"}当前画布默认构图`);
  };

  const otherDevice = device === "desktop" ? "mobile" : "desktop";
  const selectedRoleForOtherDevice = selectedRoleObject
    ? resolveContractRoleForDevice(
        definition,
        { nodeId: activeNodeId, roleId: selectedRoleObject.roleId },
        otherDevice,
      )
    : null;

  const currentToOtherRoleMapping = selectedRoleObject && selectedRoleForOtherDevice
    ? { sourceRoleId: selectedRoleObject.roleId, targetRoleId: selectedRoleForOtherDevice.roleId }
    : undefined;
  const otherToCurrentRoleMapping = selectedRoleObject && selectedRoleForOtherDevice
    ? { sourceRoleId: selectedRoleForOtherDevice.roleId, targetRoleId: selectedRoleObject.roleId }
    : undefined;
  const selectedRoleCopyUnavailable = Boolean(
    selectedRoleObject && (!selectedRoleApplicable || !selectedRoleForOtherDevice),
  );

  const responsiveSource = selectedRoleObject && applicableResponsiveGroups.length
    ? (otherToCurrentRoleMapping && createDynamicTemplateResponsivePlan(
        responsiveDefinition,
        activeNodeId,
        otherDevice,
        device,
        applicableResponsiveGroups,
        otherToCurrentRoleMapping,
      ).changes.length ? "device" : "shared")
    : getTemplateResponsiveSource(responsiveDefinition, activeNodeId, device);
  const copyResponsive = (sourceDevice: typeof device, targetDevice: typeof device, label: string) => {
    const roleMapping = selectedRoleObject
      ? (sourceDevice === device ? currentToOtherRoleMapping : otherToCurrentRoleMapping)
      : undefined;
    if (selectedRoleObject && !roleMapping) return;
    if (typeof modal?.confirm !== "function") {
      setLocateIssueNotice(RESPONSIVE_COPY_DIALOG_UNAVAILABLE);
      setLocateIssueRecovery(false);
      setLocateUnlockOwnerId(null);
      return;
    }
    const reviewedPlan = createDynamicTemplateResponsivePlan(
      responsiveDefinition,
      activeNodeId,
      sourceDevice,
      targetDevice,
      activeSelectedResponsiveGroups,
      roleMapping,
    );
    const changes = reviewedPlan.changes.map((change) => ({
      group: change.group,
      field: change.label,
      before: describeResponsiveCopyValue(change.before),
      after: describeResponsiveCopyValue(change.after),
    }));
    const sourceRoleLabel = roleMapping
      ? getTemplateContractRoleLabel(
          roleMapping.sourceRoleId,
          contentContract?.roles.find((role) => role.id === roleMapping.sourceRoleId)?.semantic,
        )
      : null;
    const targetRoleLabel = roleMapping
      ? getTemplateContractRoleLabel(
          roleMapping.targetRoleId,
          contentContract?.roles.find((role) => role.id === roleMapping.targetRoleId)?.semantic,
        )
      : null;
    modal.confirm({
      title: label,
      content: <div className="template-editor__responsive-copy-review">
        <p>只复制已选设计组中的中性设计值，不复制对象身份、页面内容或开放规则。确认后可一步撤销。</p>
        {roleMapping ? <p data-template-responsive-role-mapping={`${roleMapping.sourceRoleId}:${roleMapping.targetRoleId}`}>
          对象映射：{sourceDevice === "desktop" ? "桌面端" : "移动端"} {sourceRoleLabel} → {targetDevice === "desktop" ? "桌面端" : "移动端"} {targetRoleLabel}
        </p> : null}
        {changes.length ? <table><thead><tr><th>设计组 / 字段</th><th>{targetDevice === "desktop" ? "桌面端" : "移动端"}当前值</th><th>{sourceDevice === "desktop" ? "桌面端" : "移动端"}来源值</th></tr></thead><tbody>
          {changes.map((change) => <tr key={`${change.group}:${change.field}`}><th>{DYNAMIC_TEMPLATE_RESPONSIVE_GROUP_LABELS[change.group]} / {change.field}</th><td>{change.before}</td><td>{change.after}</td></tr>)}
        </tbody></table> : <p>{reviewedPlan.reason}</p>}
      </div>,
      okText: "确认替换",
      cancelText: "取消",
      okButtonProps: { disabled: changes.length === 0 },
      onOk: () => {
        if (roleMapping) {
          executeCommand({
            type: "copy-responsive-groups",
            label,
            nodeId: activeNodeId,
            sourceDevice,
            targetDevice,
            groups: activeSelectedResponsiveGroups,
            sourceRoleId: roleMapping.sourceRoleId,
            targetRoleId: roleMapping.targetRoleId,
            reviewedPlan,
          });
          return;
        }
        executeCommand({
          type: "copy-responsive-groups",
          label,
          nodeId: activeNodeId,
          sourceDevice,
          targetDevice,
          groups: activeSelectedResponsiveGroups,
          reviewedPlan,
        });
      },
    });
  };

  const focusValidationIssue = (issue: DynamicTemplateValidationIssue) => {
    if (focusFirstInvalidNumberField() || useTemplateEditorSession.getState().activeInteraction) return;
    const target = resolveTemplateInspectorIssueTarget(draft!.definition, issue);
    const issueBreakpoint = issue.path.match(/\.responsive\.(desktop|tablet|mobile)(?:\.|$)/)?.[1];
    const presentTarget = (source: "review" | "validation", switchDevice: boolean) => {
      setPendingIssueFocus({
        requestId: ++issueFocusRequestRef.current,
        templateId: definition.templateId,
        target,
        source,
      });
      if (target.objectId === definition.rootNodeId) {
        setRootSettingsOpen(true);
        setMetadataDetailsOpen(true);
      }
      const session = useTemplateEditorSession.getState();
      if (switchDevice && (issueBreakpoint === "desktop" || issueBreakpoint === "tablet" || issueBreakpoint === "mobile")) session.setBreakpoint(issueBreakpoint);
      else if (switchDevice && target.device) session.setDevice(target.device);
      session.selectObject(target.objectId);
      session.setInspectorTask(target.task);
      session.setInspectorView(target.view);
      onPrepareIssueTarget?.(target);
    };
    if (publishReview) {
      if (issue.level === "error") {
        const index = publishReview.issues.filter((candidate) => candidate.level === "error")
          .findIndex((candidate) => candidate.code === issue.code && candidate.path === issue.path);
        if (index >= 0) onSelectPublishIssue?.(index);
      }
      setLocateIssueNotice(null);
      setLocateUnlockOwnerId(null);
      setLocateIssueRecovery(false);
      if (issue.level === "error" && target.device && target.device !== device) {
        setLocateIssueNotice("此问题位于另一画布，请使用本次发布检查内的设备入口切换后再次定位。");
        window.requestAnimationFrame(() => publishReviewRef.current?.focus());
        return;
      }
      if (target.destination === "unavailable") {
        setLocateIssueNotice(target.reason ?? "当前问题没有可安全直接编辑的字段。");
        window.requestAnimationFrame(() => publishReviewRef.current?.focus());
        return;
      }
      if (target.destination === "inspector-field" && target.access !== "editable") {
        setLocateIssueNotice(target.reason ?? "当前字段由系统管理，不能从发布检查中直接编辑。");
        window.requestAnimationFrame(() => publishReviewRef.current?.focus());
        return;
      }
      const transitioned = onEditPublishIssue?.(target) ?? false;
      if (transitioned) presentTarget("review", true);
      return;
    }
    setLocateIssueNotice(null);
    setLocateUnlockOwnerId(null);
    setLocateIssueRecovery(false);
    presentTarget("validation", true);
  };

  const setStackLayoutMode = (layoutMode: "flow" | "free") => {
    if (node.type !== "Stack") return;
    updateDefinition((next) => {
      const stack = next.nodes[activeNodeId];
      const stackRules = stack.responsive[device];
      if (layoutMode === "flow") {
        stackRules.layoutMode = "flow";
        if (stackRules.display === "block") stackRules.display = "flex";
        stack.childIds.forEach((childId) => { delete next.nodes[childId].responsive[device].placement; });
        return;
      }
      const frame = document.querySelector<HTMLIFrameElement>(".template-editor__viewport-frame");
      const frameDocument = frame?.contentDocument;
      const stackElement = frameDocument?.querySelector<HTMLElement>(`[data-template-node-id="${activeNodeId}"]`);
      const stackRect = stackElement?.getBoundingClientRect();
      const childCount = Math.max(1, stack.childIds.length);
      stackRules.layoutMode = "free";
      stackRules.display = "block";
      stackRules.height = {
        mode: "fixed",
        value: { value: Math.max(120, Math.round(stackRect?.height ?? 480)), unit: "px" },
      };
      stack.childIds.forEach((childId, index) => {
        const childElement = frameDocument?.querySelector<HTMLElement>(`[data-template-node-id="${childId}"]`);
        const childRect = childElement?.getBoundingClientRect();
        const hasGeometry = stackRect && childRect && stackRect.width > 0 && stackRect.height > 0;
        next.nodes[childId].responsive[device].placement = hasGeometry ? {
          x: Math.max(0, Math.min(1, (childRect.left - stackRect.left) / stackRect.width)),
          y: Math.max(0, Math.min(1, (childRect.top - stackRect.top) / stackRect.height)),
          width: Math.max(0.02, Math.min(1, childRect.width / stackRect.width)),
          height: Math.max(0.02, Math.min(1, childRect.height / stackRect.height)),
          zIndex: index,
        } : {
          x: 0,
          y: index / childCount,
          width: 1,
          height: 1 / childCount,
          zIndex: index,
        };
        const placement = next.nodes[childId].responsive[device].placement!;
        placement.width = Math.min(placement.width, 1 - placement.x);
        placement.height = Math.min(placement.height, 1 - placement.y);
      });
    });
  };

  const parentId = findDynamicTemplateParentId(definition, activeNodeId);
  const allowedParents = isRoot ? [] : getDynamicTemplateAllowedParentIds(definition, activeNodeId);
  const activeValidation = (publishReview || isRoot) && publishValidation ? publishValidation : validation;
  const displayedSelectionSnapshot = publishReview?.selectionSnapshot ?? selectionSnapshot;
  const nodeIssues = activeValidation.issues.filter((issue) => (
    issue.nodeId === activeNodeId || (node.slotId && issue.slotId === node.slotId)
  ));
  const contextValidationIssues = publishReview ? publishReview.issues : isRoot
    ? activeValidation.issues
    : nodeIssues.length
      ? nodeIssues
      : activeValidation.issues;
  const displayedValidationIssues = contextValidationIssues.filter((issue) => issue.level === "error");
  const designSuggestions = contextValidationIssues.filter((issue) => issue.level === "warning");
  const currentIssueIndex = Math.max(0, Math.min(publishReview?.currentIndex ?? 0, displayedValidationIssues.length - 1));
  const remainingValidationIssues = publishReview ? [] : displayedValidationIssues.slice(12);
  const recommendedPageOptions = [
    ...editorPages.map((page) => ({ value: page.key, label: page.label })),
    ...definition.metadata.recommendedFor
      .filter((pageKey) => !editorPages.some((page) => page.key === pageKey))
      .map((pageKey) => ({ value: pageKey, label: `${pageKey}（历史值）` })),
  ];
  const selectedRoleLabel = selectedRoleObject
    ? getTemplateContractRoleLabel(selectedRoleObject.roleId, selectedRoleDefinition?.semantic)
    : null;
  const selectedRoleDisplayLabel = selectedRoleLabel?.replace(/^(桌面端?|移动端?)/, "") ?? null;
  const selectedRoleKindLabel = selectedRoleObject
    ? TEMPLATE_CONTRACT_KIND_LABELS[selectedRoleObject.kind]
    : null;
  const inspectorTitle = isRoot ? "模板整体" : selectedRoleDisplayLabel ?? node.name;
  const structureLockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, activeNodeId);
  const isLocked = structureLockOwnerId !== null;
  const isOwnStructureLocked = structureLockOwnerId === activeNodeId;
  const isLockedByAncestor = isLocked && !isOwnStructureLocked;
  const activeFrame = resolveTemplateDesignFrame(definition, device);
  const publishWorkflow = publishReview?.workflow;
  const reviewedSnapshot = publishWorkflow?.snapshot ?? null;
  const publishFailure = publishWorkflow?.status === "partial-failure"
    ? publishWorkflow.failure
    : publishWorkflow && "lastFailure" in publishWorkflow
      ? publishWorkflow.lastFailure
      : undefined;
  const publishFailureText = publishFailure?.category === "permission"
    ? "服务端拒绝当前操作：当前账号没有模板管理权限。如需处理，请联系管理员。"
    : publishFailure?.category === "conflict"
      ? "数据已被其他操作更新。当前输入仍保留，请重新检查后再试。"
      : publishFailure
        ? "本次操作尚未完成。当前输入和已确认事实仍保留，请使用这里的恢复动作。"
        : null;
  const publishReviewHasBlockingIssue = Boolean(publishReview) && (
    displayedValidationIssues.some((issue) => issue.level === "error")
    || publishWorkflow?.issues.some((issue) => issue.blocking)
    || publishWorkflow?.status === "review-blocked"
  );
  const validationStatus = publishWorkflow?.status === "review-stale"
    ? "检查已过期"
    : publishReview
      ? publishReviewHasBlockingIssue ? "请先完成必要修改" : "可以发布"
      : activeValidation.valid
        ? isRoot ? "可以发布" : "可保存草稿"
        : isRoot ? "请先完成必要修改" : "请先修正输入";
  const validationSection = (
        <section ref={publishReview ? publishReviewRef : validationSectionRef} role="region" aria-label={publishReview ? "本次发布检查" : "模板制作检查"} tabIndex={-1} className="homepage-editor__inspector-section template-editor__validation-section">
          <div className="homepage-editor__inspector-section-head"><strong>{publishReview ? "本次发布检查" : isRoot ? "发布检查" : "实时校验"}</strong><span>{validationStatus}</span></div>
          <div className="homepage-editor__inspector-section-body template-editor__validation-list" role="status" aria-live="polite">
            {publishReview ? <>
              {reviewedSnapshot ? (
                <dl className="template-editor__publish-review-summary">
                  <div><dt>模板</dt><dd>{reviewedSnapshot.reviewedDefinition.name}</dd></div>
                  <div><dt>保存状态</dt><dd>{reviewedSnapshot.baseline ? "已有草稿，本次修改将在发布时保存" : "本次发布会先保存草稿"}</dd></div>
                  <div><dt>目标版本</dt><dd>v{reviewedSnapshot.targetVersion}</dd></div>
                  <div><dt>适用范围</dt><dd>{reviewedSnapshot.reviewedDefinition.metadata.recommendedFor.join("、") || "未限制页面"}</dd></div>
                  <div><dt>版本说明</dt><dd>{reviewedSnapshot.reviewedVersionNote || "未填写"}</dd></div>
                </dl>
              ) : null}
              <section className="template-editor__publish-selection" role="region" aria-label="当前选择快照">
                {displayedSelectionSnapshot.targets.map((target) => (
                  <div
                    key={`${target.targetId}:${target.roleId ?? "node"}`}
                    data-selection-target-id={target.targetId}
                    data-selection-role-id={target.roleId}
                    data-selection-primary={isSameTemplateEditorSelectionTarget(
                      displayedSelectionSnapshot.primaryTarget,
                      target,
                    ) ? "true" : undefined}
                    data-selection-anchor={isSameTemplateEditorSelectionTarget(
                      displayedSelectionSnapshot.anchorTarget,
                      target,
                    ) ? "true" : undefined}
                  >
                    {definition.nodes[target.targetId]?.name ?? target.targetId}
                    {target.roleId ? ` · ${target.roleId}` : ""}
                  </div>
                ))}
              </section>
              <p>{displayedValidationIssues.length > 0 ? `${displayedValidationIssues.length} 项需要修改，点击问题可进入对应设置。` : "必填项目与模板结构检查通过。"}</p>
              <details><summary>预览与核对（可选）</summary>
              <span className="template-editor__validation-actions" role="group" aria-label="本次发布检查设备">
                <Button
                  size="small"
                  aria-pressed={device === "desktop"}
                  onClick={() => setDevice("desktop")}
                >发布检查桌面端模板布局</Button>
                <Button
                  size="small"
                  aria-pressed={device === "mobile"}
                  onClick={() => setDevice("mobile")}
                >发布检查移动端模板布局</Button>
              </span>
              <details>
                <summary>页面开放范围 · {Object.keys(definition.slots).length} 个字段</summary>
                <ul aria-label="发布检查页面字段范围">
                  {Object.values(definition.slots).map((slot) => (
                    <li key={slot.slotId}>{slot.label} · {slot.editable ? "允许修改" : "固定内容"} · {slot.required ? "必填" : "选填"} · {slot.hideable ? "允许隐藏" : "不可隐藏"}</li>
                  ))}
                </ul>
              </details>
              <span className="template-editor__validation-actions" role="group" aria-label="发布前人工核对">
                <Button size="small" disabled={productionReviewFacts[device]} onClick={() => confirmDeviceReview(device)}>
                  {(productionReviewFacts[device] ? "已核对" : "确认已核对") + (device === "desktop" ? "桌面端" : "移动端") + "布局"}
                </Button>
                <Button size="small" disabled={productionReviewFacts.pageScope} onClick={() => confirmPageScopeReview("publish-review")}>
                  {productionReviewFacts.pageScope ? "页面开放范围已核对" : "确认页面开放范围已核对"}
                </Button>
              </span>
              </details>
              {publishWorkflow?.status === "review-ready" ? <p>确认后保存当前设计并发布为模板版本。</p> : null}
              {publishWorkflow?.status === "review-blocked" ? <p>请完成下面的必要修改，再重新检查并发布。</p> : null}
              {publishWorkflow?.status === "review-stale" ? <p>本次检查已过期，请重新检查。已审阅快照不会被当前新输入替换。</p> : null}
              {publishWorkflow?.status === "saving-reviewed-snapshot" ? <p>正在保存本次已审阅快照；保存成功后才会发布同一版本。</p> : null}
              {publishWorkflow?.status === "publishing" ? <p>草稿已保存，正在严格发布 v{publishWorkflow.snapshot.targetVersion}。</p> : null}
              {publishWorkflow?.status === "verifying-uncertain" ? <p>响应不确定，正在核对{publishWorkflow.scope === "save" ? "服务端草稿" : `正式版本 v${publishWorkflow.snapshot.targetVersion}`}；核实前不会盲目重写或创建下一版本。</p> : null}
              {publishWorkflow?.status === "partial-failure" ? (
                <p>{publishWorkflow.reason === "template-published-catalog-stale"
                  ? "模板已发布，目录尚未同步。只能重试目录读取，不会重复发布。"
                  : publishWorkflow.reason === "draft-save-verification-conflict"
                    ? "保存结果与服务端草稿不一致。当前输入仍保留，未继续发布。"
                    : "草稿已保存，模板未发布。当前输入与正式版本事实均未被覆盖。"}</p>
              ) : null}
              {publishWorkflow?.status === "published" ? <p>模板 v{publishWorkflow.published.version} 已发布；{publishWorkflow.catalogStatus === "fresh" ? "目录已确认可用" : "正在核对页面装修目录"}。已有页面继续锁定原版本。</p> : null}
              {publishFailureText ? <p className="template-editor__publish-failure-copy">{publishFailureText}</p> : null}
              {publishedDraftAvailability?.templateId === publishReview.templateId && publishedDraftAvailability.status === "checking" ? <p>正式版本已确认，正在重新读取可编辑草稿…</p> : null}
              {publishedDraftAvailability?.templateId === publishReview.templateId && publishedDraftAvailability.status === "unavailable" ? (
                <p>正式版本已发布，但可编辑草稿暂不可用。系统未伪造 revision、checksum 或 baseVersion；同 ID 保存和发布已禁用。</p>
              ) : null}
              {displayedValidationIssues.length > 0 ? <>
                <p>当前 {currentIssueIndex + 1} / {displayedValidationIssues.length}：{displayedValidationIssues[currentIssueIndex]?.message}</p>
                <span className="template-editor__validation-actions">
                  <Button size="small" disabled={currentIssueIndex <= 0} onClick={() => focusValidationIssue(displayedValidationIssues[currentIssueIndex - 1])}>上一个问题</Button>
                  <Button size="small" disabled={currentIssueIndex >= displayedValidationIssues.length - 1} onClick={() => focusValidationIssue(displayedValidationIssues[currentIssueIndex + 1])}>下一个问题</Button>
                </span>
              </> : null}
              <span className="template-editor__validation-actions template-editor__publish-review-actions">
                {publishWorkflow?.status === "review-ready" ? (
                  <Button type="primary" onClick={onConfirmPublish}>{publishWorkflow.snapshot.targetVersion === 1 ? "保存并发布模板" : "发布模板新版本"}</Button>
                ) : null}
                {publishWorkflow?.status === "review-blocked" ? <Button type="primary" disabled>保存并发布模板</Button> : null}
                {publishWorkflow?.status === "review-stale" || (publishWorkflow?.status === "partial-failure" && publishWorkflow.reason === "draft-save-verification-conflict") ? (
                  <Button type="primary" onClick={onRecheckPublishReview}>重新检查</Button>
                ) : null}
                {publishWorkflow?.status === "partial-failure" && publishWorkflow.reason === "draft-saved-template-unpublished" && !publishWorkflow.currentInputChanged ? (
                  <Button type="primary" onClick={onRetryFailedPublish}>重试发布</Button>
                ) : null}
                {publishWorkflow?.status === "verifying-uncertain" ? <Button onClick={onRetryPublishVerification}>重新核对结果</Button> : null}
                {publishWorkflow?.status === "partial-failure" && publishWorkflow.reason === "template-published-catalog-stale" ? <Button type="primary" onClick={onRetryCatalogRefresh}>重试目录读取</Button> : null}
                {publishedDraftAvailability?.templateId === publishReview.templateId && publishedDraftAvailability.status === "unavailable" ? <>
                  <Button onClick={onReloadPublishedDraft}>重新读取草稿</Button>
                </> : null}
                {publishWorkflow?.status === "published" && publishWorkflow.catalogStatus === "fresh" ? <Button type="primary" onClick={onUsePublishedTemplate}>去页面装修使用</Button> : null}
                {!(["saving-reviewed-snapshot", "publishing"] as string[]).includes(publishWorkflow?.status ?? "") ? <Button onClick={onCancelPublishReview}>{publishWorkflow?.status === "published" ? "继续设计" : "返回编辑"}</Button> : null}
              </span>
            </> : null}
            {displayedValidationIssues.slice(0, publishReview ? undefined : 12).map((issue) => {
              const target = resolveTemplateInspectorIssueTarget(definition, issue);
              return (
                <div
                  key={`${issue.code}-${issue.path}`}
                  className={`is-${issue.level}`}
                  aria-current={publishReview?.issues[publishReview.currentIndex] === issue ? "step" : undefined}
                  data-template-issue-object={target.objectId}
                  data-template-issue-group={target.group}
                  data-template-issue-field={target.field}
                  data-template-issue-device={target.device}
                  data-template-issue-destination={target.destination}
                >
                  <strong>需要修改</strong>
                  <span>{issue.message}</span>
                  {target.destination === "structure-region" || target.destination === "structure-slot" ? (
                    <small>{target.reason}</small>
                  ) : null}
                  <span className="template-editor__validation-actions">
                    <Button type="link" size="small" onClick={() => focusValidationIssue(issue)}>
                      {publishReview ? "定位并返回编辑" : "定位"}
                    </Button>
                  </span>
                </div>
              );
            })}
            {remainingValidationIssues.length > 0 ? (
              <section className="template-editor__settings-section"><h3>其余 {remainingValidationIssues.length} 项</h3>
                <div className="template-editor__validation-list">
                  {remainingValidationIssues.map((issue) => {
                    const target = resolveTemplateInspectorIssueTarget(definition, issue);
                    return (
                      <div
                        key={`${issue.code}-${issue.path}`}
                        className={`is-${issue.level}`}
                        data-template-issue-object={target.objectId}
                        data-template-issue-group={target.group}
                        data-template-issue-field={target.field}
                        data-template-issue-device={target.device}
                        data-template-issue-destination={target.destination}
                      >
                        <strong>{issue.level === "error" ? "错误" : issue.level === "warning" ? "提醒" : "说明"}</strong>
                        <span>{issue.message}</span>
                        {target.destination === "structure-region" || target.destination === "structure-slot" ? (
                          <small>{target.reason}</small>
                        ) : null}
                        <span className="template-editor__validation-actions">
                          <Button type="link" size="small" onClick={() => focusValidationIssue(issue)}>
                            {publishReview ? "定位并返回编辑" : "定位"}
                          </Button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {designSuggestions.length > 0 ? <details>
              <summary>设计建议 · {designSuggestions.length} 项（不影响发布）</summary>
              {designSuggestions.map((issue) => <div key={`${issue.code}-${issue.path}`} className="is-warning">
                <span>{issue.message}</span>
                <Button type="link" size="small" onClick={() => focusValidationIssue(issue)}>查看对应设置</Button>
              </div>)}
            </details> : null}
            {!publishReview && displayedValidationIssues.length === 0 ? <p>当前没有需要修改的必填或结构问题。</p> : null}
          </div>
        </section>
  );
  const inspectorBreadcrumb = isRoot
    ? "模板容器"
    : [definition.name, parentId ? definition.nodes[parentId]?.name : null]
        .filter((label): label is string => Boolean(label))
        .join(" / ");
  const focusStructureLockOwner = (ownerId: string) => {
    selectObject(ownerId);
    setInspectorTask("design");
    setInspectorView("context");
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>('[data-template-inspector-field="authoring.structureLocked"]');
      field?.scrollIntoView({ block: "nearest" });
      field?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }));
  };
  const structureLockSection = hasCapability("authoring.structureLocked") ? (
    <section className="homepage-editor__inspector-section template-editor__structure-lock-section">
      <div className="homepage-editor__inspector-section-head"><strong>结构锁定</strong><span>锁定后仍可选中和查看</span></div>
      <div className="homepage-editor__inspector-section-body">
        <div data-template-inspector-field="authoring.structureLocked"><SwitchField
          label="锁定位置、尺寸和层级"
          hint={isLockedByAncestor && structureLockOwnerId
            ? `当前节点受“${definition.nodes[structureLockOwnerId]?.name ?? "上级节点"}”保护，请先解除上级锁定。`
            : "锁定后不能拖动、缩放、删除或改变父级；可在此解除。"}
          value={isOwnStructureLocked}
          disabled={isLockedByAncestor}
          onChange={(structureLocked) => executeCommand({
            type: "transform-definition",
            label: structureLocked ? "锁定节点结构" : "解除节点结构锁定",
            transform: (current) => setDynamicTemplateNodeStructureLocked(
              current,
              activeNodeId,
              structureLocked,
            ),
          })}
        /></div>
      </div>
    </section>
  ) : null;
  const rootUsageSection = isRoot ? (
    <section className="template-editor__root-usage" aria-label="模板名称与页面职责">
      <div data-template-inspector-field="metadata.visualRole"><VisualChoiceField label="页面视觉职责" value={definition.metadata.visualRole ?? "support-stage"} columns={3} options={[
        { value: "primary-stage", label: "主舞台", icon: <FullscreenOutlined /> },
        { value: "feature-stage", label: "重点区", icon: <AppstoreOutlined /> },
        { value: "support-stage", label: "辅助区", icon: <BarsOutlined /> },
      ]} onChange={(visualRole) => updateDefinition((next) => {
        if (visualRole === "primary-stage" || visualRole === "feature-stage" || visualRole === "support-stage") next.metadata.visualRole = visualRole;
      })} /></div>
      <p className="homepage-editor__inspector-hint">
        {definition.metadata.visualRole === "primary-stage"
          ? "主舞台用于页面的主要首屏。同一页面可按运营需要重复添加；首个可见主舞台承担页面级标题、首图优先级和页头语境。"
          : definition.metadata.visualRole === "feature-stage"
            ? "重点区用于突出系列、工艺或专题内容，不占用页面的主舞台名额。"
            : "辅助区用于说明、补充图文或配套内容，不占用页面的主舞台名额。"}
      </p>
      <details className="template-editor__header-compatibility">
        <summary>首屏导航兼容</summary>
        <div data-template-inspector-field="metadata.headerCompatibility"><VisualMultiChoiceField
          label="导航兼容模式"
          values={definition.metadata.headerCompatibility ?? ["solid"]}
          options={[
            { value: "solid", label: "实色导航", icon: <SunOutlined /> },
            { value: "overlay-light", label: "浅色覆盖", icon: <BgColorsOutlined /> },
          ]}
          onChange={(headerCompatibility) => updateDefinition((next) => {
            next.metadata.headerCompatibility = headerCompatibility.length > 0 ? headerCompatibility : ["solid"];
          })}
        /></div>
        <p className="homepage-editor__inspector-hint">当模板位于页面首个可见内容位置，且页面配置支持覆盖导航时，浅色覆盖声明才会影响导航展示；不兼容时回退为实色导航。此设置不添加导航，也不自动把模板变成主舞台。</p>
      </details>
      <Button size="small" aria-expanded={metadataDetailsOpen} aria-controls="template-inspector-metadata" onClick={() => {
        if (focusFirstInvalidNumberField()) return;
        setMetadataDetailsOpen((open) => !open);
      }}>模板资料与使用限制</Button>
    </section>
  ) : null;
  const renderInspectorPanel = (activePanel: TemplateInspectorPanel, label: string) => (
          <div key={activePanel} id={`template-inspector-panel-${activePanel}`} role="group" aria-label={label} data-template-inspector-section={activePanel}>
        {hasCapability("nodeId") && activePanel === "definition" ? (
          <section className="homepage-editor__inspector-section template-editor__canvas-measurement-section">
            <div className="homepage-editor__inspector-section-head">
              <strong>当前画布数值</strong>
              <span>实际像素与相对父级比例</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              <CanvasMeasurementSummary measurement={canvasMeasurement} />
            </div>
          </section>
        ) : null}

        {hasCapability("name") && activePanel === "definition" ? (
          <section className="homepage-editor__inspector-section">
            <div className="homepage-editor__inspector-section-head">
              <strong>模板基本信息</strong>
              <span>目录分类、用途与说明</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              <div className="template-editor__geometry-grid">
                <div data-template-inspector-field="metadata.category"><TextField transactional label="分类" value={definition.metadata.category} maxLength={50} onChange={(category) => updateDefinition((next) => { next.metadata.category = category; })} /></div>
                <div data-template-inspector-field="metadata.purpose"><TextField transactional label="用途" value={definition.metadata.purpose} maxLength={100} onChange={(purpose) => updateDefinition((next) => { next.metadata.purpose = purpose; })} /></div>
                <div data-template-inspector-field="metadata.layoutType"><TextField transactional label="构图类型" value={definition.metadata.layoutType} maxLength={DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.layoutType} onChange={(layoutType) => updateDefinition((next) => { next.metadata.layoutType = layoutType; })} /></div>
              </div>
              <div data-template-inspector-field="description"><TextField transactional label="模板说明" value={definition.description ?? ""} maxLength={500} rows={3} onChange={(description) => updateDefinition((next) => { next.description = description; })} /></div>
              {hasCapability("props.semanticTag") ? (
                <div data-template-inspector-field="props.semanticTag">
                  <SelectField
                    label="区域语义标签"
                    value={node.props.semanticTag ?? "section"}
                    options={[
                      { value: "section", label: "普通区段 section" },
                      { value: "header", label: "页首区段 header" },
                    ]}
                    onChange={(semanticTag) => updateDefinition((next) => {
                      next.nodes[activeNodeId].props.semanticTag = semanticTag === "header" ? "header" : "section";
                    }, "更新区域语义")}
                  />
                </div>
              ) : null}
            </div>
          </section>
        ) : hasCapability("node.name") && activePanel === "definition" ? (
          <section className="homepage-editor__inspector-section">
            <div className="homepage-editor__inspector-section-head"><strong>节点身份</strong><span>{registry.label}</span></div>
            <div className="homepage-editor__inspector-section-body">
              <div data-template-inspector-field="childIds"><SelectField
                label="父节点"
                value={parentId ?? ""}
                options={allowedParents.map((candidateId) => ({ value: candidateId, label: definition.nodes[candidateId].name }))}
                disabled={isLocked}
                onChange={(nextParentId) => {
                  if (!nextParentId) return;
                  const result = executeCommand({
                    type: "transform-definition",
                    label: "移动节点",
                    transform: (current) => moveDynamicTemplateNode(current, activeNodeId, nextParentId),
                  });
                  if (result.ok) selectObject(activeNodeId);
                }}
              /></div>
              <div data-template-inspector-field="hidden">
                <SwitchField label="模板中隐藏节点" hint="影响两种设备，可撤销；这不是页面装修的显隐设置。" value={node.hidden} disabled={isLocked} onChange={(hidden) => updateDefinition((next) => { next.nodes[activeNodeId].hidden = hidden; })} />
              </div>
              <div className="template-editor__read-only-field" data-template-inspector-field="type" data-template-inspector-read-only="true" tabIndex={-1}><span>节点类型</span><strong>{registry.label}</strong></div>
              {hasCapability("props.semanticTag") ? (
                <div data-template-inspector-field="props.semanticTag">
                  <SelectField
                    label="语义标签"
                    value={node.props.semanticTag ?? ""}
                    allowEmpty
                    emptyLabel="使用默认 div"
                    options={[
                      { value: "section", label: "区段 section" },
                      { value: "div", label: "通用容器 div" },
                      { value: "header", label: "页首 header" },
                      { value: "article", label: "独立内容 article" },
                      { value: "aside", label: "补充内容 aside" },
                      { value: "nav", label: "导航 nav" },
                    ]}
                    disabled={isLocked}
                    onChange={(semanticTag) => updateDefinition((next) => {
                      const target = next.nodes[activeNodeId];
                      if (semanticTag === "section" || semanticTag === "div" || semanticTag === "header" || semanticTag === "article" || semanticTag === "aside" || semanticTag === "nav") {
                        target.props.semanticTag = semanticTag;
                      } else {
                        delete target.props.semanticTag;
                      }
                    }, "更新语义标签")}
                  />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {hasCapability("metadata.previewDesktopWidth") && activePanel === "layout" ? (
          <section className="homepage-editor__inspector-section">
            <div className="homepage-editor__inspector-section-head">
              <strong>画布尺寸与响应式</strong>
              <span>跟随顶部选择，预览与公开展示保持一致</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              <div className="template-editor__dimension-summary">
                <div data-template-inspector-field={device === "desktop" ? "metadata.previewDesktopWidth" : "metadata.previewMobileWidth"} data-template-inspector-read-only="true" tabIndex={-1}>
                  <span>当前画布坐标</span>
                  <strong>{activeFrame.sourceWidth} × {activeFrame.heightMode === "auto" ? "随内容" : Math.round(activeFrame.fallbackHeight)}</strong>
                  <small data-template-inspector-field={device === "desktop" ? "metadata.desktopRatio" : "metadata.mobileRatio"} data-template-inspector-read-only="true" tabIndex={-1}>{activeFrame.heightMode === "fixed" ? "固定高度" : activeFrame.heightMode === "aspect-ratio" ? "固定比例" : "随内容"} · {activeFrame.ratioLabel}</small>
                </div>
              </div>
              <p className="template-editor__role-definition-note">请在画布顶部的“模板尺寸”中修改当前画布；画布缩放只改变查看大小，不会改变模板。</p>
              <div data-template-inspector-field="metadata.defaultBackgroundToken"><VisualChoiceField label="默认背景" value={definition.metadata.defaultBackgroundToken ?? "surface"} columns={4} options={[
                { value: "surface", label: "白色", swatch: "#ffffff" },
                { value: "surface-muted", label: "柔灰", swatch: "#f4f5f5" },
                { value: "brand-ink", label: "深色", swatch: "#181a1b" },
                { value: "brand-soft", label: "浅色", swatch: "#eceeef" },
              ]} onChange={(defaultBackgroundToken) => updateDefinition((next) => { next.metadata.defaultBackgroundToken = defaultBackgroundToken; })} /></div>
            </div>
          </section>
        ) : null}

        {hasCapability("authoring.structureLocked") && isLocked && activePanel === "layout" ? (
          <Alert
            type="info"
            showIcon
            message="当前节点已锁定"
            description="位置、尺寸、顺序和槽位构图不可修改；请使用下方结构锁定开关解除。"
          />
        ) : null}

        {(hasCapability("responsive.*.display") || selectedRoleObject) && activePanel === "layout" ? (
          <section className="homepage-editor__inspector-section template-editor__responsive-source-section">
            <div className="homepage-editor__inspector-section-head">
              <strong>布局值来源</strong>
              <span>{responsiveSource === "shared" ? "与另一画布一致" : "当前画布有独立值"}</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              <div className="template-editor__responsive-source-actions" data-template-inspector-field="responsive.source">
                <p>
                  各画布分别保存设计值。先选择要处理的设计组；复制前会逐字段预览，确认后只形成一步历史。
                </p>
                <fieldset className="template-editor__responsive-group-picker" aria-label="响应式设计组">
                  {applicableResponsiveGroups.map((group) => <label key={group}>
                    <input type="checkbox" checked={activeSelectedResponsiveGroups.includes(group)} onChange={(event) => toggleResponsiveGroup(group, event.target.checked)} />
                    <span>{DYNAMIC_TEMPLATE_RESPONSIVE_GROUP_LABELS[group]}</span>
                  </label>)}
                </fieldset>
                <div>
                  <Button
                    size="small"
                    disabled={isLocked || selectedRoleCopyUnavailable || responsiveSource === "shared" || activeSelectedResponsiveGroups.length === 0}
                    onClick={() => copyResponsive(otherDevice, device, "用另一画布值替换当前画布")}
                  >
                    用另一画布替换当前画布
                  </Button>
                  <Button
                    size="small"
                    disabled={isLocked || selectedRoleCopyUnavailable || activeSelectedResponsiveGroups.length === 0}
                    onClick={() => copyResponsive(device, otherDevice, "复制当前画布到另一画布")}
                  >
                    复制当前画布到另一画布
                  </Button>
                  <Button
                    size="small"
                    disabled={isLocked || activeSelectedResponsiveGroups.length === 0 || !baseline?.definition.nodes[activeNodeId]}
                    title={!baseline ? "尚无成功保存基线" : !baseline.definition.nodes[activeNodeId] ? "上次保存版本中没有此对象" : undefined}
                    onClick={() => executeCommand({
                      type: "restore-responsive-groups",
                      label: "恢复当前对象上次保存值",
                      nodeId: activeNodeId,
                      device,
                      groups: activeSelectedResponsiveGroups,
                      baselineDefinition: baseline!.definition,
                      roleId: selectedRoleObject?.roleId,
                    })}
                  >
                    恢复上次保存值
                  </Button>
                  <Button
                    size="small"
                    disabled={isLocked || activeSelectedResponsiveGroups.length === 0}
                    onClick={() => executeCommand({
                      type: "reset-responsive-groups",
                      roleId: selectedRoleObject?.roleId,
                      label: "恢复当前对象系统默认",
                      nodeId: activeNodeId,
                      device,
                      groups: activeSelectedResponsiveGroups,
                    })}
                  >
                    恢复系统默认
                  </Button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {selectedRoleObject && activePanel === "layout" && !isLocked ? (
          <section className="homepage-editor__inspector-section template-editor__role-layout-section">
            <div className="homepage-editor__inspector-section-head template-editor__slot-section-head">
              <strong>{selectedRoleObject.kind === "media" || selectedRoleObject.kind === "video" ? "图片显示" : `${selectedRoleKindLabel ?? "对象"}设置`}</strong>
              <span>拖动画布调整位置，常用显示方式在这里选择</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              <div className="template-editor__role-quick-guide">
                <span>{selectedRoleObject.kind === "media" || selectedRoleObject.kind === "video"
                  ? "拖动图片改变位置；拖动四角调整显示范围。"
                  : "拖动对象改变位置；拖动四角调整范围。"}</span>
                <Button type="link" size="small" disabled={!selectedRoleHasDeviceOverride} onClick={restoreSelectedRoleCurrentDevice}>
                  恢复默认
                </Button>
              </div>

              {selectedRoleMediaLayout?.fit?.length ? (
                <VisualChoiceField
                  label="显示方式"
                  value={selectedRoleVisual?.fit ?? "default"}
                  columns={3}
                  options={[
                    { value: "default", label: "智能适配", icon: <MenuOutlined /> },
                    ...selectedRoleMediaLayout.fit.map((fit) => ({
                      value: fit,
                      label: fit === "cover" ? "铺满区域" : "完整显示",
                      icon: fit === "cover" ? <FullscreenOutlined /> : <CompressOutlined />,
                    })),
                  ]}
                  onChange={(fit) => updateSelectedRoleLayoutPath(
                    ["nodes", selectedRoleObject.roleId, "mediaView", "fit"],
                    fit === "default" ? undefined : fit,
                  )}
                />
              ) : null}

              {selectedRoleObject.constraints.allowZoom && selectedRoleMediaLayout?.zoom ? (
                <div className="template-editor__role-zoom">
                  <div>
                    <label>图片大小</label>
                    <output>{Math.round((selectedRoleVisual?.zoom ?? 1) * 100)}%</output>
                  </div>
                  <Slider
                    id={`template-role-zoom-${selectedRoleObject.roleId}`}
                    aria-label="图片大小"
                    key={`${selectedRoleObject.roleId}-${device}-${selectedRoleVisual?.zoom ?? 1}`}
                    defaultValue={Math.round((selectedRoleVisual?.zoom ?? 1) * 100)}
                    tooltip={{ formatter: (value) => `${value ?? 100}%` }}
                  min={selectedRoleMediaLayout.zoom.min * 100}
                  max={selectedRoleMediaLayout.zoom.max * 100}
                  step={selectedRoleMediaLayout.zoom.step * 100}
                    onChangeComplete={(value) => updateSelectedRoleLayoutPath(
                      ["nodes", selectedRoleObject.roleId, "mediaView", "zoom"],
                      value === 100 ? undefined : value / 100,
                    )}
                  />
                </div>
              ) : null}

              {selectedRoleSupports("typography")
                && selectedRoleObject.constraints.allowTypography
                && selectedRoleTextLayout ? (
                <section
                  className="template-editor__settings-section"
                  data-template-inspector-field="contentTemplateLayoutData.typography"
                >
                  <div className="homepage-editor__inspector-section-head template-editor__slot-section-head">
                    <div>
                      <h3>文字排版</h3>
                      <span>合同规定为桌面、移动共用；切换画布不会建立第二份排版值</span>
                    </div>
                    <Button
                      type="link"
                      size="small"
                      disabled={!selectedRoleHasTypographyOverride}
                      onClick={() => updateSelectedRoleLayoutPath(
                        ["nodes", selectedRoleObject.roleId, "typography"],
                        undefined,
                        `恢复${selectedRoleLabel ?? "当前文字"}默认排版`,
                      )}
                    >
                      恢复默认排版
                    </Button>
                  </div>

                  {hasSelectedRoleDesignField("role.typography.sizeLevel") ? (
                    <VisualChoiceField
                      label="字号级别"
                      value={selectedRoleVisual?.typography?.sizeLevel ?? "default"}
                      columns={3}
                      options={[
                        { value: "default", label: "默认", icon: <FontSizeOutlined /> },
                        ...CONTRACT_ROLE_TYPOGRAPHY_SIZE_OPTIONS
                          .filter((option) => selectedRoleTextLayout.sizePresets?.includes(option.preset))
                          .map((option) => ({
                            value: option.value,
                            label: option.label,
                            icon: <FontSizeOutlined />,
                          })),
                      ]}
                      onChange={(value) => updateSelectedRoleDesignField(
                        "role.typography.sizeLevel",
                        value === "default" ? undefined : value,
                        `调整${selectedRoleLabel ?? "文字"}字号级别`,
                      )}
                    />
                  ) : null}

                  {hasSelectedRoleDesignField("role.typography.align") ? (
                    <VisualChoiceField
                      label="文字对齐"
                      value={selectedRoleVisual?.typography?.align ?? "default"}
                      columns={2}
                      options={[
                        { value: "default", label: "默认", icon: <MenuOutlined /> },
                        ...(selectedRoleTextLayout.align ?? []).map((align) => ({
                          value: align,
                          label: align === "left" ? "左对齐" : align === "center" ? "居中" : "右对齐",
                          icon: align === "left" ? <AlignLeftOutlined /> : align === "center" ? <AlignCenterOutlined /> : <AlignRightOutlined />,
                        })),
                      ]}
                      onChange={(value) => updateSelectedRoleDesignField(
                        "role.typography.align",
                        value === "default" ? undefined : value,
                        `调整${selectedRoleLabel ?? "文字"}对齐`,
                      )}
                    />
                  ) : null}

                  {hasSelectedRoleDesignField("role.typography.color") ? (
                    <VisualChoiceField
                      label="文字颜色"
                      value={selectedRoleVisual?.typography?.color ?? "default"}
                      columns={2}
                      options={[
                        { value: "default", label: "默认", icon: <BgColorsOutlined /> },
                        ...CONTRACT_ROLE_TYPOGRAPHY_COLOR_OPTIONS
                          .filter((option) => selectedRoleTextLayout.colorTokens?.includes(option.token))
                          .map((option) => ({
                            value: option.value,
                            label: option.label,
                            swatch: option.value,
                          })),
                      ]}
                      onChange={(value) => updateSelectedRoleDesignField(
                        "role.typography.color",
                        value === "default" ? undefined : value,
                        `调整${selectedRoleLabel ?? "文字"}颜色`,
                      )}
                    />
                  ) : null}

                  <div className="template-editor__geometry-grid">
                    {hasSelectedRoleDesignField("role.typography.lineHeight") ? (
                      <NumberField
                        label="文字行距"
                        min={1}
                        max={2.5}
                        step={0.05}
                        value={selectedRoleVisual?.typography?.lineHeight}
                        onChange={(value) => updateSelectedRoleDesignField(
                          "role.typography.lineHeight",
                          value,
                          `调整${selectedRoleLabel ?? "文字"}行距`,
                        )}
                        onClear={() => updateSelectedRoleDesignField(
                          "role.typography.lineHeight",
                          undefined,
                          `恢复${selectedRoleLabel ?? "文字"}默认行距`,
                        )}
                      />
                    ) : null}
                    {hasSelectedRoleDesignField("role.typography.letterSpacing") ? (
                      <NumberField
                        label="文字字间距"
                        unit="em"
                        min={-0.05}
                        max={0.5}
                        step={0.01}
                        value={selectedRoleVisual?.typography?.letterSpacing}
                        onChange={(value) => updateSelectedRoleDesignField(
                          "role.typography.letterSpacing",
                          value,
                          `调整${selectedRoleLabel ?? "文字"}字间距`,
                        )}
                        onClear={() => updateSelectedRoleDesignField(
                          "role.typography.letterSpacing",
                          undefined,
                          `恢复${selectedRoleLabel ?? "文字"}默认字间距`,
                        )}
                      />
                    ) : null}
                    {hasSelectedRoleDesignField("role.typography.maxLines") ? (
                      <NumberField
                        label="文字最大行数"
                        min={1}
                        max={selectedRoleTextLayout.maxLines ?? 12}
                        value={selectedRoleVisual?.typography?.maxLines}
                        onChange={(value) => updateSelectedRoleDesignField(
                          "role.typography.maxLines",
                          Math.round(value),
                          `调整${selectedRoleLabel ?? "文字"}最大行数`,
                        )}
                        onClear={() => updateSelectedRoleDesignField(
                          "role.typography.maxLines",
                          undefined,
                          `恢复${selectedRoleLabel ?? "文字"}默认最大行数`,
                        )}
                      />
                    ) : null}
                  </div>

                  {hasSelectedRoleDesignField("role.typography.safeBand") ? (
                    <VisualChoiceField
                      label="安全文字带"
                      value={selectedRoleVisual?.typography?.safeBand ?? "default"}
                      columns={3}
                      hint={selectedRoleTextLayout.requiresSafeBand
                        ? "图片叠字角色需选择浅色或深色底带，确保文字可读。"
                        : "需要增强文字与背景对比时，可添加浅色或深色底带。"}
                      options={[
                        { value: "default", label: "未设置", icon: <BorderOutlined /> },
                        { value: "light", label: "浅色底带", swatch: "#FFFFFF" },
                        { value: "dark", label: "深色底带", swatch: "#181A1B" },
                      ]}
                      onChange={(value) => updateSelectedRoleDesignField(
                        "role.typography.safeBand",
                        value === "default" ? undefined : value,
                        `调整${selectedRoleLabel ?? "文字"}安全文字带`,
                      )}
                    />
                  ) : null}
                </section>
              ) : null}

              <section className="template-editor__settings-section">
                <h3>高级位置与尺寸</h3>
                <div className="template-editor__role-advanced-body">
                  <div className="template-editor__responsive-source-actions" data-template-inspector-field="contentTemplateLayoutData">
                    <p>{selectedRoleHasDeviceOverride ? "当前画布已单独调整。" : "当前画布使用模板默认值。"}</p>
                    <div>
                      <Button size="small" disabled={!selectedRoleRect || selectedRoleCopyUnavailable || activeSelectedResponsiveGroups.length === 0} onClick={() => copyResponsive(device, otherDevice, "复制当前画布到另一画布")}>
                        复制到另一画布
                      </Button>
                    </div>
                  </div>
                  {selectedRoleSupports("layout") && selectedRoleRect ? (
                    <>
                      <div className="template-editor__geometry-grid">
                        <NumberField
                          label="横向位置"
                          unit="%"
                          step={0.1}
                          min={0}
                          max={100}
                          value={Math.round(selectedRoleRect.x * 1000) / 10}
                          disabled={!selectedRoleObject.constraints.movementAxes.includes("x")}
                          onChange={(value) => updateSelectedRoleRect("x", value)}
                        />
                        <NumberField
                          label="纵向位置"
                          unit="%"
                          step={0.1}
                          min={0}
                          max={100}
                          value={Math.round(selectedRoleRect.y * 1000) / 10}
                          disabled={!selectedRoleObject.constraints.movementAxes.includes("y")}
                          onChange={(value) => updateSelectedRoleRect("y", value)}
                        />
                        <NumberField
                          label="宽度"
                          unit="%"
                          step={0.1}
                          min={selectedRoleObject.constraints.minSize.width * 100}
                          max={selectedRoleObject.constraints.maxSize.width * 100}
                          value={Math.round(selectedRoleRect.width * 1000) / 10}
                          onChange={(value) => updateSelectedRoleRect("width", value)}
                        />
                        <NumberField
                          label="高度"
                          unit="%"
                          step={0.1}
                          min={selectedRoleObject.constraints.minSize.height * 100}
                          max={selectedRoleObject.constraints.maxSize.height * 100}
                          value={Math.round(selectedRoleRect.height * 1000) / 10}
                          onChange={(value) => updateSelectedRoleRect("height", value)}
                        />
                      </div>
                      {selectedRoleSupports("layer") ? (
                        <NumberField
                          label="前后层级"
                          hint="数值越大越靠前"
                          min={selectedRoleObject.constraints.layerRange.min}
                          max={selectedRoleObject.constraints.layerRange.max}
                          value={selectedRoleZIndex ?? Math.max(0, selectedRoleObject.constraints.layerRange.min)}
                          onChange={(value) => updateSelectedRoleLayoutPath(
                            ["nodes", selectedRoleObject.roleId, "zIndexByViewport", device],
                            Math.round(value),
                          )}
                        />
                      ) : null}
                    </>
                  ) : (
                    <p className="template-editor__panel-empty-copy">当前对象由模板统一排版，无需单独填写位置与尺寸。</p>
                  )}
                </div>
              </section>
            </div>
          </section>
        ) : null}

        {activePanel === "layout" && hasCapability("responsive.*.display") && !isLocked ? <section className="homepage-editor__inspector-section">
          <div className="homepage-editor__inspector-section-head">
            <strong>{selectedRoleObject ? "所属组件布局" : "当前画布布局"}</strong>
            <span>{selectedRoleObject ? `影响“${node.name}”整体，不单独改变“${selectedRoleLabel}”` : "只改当前画布的几何规则"}</span>
          </div>
          <div className="homepage-editor__inspector-section-body">
            {hasCapability("props.spacerSize") ? (
              <div className="homepage-editor__inspector-field" data-template-inspector-field="props.spacerSize">
                <label>留白高度</label>
                <LengthField
                  label="留白高度"
                  value={node.props.spacerSize}
                  placeholder="默认 1rem"
                  onChange={(spacerSize) => updateDefinition((next) => {
                    if (spacerSize) next.nodes[activeNodeId].props.spacerSize = spacerSize;
                    else delete next.nodes[activeNodeId].props.spacerSize;
                  }, "更新留白高度")}
                />
              </div>
            ) : null}
            {hasCapability("props.dividerStyle") ? (
              <div data-template-inspector-field="props.dividerStyle">
                <VisualChoiceField
                  label="分隔线样式"
                  value={node.props.dividerStyle ?? "solid"}
                  columns={3}
                  options={[
                    { value: "solid", label: "实线", icon: <BorderOutlined /> },
                    { value: "dashed", label: "虚线", icon: <BorderOutlined /> },
                    { value: "dotted", label: "点线", icon: <BorderOutlined /> },
                  ]}
                  onChange={(dividerStyle) => updateDefinition((next) => {
                    next.nodes[activeNodeId].props.dividerStyle = dividerStyle;
                  }, "更新分隔线样式")}
                />
              </div>
            ) : null}
            {node.type === "Stack" ? (
              <div className="homepage-editor__inspector-field" data-template-inspector-field="responsive.*.layoutMode">
                <label>Stack 布局模式</label>
                <div className="template-editor__canvas-layer-switch" role="group" aria-label="Stack 布局模式">
                  <button type="button" className={rules.layoutMode !== "free" ? "is-active" : ""} aria-pressed={rules.layoutMode !== "free"} onClick={() => setStackLayoutMode("flow")}>顺序布局</button>
                  <button type="button" className={rules.layoutMode === "free" ? "is-active" : ""} aria-pressed={rules.layoutMode === "free"} onClick={() => setStackLayoutMode("free")}>自由叠放</button>
                </div>
                <span className="homepage-editor__inspector-hint">自由叠放只影响当前画布；切换时会按画布当前几何锁定子层。</span>
              </div>
            ) : null}
            {hasDesignField("responsive.placement") && rules.placement ? (
              <div className="template-editor__geometry-grid" data-template-inspector-field="responsive.*.placement">
                <NumberField label="横向位置" unit="%" min={0} max={100} value={Math.round(rules.placement.x * 100)} onChange={(value) => updateRules((next) => { if (next.placement) next.placement.x = Math.min(value / 100, 1 - next.placement.width); })} />
                <NumberField label="纵向位置" unit="%" min={0} max={100} value={Math.round(rules.placement.y * 100)} onChange={(value) => updateRules((next) => { if (next.placement) next.placement.y = Math.min(value / 100, 1 - next.placement.height); })} />
                <NumberField label="宽度" unit="%" min={2} max={100} value={Math.round(rules.placement.width * 100)} onChange={(value) => updateRules((next) => { if (next.placement) next.placement.width = Math.min(value / 100, 1 - next.placement.x); })} />
                <NumberField label="高度" unit="%" min={2} max={100} value={Math.round(rules.placement.height * 100)} onChange={(value) => updateRules((next) => { if (next.placement) next.placement.height = Math.min(value / 100, 1 - next.placement.y); })} />
                <NumberField label="图层" min={-10} max={10} value={rules.placement.zIndex} onChange={(value) => updateRules((next) => { if (next.placement) next.placement.zIndex = value; })} />
              </div>
            ) : null}
            <div className="template-editor__visual-property-stack">
              {isLayoutContainer ? (
                <div data-template-inspector-field="responsive.*.display"><VisualChoiceField
                  label="布局方式"
                  value={rules.display}
                  columns={4}
                  options={[
                    { value: "block", label: "自然", icon: <MenuOutlined /> },
                    { value: "flex", label: "弹性", icon: <SwapOutlined /> },
                    { value: "grid", label: "网格", icon: <AppstoreOutlined /> },
                    { value: "none", label: "隐藏", icon: <EyeInvisibleOutlined /> },
                  ]}
                  onChange={(display) => updateRules((next) => {
                    if (display === "block" || display === "flex" || display === "grid" || display === "none") next.display = display;
                  })}
                /></div>
              ) : (
                <div data-template-inspector-field="responsive.*.display"><VisualChoiceField
                  label="显示状态"
                  accessibleLabel="布局方式"
                  value={rules.display === "none" ? "none" : "block"}
                  columns={2}
                  options={[
                    { value: "block", label: "显示", accessibleLabel: "自然", icon: <MenuOutlined /> },
                    {
                      value: "none",
                      label: "隐藏",
                      icon: <EyeInvisibleOutlined />,
                    },
                  ]}
                  onChange={(display) => updateRules((next) => {
                    next.display = display;
                  })}
                /></div>
              )}
              {hasDesignField("responsive.direction") ? <div data-template-inspector-field="responsive.*.direction"><VisualChoiceField label="排列方向" value={rules.direction ?? "row"} columns={2} options={[
                { value: "row", label: "横向", icon: <ColumnWidthOutlined /> },
                { value: "column", label: "纵向", icon: <ColumnHeightOutlined /> },
              ]} onChange={(direction) => updateRules((next) => { if (direction === "row" || direction === "column") next.direction = direction; })} /></div> : null}
              {isLayoutContainer && hasDesignField("responsive.columns") ? (
                <div className="homepage-editor__inspector-field template-editor__grid-columns-field" data-template-inspector-field="responsive.*.columns">
                  <label>列宽比例</label>
                  <div className="template-editor__grid-column-presets" role="group" aria-label="常用列宽比例">
                    {GRID_COLUMN_PRESETS.map((preset) => {
                      const active = (rules.columns ?? []).join(":") === preset.key;
                      return (
                        <button
                          key={preset.key}
                          type="button"
                          className={active ? "is-active" : ""}
                          aria-label={`列宽比例：${preset.label} ${preset.key}`}
                          aria-pressed={active}
                          onClick={() => {
                            setGridColumnsError(null);
                            updateRules((next) => { next.columns = [...preset.columns]; });
                          }}
                        >
                          <span
                            className="template-editor__grid-columns-preview"
                            style={{ gridTemplateColumns: preset.columns.map((column) => `${column}fr`).join(" ") }}
                            aria-hidden="true"
                          >
                            {preset.columns.map((_, index) => <i key={index} />)}
                          </span>
                          <span>{preset.label}</span>
                          <small>{preset.key}</small>
                        </button>
                      );
                    })}
                  </div>
                  <span className="homepage-editor__inspector-hint">先选常用构图；只有特殊版式才需要自定义。</span>
                  <section className="template-editor__settings-section">
                    <h3>自定义列宽</h3>
                    <label htmlFor="dynamic-grid-columns">各列比例</label>
                    <Input
                      id="dynamic-grid-columns"
                      aria-label="自定义列宽比例"
                      status={gridColumnsError ? "error" : undefined}
                      key={`${activeNodeId}-${device}-${rules.columns?.join("-")}`}
                      defaultValue={rules.columns?.join("，") ?? "1，1"}
                      placeholder="例如：2，1"
                      onChange={() => {
                        if (gridColumnsError) setGridColumnsError(null);
                      }}
                      onBlur={(event) => {
                        const parts = event.target.value
                          .split(/[,，:：\s]+/)
                          .map((item) => item.trim())
                          .filter(Boolean);
                        const columns = parts.map(Number);
                        if (
                          columns.length < 1
                          || columns.length > 12
                          || columns.some((value) => !Number.isFinite(value) || value <= 0 || value > 100)
                        ) {
                          setGridColumnsError("请输入 1–12 个正数，例如 2，1。");
                          return;
                        }
                        setGridColumnsError(null);
                        updateRules((next) => { next.columns = columns; });
                      }}
                    />
                    {gridColumnsError ? <span className="homepage-editor__inspector-error" role="alert">{gridColumnsError}</span> : null}
                  </section>
                </div>
              ) : null}
              <div data-template-inspector-field={typeof rules.width === "string" ? "responsive.*.width" : undefined}><VisualChoiceField label="宽度策略" value={typeof rules.width === "string" ? rules.width : "custom"} columns={4} options={[
                { value: "fill", label: "填满", icon: <ArrowsAltOutlined /> },
                { value: "auto", label: "自动", icon: <ColumnWidthOutlined /> },
                { value: "fit", label: "适应", icon: <CompressOutlined /> },
                { value: "custom", label: "自定", icon: <OneToOneOutlined /> },
              ]} onChange={(width) => updateRules((next) => {
                if (width === "custom") next.width = { value: 100, unit: "%" };
                else if (width === "fill" || width === "auto" || width === "fit") next.width = width;
              })} /></div>
            </div>
            {typeof rules.width !== "string" ? <div className="homepage-editor__inspector-field" data-template-inspector-field="responsive.*.width"><label>自定义宽度</label><LengthField label="自定义宽度" value={rules.width} onChange={(value) => updateRules((next) => { next.width = value ?? "auto"; })} /></div> : null}
            <div data-template-inspector-field="responsive.*.height"><VisualChoiceField label="高度策略" value={rules.height.mode} columns={5} options={[
              { value: "auto", label: "自动", icon: <ColumnHeightOutlined /> },
              { value: "min-height", label: "最低", icon: <ExpandOutlined /> },
              { value: "aspect-ratio", label: "比例", icon: <OneToOneOutlined /> },
              { value: "fixed", label: "固定", icon: <BorderOutlined /> },
              { value: "viewport", label: "屏高", icon: <FullscreenOutlined /> },
            ]} onChange={(mode) => updateRules((next) => {
              if (mode === "aspect-ratio") next.height = { mode, ratio: { width: 16, height: 9 } };
              else if (mode === "auto") next.height = { mode };
              else if (mode === "min-height" || mode === "fixed" || mode === "viewport") next.height = { mode, value: { value: mode === "viewport" ? 60 : 480, unit: mode === "viewport" ? "vh" : "px" } };
            })} /></div>
            {rules.height.mode === "aspect-ratio" ? (
              <div className="template-editor__geometry-grid">
                <NumberField label="比例宽" min={1} max={1000} value={rules.height.ratio?.width} onChange={(value) => updateRules((next) => { next.height.ratio = { width: value, height: next.height.ratio?.height ?? 9 }; })} />
                <NumberField label="比例高" min={1} max={1000} value={rules.height.ratio?.height} onChange={(value) => updateRules((next) => { next.height.ratio = { width: next.height.ratio?.width ?? 16, height: value }; })} />
              </div>
            ) : rules.height.mode !== "auto" ? <div className="homepage-editor__inspector-field"><label>高度数值</label><LengthField label="高度数值" value={rules.height.value} onChange={(value) => updateRules((next) => { if (value) next.height.value = value; else delete next.height.value; })} /></div> : null}
            {isLayoutContainer ? <div className="homepage-editor__inspector-field" data-template-inspector-field="responsive.*.gap"><label>子项间距</label><LengthField label="子项间距" value={rules.gap} onChange={(value) => updateRules((next) => { next.gap = value; })} /></div> : null}
            {!rules.placement ? <span className="homepage-editor__inspector-hint">X / Y 由父容器排列；需要直接输入位置时，请将父级堆叠容器切换为“自由叠放”。</span> : null}
            <section className="template-editor__inline-settings" aria-label="精细排列与尺寸">
              <h4>精细排列与尺寸</h4>
              <div className="homepage-editor__advanced-settings-grid">
                <NumberField label="排列顺序" hint="数值越小越靠前" min={-100} max={100} value={rules.order} onChange={(order) => updateRules((next) => { next.order = order; })} />
                {hasDesignField("responsive.alignItems") ? <VisualChoiceField label="交叉方向对齐" value={rules.alignItems ?? "default"} columns={5} options={[
                  { value: "default", label: "默认", icon: <MenuOutlined /> },
                  { value: "start", label: "靠前", icon: <VerticalAlignTopOutlined /> },
                  { value: "center", label: "居中", icon: <VerticalAlignMiddleOutlined /> },
                  { value: "end", label: "靠后", icon: <VerticalAlignBottomOutlined /> },
                  { value: "stretch", label: "拉伸", icon: <ArrowsAltOutlined /> },
                ]} onChange={(alignItems) => updateRules((next) => {
                  next.alignItems = alignItems === "start" || alignItems === "center" || alignItems === "end" || alignItems === "stretch" ? alignItems : undefined;
                })} /> : null}
                {hasDesignField("responsive.justifyContent") ? <VisualChoiceField label="主要方向对齐" value={rules.justifyContent ?? "default"} columns={3} options={[
                  { value: "default", label: "默认", icon: <MenuOutlined /> },
                  { value: "start", label: "靠前", icon: <AlignLeftOutlined /> },
                  { value: "center", label: "居中", icon: <AlignCenterOutlined /> },
                  { value: "end", label: "靠后", icon: <AlignRightOutlined /> },
                  { value: "space-between", label: "两端", icon: <ArrowsAltOutlined /> },
                  { value: "space-around", label: "均分", icon: <EnterOutlined /> },
                ]} onChange={(justifyContent) => updateRules((next) => {
                  next.justifyContent = justifyContent === "start" || justifyContent === "center" || justifyContent === "end" || justifyContent === "space-between" || justifyContent === "space-around" ? justifyContent : undefined;
                })} /> : null}
                <div className="template-editor__geometry-grid">
                  <div className="homepage-editor__inspector-field"><label>最大宽度</label><LengthField label="最大宽度" value={rules.maxWidth} onChange={(value) => updateRules((next) => { next.maxWidth = value; })} /></div>
                  <div className="homepage-editor__inspector-field"><label>最小高度</label><LengthField label="最小高度" value={rules.minHeight} onChange={(value) => updateRules((next) => { next.minHeight = value; })} /></div>
                  <div className="homepage-editor__inspector-field"><label>圆角</label><LengthField label="圆角" value={rules.radius} onChange={(value) => updateRules((next) => { next.radius = value; })} /></div>
                </div>
                <BoxSpacingField label="内边距" value={rules.padding} onChange={(value) => updateRules((next) => { next.padding = value; })} />
                <BoxSpacingField label="外边距" value={rules.margin} onChange={(value) => updateRules((next) => { next.margin = value; })} />
              </div>
            </section>
            <section className="template-editor__inline-settings" aria-label="外观与边界">
              <h4>外观与边界</h4>
              <div className="homepage-editor__advanced-settings-grid">
                <VisualChoiceField label="背景样式" value={rules.backgroundToken ?? "transparent"} columns={5} options={[
                  { value: "transparent", label: "透明", icon: <BorderOutlined /> },
                  { value: "surface", label: "白色", swatch: "#ffffff" },
                  { value: "surface-muted", label: "柔灰", swatch: "#f4f5f5" },
                  { value: "brand-ink", label: "深色", swatch: "#181a1b" },
                  { value: "brand-soft", label: "浅色", swatch: "#eceeef" },
                ]} onChange={(backgroundToken) => updateRules((next) => { next.backgroundToken = backgroundToken === "transparent" ? undefined : backgroundToken; })} />
                <VisualChoiceField label="边框样式" value={rules.borderToken ?? "none"} columns={4} options={[
                  { value: "none", label: "无", icon: <CompressOutlined /> },
                  { value: "subtle", label: "轻", icon: <BorderOutlined /> },
                  { value: "strong", label: "强调", icon: <BorderOutlined /> },
                  { value: "accent", label: "品牌", icon: <BgColorsOutlined /> },
                ]} onChange={(borderToken) => updateRules((next) => { next.borderToken = borderToken === "none" ? undefined : borderToken; })} />
                <VisualChoiceField label="超出边界时" value={rules.overflow ?? "default"} columns={4} options={[
                  { value: "default", label: "默认", icon: <MenuOutlined /> },
                  { value: "visible", label: "显示", icon: <ArrowsAltOutlined /> },
                  { value: "hidden", label: "隐藏", icon: <EyeInvisibleOutlined /> },
                  { value: "clip", label: "裁切", icon: <BorderOutlined /> },
                ]} onChange={(overflow) => updateRules((next) => {
                  next.overflow = overflow === "visible" || overflow === "hidden" || overflow === "clip" ? overflow : undefined;
                })} />
              </div>
            </section>
          </div>
        </section> : null}

        {selectedRoleObject && !selectedRoleApplicable && activePanel === "definition" ? (
          <section className="template-editor__selected-role-summary" aria-label="当前槽位摘要">
            <div>
              <strong>{selectedRoleLabel}</strong>
              <span>{selectedRoleKindLabel}</span>
            </div>
            <p>该对象不在当前画布显示；仍可定义槽位职责，切换顶部设备后再调整对应构图。</p>
          </section>
        ) : null}

        {(hasCapability("slot.slotId") || inspectorContext === "role") && slot && ["layout"].includes(activePanel) && !(selectedRoleObject && activePanel === "layout") && !(isLocked && activePanel === "layout") ? (
          <section
            className="homepage-editor__inspector-section template-editor__slot-properties-section"
          >
            <div className={`homepage-editor__inspector-section-head${selectedRoleObject ? " template-editor__slot-section-head" : ""}`}>
              <strong>{activePanel === "definition" ? "槽位定义" : activePanel === "layout" ? "当前画布槽位样式" : selectedRoleObject ? "页面装修可编辑项" : "槽位规则"}</strong>
              <span>{selectedRoleObject && activePanel === "rules" ? "模板职责已预设" : selectedRoleObject ? "只定义模板职责，不编辑页面内容" : registry.label}</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              {activePanel === "layout" ? <>
              <div className="homepage-editor__inspector-section-head template-editor__slot-style-head"><strong>当前画布显示样式</strong><span>不会修改页面实际内容</span></div>
              <div className="template-editor__geometry-grid">
                {isImageSlot ? <>
                  <RatioField
                    label="图片比例"
                    value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).aspectRatio ?? "auto"}
                    presets={device === "desktop"
                      ? [{ value: "16:9", label: "16:9" }, { value: "3:2", label: "3:2" }, { value: "4:3", label: "4:3" }, { value: "1:1", label: "1:1" }]
                      : [{ value: "4:3", label: "4:3" }, { value: "1:1", label: "1:1" }, { value: "4:5", label: "4:5" }, { value: "3:4", label: "3:4" }, { value: "9:16", label: "9:16" }]}
                    customDefault={device === "desktop" ? "4:3" : "2:3"}
                    onChange={(aspectRatio) => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).aspectRatio = aspectRatio === "auto" ? undefined : aspectRatio; })}
                  />
                  <VisualChoiceField label="图片适配" value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).objectFit ?? "default"} columns={4} options={[
                    { value: "default", label: "默认", icon: <MenuOutlined /> },
                    { value: "cover", label: "裁切填满", icon: <FullscreenOutlined /> },
                    { value: "contain", label: "完整显示", icon: <CompressOutlined /> },
                    { value: "fill", label: "拉伸", icon: <ArrowsAltOutlined /> },
                  ]} onChange={(objectFit) => updateSlot((next) => {
                    (device === "desktop" ? next.desktopRules : next.mobileRules).objectFit = objectFit === "cover" || objectFit === "contain" || objectFit === "fill" ? objectFit : undefined;
                  })} />
                  {hasDesignField("slotRules.objectPosition") ? <ImageFocusField
                    label="画面焦点"
                    value={objectPositionToPercent(
                      (device === "desktop" ? slot.desktopRules : slot.mobileRules).objectPosition,
                    )}
                    allowPreciseInput={false}
                    onChange={(focus) => updateSlot((next) => {
                      (device === "desktop" ? next.desktopRules : next.mobileRules).objectPosition = percentToObjectPosition(focus);
                    })}
                  /> : null}
                </> : <>
                  <VisualChoiceField label="文字层级" value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).fontRole ?? "default"} columns={3} options={[
                    { value: "default", label: "默认", icon: <MenuOutlined /> },
                    { value: "display", label: "展示", icon: <FontSizeOutlined /> },
                    { value: "heading", label: "标题", icon: <FontSizeOutlined /> },
                    { value: "body", label: "正文", icon: <BarsOutlined /> },
                    { value: "caption", label: "辅助", icon: <BarsOutlined /> },
                    { value: "action", label: "行动", icon: <LinkOutlined /> },
                  ]} onChange={(fontRole) => updateSlot((next) => {
                    (device === "desktop" ? next.desktopRules : next.mobileRules).fontRole = fontRole === "display" || fontRole === "heading" || fontRole === "body" || fontRole === "caption" || fontRole === "action" ? fontRole : undefined;
                  })} />
                  <div className="homepage-editor__inspector-field"><label>字号</label><LengthField label="字号" value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).fontSize} onChange={(fontSize) => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).fontSize = fontSize; })} /></div>
                  <NumberField label="字重" min={100} max={900} step={100} value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).fontWeight} onChange={(value) => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).fontWeight = value; })} onClear={() => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).fontWeight = undefined; })} />
                  <NumberField label="行高" min={0.8} max={3} step={0.1} value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).lineHeight} onChange={(value) => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).lineHeight = value; })} onClear={() => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).lineHeight = undefined; })} />
                  <NumberField label="最大行数" min={1} max={DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES} value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).maxLines} onChange={(value) => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).maxLines = Math.min(value, DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES); })} onClear={() => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).maxLines = undefined; })} />
                  <VisualChoiceField label="文字对齐" value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).textAlign ?? "default"} columns={4} options={[
                    { value: "default", label: "默认", icon: <MenuOutlined /> },
                    { value: "left", label: "左", icon: <AlignLeftOutlined /> },
                    { value: "center", label: "中", icon: <AlignCenterOutlined /> },
                    { value: "right", label: "右", icon: <AlignRightOutlined /> },
                  ]} onChange={(textAlign) => updateSlot((next) => {
                    (device === "desktop" ? next.desktopRules : next.mobileRules).textAlign = textAlign === "left" || textAlign === "center" || textAlign === "right" ? textAlign : undefined;
                  })} />
                  <VisualChoiceField label="超长文字" value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).overflow ?? "default"} columns={4} options={[
                    { value: "default", label: "默认", icon: <MenuOutlined /> },
                    { value: "wrap", label: "换行", icon: <EnterOutlined /> },
                    { value: "ellipsis", label: "省略", icon: <BarsOutlined /> },
                    { value: "clip", label: "裁切", icon: <BorderOutlined /> },
                  ]} onChange={(overflow) => updateSlot((next) => {
                    (device === "desktop" ? next.desktopRules : next.mobileRules).overflow = overflow === "wrap" || overflow === "ellipsis" || overflow === "clip" ? overflow : undefined;
                  })} />
                </>}
              </div>
              </> : null}
            </div>
          </section>
        ) : null}

        {hasCapability("metadata.mobileBreakpoint") && activePanel === "rules" ? (
          <section className="homepage-editor__inspector-section template-editor__publish-settings-section">
            <div className="homepage-editor__inspector-section-head">
              <strong>发布设置</strong>
              <span>版本记录与模板适用范围</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              <TextField transactional label="版本说明" value={dynamicDraft.versionNote} maxLength={500} rows={3} showCount placeholder="说明本次结构、响应式或槽位变化；发布时随版本保存。" onChange={setDynamicVersionNote} />
              <div className="template-editor__geometry-grid">
                <div data-template-inspector-field="metadata.mobileBreakpoint"><NumberField label="小屏布局切换宽度" unit="像素" min={480} max={1024} disabled={Number(definition.schemaVersion) >= 2} hint={Number(definition.schemaVersion) >= 2 ? "新模板固定为 Mobile ≤767、Tablet 768–1023、Desktop ≥1024；这里只读显示。" : undefined} value={definition.metadata.mobileBreakpoint ?? 767} onChange={(mobileBreakpoint) => updateDefinition((next) => { next.metadata.mobileBreakpoint = mobileBreakpoint; })} /></div>
                <div data-template-inspector-field="metadata.minViewportWidth"><NumberField label="最小适用宽度" unit="像素" min={280} max={3840} value={definition.metadata.minViewportWidth ?? 320} onChange={(minViewportWidth) => updateDefinition((next) => { next.metadata.minViewportWidth = minViewportWidth; })} /></div>
                <div data-template-inspector-field="metadata.maxViewportWidth"><NumberField label="最大适用宽度" unit="像素" min={280} max={3840} value={definition.metadata.maxViewportWidth ?? 1920} onChange={(maxViewportWidth) => updateDefinition((next) => { next.metadata.maxViewportWidth = maxViewportWidth; })} /></div>
              </div>
              <div className="homepage-editor__inspector-field" data-template-inspector-field="metadata.recommendedFor">
                <label htmlFor="dynamic-template-pages">推荐页面</label>
                <Select
                  id="dynamic-template-pages"
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  maxTagCount="responsive"
                  aria-label="推荐页面"
                  value={definition.metadata.recommendedFor}
                  options={recommendedPageOptions}
                  onChange={(recommendedFor) => updateDefinition((next) => {
                    next.metadata.recommendedFor = recommendedFor;
                  })}
                />
                <span className="homepage-editor__inspector-hint">仅用于目录推荐，不限制其他页面使用；实际能否添加仍按页面角色与模板状态检查。</span>
              </div>
              <div className="homepage-editor__inspector-field" data-template-inspector-field="metadata.tags">
                <label htmlFor="dynamic-template-tags">标签</label>
                <Input
                  id="dynamic-template-tags"
                  aria-label="标签"
                  key={definition.metadata.tags.join("|")}
                  defaultValue={definition.metadata.tags.join("，")}
                  onBlur={(event) => updateDefinition((next) => {
                    next.metadata.tags = parseCommaSeparatedValues(
                      event.target.value,
                      DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags,
                    );
                  })}
                />
                <span className="homepage-editor__inspector-hint">
                  最多 {DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags.maxItems} 个，每个最多 {DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags.maxItemLength} 个字符
                </span>
              </div>
              <div className="template-editor__read-only-field" data-template-inspector-field="metadata.slotSummary" data-template-inspector-read-only="true" tabIndex={-1}><span>内容结构</span><strong>{definition.metadata.slotSummary}</strong></div>
            </div>
          </section>
        ) : null}

          </div>
  );
  const switchInspectorTask = (task: "design" | "page-scope") => {
    if (focusFirstInvalidNumberField()) return;
    setInspectorTask(task);
    setInspectorView(task === "page-scope" && !pageField ? "page-fields" : "context");
  };
  const openCurrentPageScope = () => {
    if (focusFirstInvalidNumberField()) return;
    const ownerSessionId = useTemplateEditorSession.getState().sessionId;
    switchInspectorTask("page-scope");
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const state = useTemplateEditorSession.getState();
      if (state.sessionId !== ownerSessionId || state.selectedObjectId !== activeNodeId || state.inspectorTask !== "page-scope") return;
      const field = inspectorPanelRef.current?.querySelector<HTMLElement>('[data-template-page-scope-field="editable"]');
      field?.scrollIntoView({ block: "nearest" });
      const target = field?.querySelector<HTMLElement>('button:not(:disabled)')
        ?? inspectorPanelRef.current?.querySelector<HTMLElement>('[data-template-page-scope-field="label"] input');
      target?.focus({ preventScroll: true });
    }));
  };
  const inspectorHeader = (
    <header className="homepage-editor__inspector-header">
      <span className={`template-editor__inspector-object-icon${selectedRoleObject ? ` is-${selectedRoleObject.kind}` : ""}`} aria-hidden="true">
        {selectedRoleObject ? <ContractRoleIcon kind={selectedRoleObject.kind} /> : <ApartmentOutlined />}
      </span>
      <div className="homepage-editor__inspector-heading">
        <span className="homepage-editor__inspector-eyebrow">
          当前对象 · {selectedRoleKindLabel ?? (isRoot ? "模板容器" : pageField?.slotTypeLabel ?? "布局容器")}
        </span>
        <strong className="homepage-editor__inspector-title" title={inspectorTitle}>{inspectorTitle}</strong>
        <span className="template-editor__inspector-breadcrumb" title={inspectorBreadcrumb}>{inspectorBreadcrumb}</span>
        {isLocked ? <span className="template-editor__object-lock-status">结构已锁定 · 属性只读</span> : null}
      </div>
      {selectedRoleObject && !selectedRoleApplicable ? (
        <span className="homepage-editor__inspector-device is-inapplicable">当前画布不显示</span>
      ) : null}
    </header>
  );
  const inspectorTaskTabs = (
    <div
      className="template-editor__task-tabs"
      role="tablist"
      aria-label="模板属性任务"
      onKeyDown={(event) => {
        const order = ["design", "page-scope"] as const;
        const current = order.indexOf(inspectorTask);
        const nextIndex = event.key === "Home" || event.key === "ArrowLeft"
          ? Math.max(0, current - 1)
          : event.key === "End" || event.key === "ArrowRight"
            ? Math.min(order.length - 1, current + 1)
            : -1;
        if (nextIndex < 0 || nextIndex === current || publishReview) return;
        event.preventDefault();
        const next = order[nextIndex];
        switchInspectorTask(next);
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>(`[data-template-inspector-task="${next}"]`)?.focus();
        });
      }}
    >
      <button
        type="button"
        role="tab"
        data-template-inspector-task="design"
        aria-selected={inspectorTask === "design"}
        aria-controls="template-inspector-design-panel"
        tabIndex={inspectorTask === "design" ? 0 : -1}
        disabled={Boolean(publishReview)}
        onClick={() => switchInspectorTask("design")}
      >设计</button>
      <button
        type="button"
        role="tab"
        data-template-inspector-task="page-scope"
        aria-selected={inspectorTask === "page-scope"}
        aria-controls="template-inspector-page-scope-panel"
        tabIndex={inspectorTask === "page-scope" ? 0 : -1}
        disabled={Boolean(publishReview)}
        onClick={() => switchInspectorTask("page-scope")}
      >页面开放范围</button>
    </div>
  );
  const publishIssueEditingNotice = publishIssueEditing ? (
    <Alert
      type="info"
      showIcon
      message="正在修复本次发布问题"
      description={<>
        <span>原检查快照已标记过期；完成编辑后必须重新检查。</span>
        <Button size="small" type="link" onClick={onOpenPublishReview}>返回已过期发布检查</Button>
      </>}
    />
  ) : null;
  const descendantNodeIds = new Set<string>();
  const collectDescendants = (nodeId: string) => {
    if (descendantNodeIds.has(nodeId)) return;
    const current = definition.nodes[nodeId];
    if (!current) return;
    descendantNodeIds.add(nodeId);
    current.childIds.forEach(collectDescendants);
  };
  collectDescendants(pageField && inspectorView === "page-fields"
    ? findDynamicTemplateParentId(definition, activeNodeId) ?? activeNodeId
    : activeNodeId);
  const scopedPageFields = pageFields.filter((field) => descendantNodeIds.has(field.nodeId));
  const activatePageField = (nodeId: string) => {
    if (focusFirstInvalidNumberField()) return;
    selectObject(nodeId);
    setInspectorView("context");
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-template-page-scope-field="label"] input')?.focus();
    }));
  };
  const pageDeclarationConflict = Boolean(
    pageField?.required && (!pageField.editable || pageField.hideable),
  );

  if (inspectorTask === "page-scope") {
    return (
      <aside
        ref={inspectorPanelRef}
        className="homepage-editor__inspector template-editor__inspector"
        aria-label="模板属性"
        tabIndex={-1}
        data-template-inspector-view={pageField && inspectorView === "context" ? "page-scope-context" : "page-fields"}
        data-template-inspector-object-id={activeNodeId}
      >
        {inspectorHeader}
        {inspectorTaskTabs}
        {publishIssueEditingNotice}
        <div
          id="template-inspector-page-scope-panel"
          className="homepage-editor__inspector-scroll template-editor__page-scope"
          role="tabpanel"
          aria-label="页面开放范围"
        >
          <div className="template-editor__page-scope-intro">
            <strong>交付给页面装修的字段</strong>
            <p>{pageField && inspectorView === "context"
              ? `${pageField.editable ? "运营可以填写内容" : "运营不能修改内容"}，${pageField.hideable ? "可以隐藏此字段" : "此字段固定显示"}。${describePageFieldOverrides(pageField)}。`
              : `${scopedPageFields.length} 个字段 · ${scopedPageFields.filter((field) => field.required).length} 项必填 · ${scopedPageFields.filter((field) => field.required && (!field.editable || field.hideable)).length} 项规则冲突`}</p>
          </div>
          {validation.issues.some((issue) => issue.level === "error") ? (
            <Alert
              type="error"
              showIcon
              message="模板定义存在无效引用或结构错误"
              description="页面字段只展示可安全解析的节点；请从发布检查定位并修复其余问题。"
            />
          ) : null}
          {pageField && inspectorView === "context" ? (
            <section
              className="template-editor__page-field-editor"
              aria-label={`${pageField.label}页面规则`}
              {...getDynamicTemplatePageFieldDataAttributes(pageField, "full")}
            >
              <div className="template-editor__page-field-actions">
                <Button size="small" onClick={() => {
                  if (!focusFirstInvalidNumberField()) setInspectorView("page-fields");
                }}>返回当前结构全部字段</Button>
              </div>
              {isLocked ? (
                <Alert
                  type="warning"
                  showIcon
                  message="当前字段随结构锁定"
                  description={(
                    <>
                      <span>页面规则仍可查看；解锁结构后才能修改。</span>
                      {structureLockOwnerId ? (
                        <Button size="small" type="link" onClick={() => focusStructureLockOwner(structureLockOwnerId)}>定位解锁设置</Button>
                      ) : null}
                    </>
                  )}
                />
              ) : null}
              <section className="template-editor__page-rule-group" aria-label="字段身份">
              <h3>字段身份</h3>
              <div data-template-page-scope-field="label">
                <TextField
                  transactional
                  label="页面字段名称"
                  value={pageField.label}
                  maxLength={100}
                  readOnly={isLocked}
                  onChange={(label) => updateSlot((next) => { next.label = label; })}
                />
              </div>
              <p className="template-editor__page-field-type">{pageField.slotTypeLabel} · {PAGE_FIELD_CONTROL_KIND_LABELS[pageField.controlKind]}</p>
              <details className="template-editor__page-field-identity">
                <summary>系统身份 · 改名称不会改变身份</summary>
                <dl><dt>字段标识</dt><dd>{pageField.stableKey}</dd><dt>槽位 ID</dt><dd>{pageField.slotId}</dd><dt>节点 ID</dt><dd>{pageField.nodeId}</dd></dl>
              </details>
              </section>
              <section className="template-editor__page-rule-group" aria-label="内容规则">
              <h3>内容规则</h3>
              <div className="template-editor__page-rule-switches">
                <div data-template-page-scope-field="required" data-template-inspector-field="slot.required">
                  <SwitchField
                    label="页面必须填写"
                    value={pageField.required}
                    disabled={isLocked || (!pageField.required && (!pageField.editable || pageField.hideable))}
                    hint={!pageField.required && (!pageField.editable || pageField.hideable)
                      ? "先允许页面填写内容并关闭页面隐藏，再设为必填；不会自动更改其他开关。"
                      : undefined}
                    onChange={(required) => updateSlot((next) => { next.required = required; })}
                  />
                </div>
                <div data-template-page-scope-field="editable" data-template-inspector-field="slot.editable">
                  <SwitchField
                    label="页面可填写内容"
                    value={pageField.editable}
                    disabled={isLocked || (pageField.required && pageField.editable)}
                    hint={pageField.required && pageField.editable
                      ? "必填字段必须允许填写；先关闭“页面必须填写”，才能改为只读。"
                      : undefined}
                    onChange={(editable) => updateSlot((next) => { next.editable = editable; })}
                  />
                </div>
                <div data-template-page-scope-field="hideable" data-template-inspector-field="slot.hideable">
                  <SwitchField
                    label="页面可隐藏"
                    value={pageField.hideable}
                    disabled={isLocked || (pageField.required && !pageField.hideable)}
                    hint={pageField.required && !pageField.hideable
                      ? "必填字段不可允许页面隐藏；先关闭“页面必须填写”，才能开放隐藏。"
                      : undefined}
                    onChange={(hideable) => updateSlot((next) => { next.hideable = hideable; })}
                  />
                </div>
              </div>
              {pageDeclarationConflict ? (
                <Alert
                  type="error"
                  showIcon
                  message="必填字段必须可填写且不可隐藏"
                  description={(
                    <Button
                      size="small"
                      disabled={isLocked}
                      onClick={() => executeCommand({
                        type: "update-definition",
                        label: "允许填写并关闭隐藏",
                        update: (next) => {
                          const target = next.slots[pageField.slotId];
                          target.editable = true;
                          target.hideable = false;
                        },
                      })}
                    >允许填写并关闭隐藏</Button>
                  )}
                />
              ) : null}
              {!pageField.required && (!pageField.editable || pageField.hideable) ? <Button
                disabled={isLocked}
                onClick={() => executeCommand({
                  type: "update-definition",
                  label: "设为必填、允许填写并关闭隐藏",
                  update: (next) => {
                    const target = next.slots[pageField.slotId];
                    target.required = true;
                    target.editable = true;
                    target.hideable = false;
                  },
                })}
              >设为必填、允许填写并关闭隐藏</Button> : null}
              {!pageField.editable ? <p className="homepage-editor__inspector-hint">内容只读。页面必须已有合法内容来源；模板示例不会作为真实内容补入。</p> : null}
              </section>
              <section className="template-editor__page-rule-group" aria-label="内容限制">
              <h3>内容限制</h3>
              <p className="homepage-editor__inspector-hint">用于页面填写校验，所有设备共用。</p>
              {pageField.controlKind === "image" ? (
                <><div className="template-editor__geometry-grid">
                  <NumberField label="建议图片宽" unit="像素" min={1} max={20000} value={pageField.validation.recommendedWidth} disabled={isLocked} onChange={(value) => updateSlot((next) => { next.validation.recommendedWidth = value; })} onClear={() => updateSlot((next) => { next.validation.recommendedWidth = undefined; })} />
                  <NumberField label="建议图片高" unit="像素" min={1} max={20000} value={pageField.validation.recommendedHeight} disabled={isLocked} onChange={(value) => updateSlot((next) => { next.validation.recommendedHeight = value; })} onClear={() => updateSlot((next) => { next.validation.recommendedHeight = undefined; })} />
                </div><p className="homepage-editor__inspector-hint">图片尺寸是建议值，不会作为上传尺寸的硬性门槛。</p></>
              ) : null}
              {(pageField.controlKind === "text" || pageField.controlKind === "link") ? (
                <div className="template-editor__geometry-grid">
                  <NumberField label="最大字数" min={Math.max(1, pageField.validation.minLength ?? 0)} max={100000} value={pageField.validation.maxLength} disabled={isLocked} onChange={(value) => updateSlot((next) => { next.validation.maxLength = value; })} onClear={() => updateSlot((next) => { next.validation.maxLength = undefined; })} />
                  <NumberField label="最小字数" min={0} max={pageField.validation.maxLength ?? 100000} value={pageField.validation.minLength} disabled={isLocked} onChange={(value) => updateSlot((next) => { next.validation.minLength = value; })} onClear={() => updateSlot((next) => { next.validation.minLength = undefined; })} />
                </div>
              ) : null}
              {(pageField.controlKind === "product" || pageField.controlKind === "structured") ? (
                <div className="template-editor__geometry-grid">
                  <NumberField label="最少项目数" min={0} max={pageField.validation.maxItems ?? 100} value={pageField.validation.minItems} disabled={isLocked} onChange={(minItems) => updateSlot((next) => { next.validation.minItems = minItems; })} onClear={() => updateSlot((next) => { next.validation.minItems = undefined; })} />
                  <NumberField label="最多项目数" min={Math.max(1, pageField.validation.minItems ?? 0)} max={100} value={pageField.validation.maxItems} disabled={isLocked} onChange={(maxItems) => updateSlot((next) => { next.validation.maxItems = maxItems; })} onClear={() => updateSlot((next) => { next.validation.maxItems = undefined; })} />
                </div>
              ) : null}
              {pageField.controlKind === "link" ? (
                <div className="homepage-editor__inspector-field">
                  <label htmlFor={`page-scope-protocols-${pageField.slotId}`}>允许跳转类型</label>
                  <Select
                    id={`page-scope-protocols-${pageField.slotId}`}
                    mode="multiple"
                    allowClear
                    disabled={isLocked}
                    aria-label="允许跳转类型"
                    value={pageField.validation.allowedProtocols}
                    options={[
                      { value: "https", label: "外部 HTTPS" },
                      { value: "page", label: "站内页面" },
                      { value: "product", label: "商品" },
                      { value: "category", label: "分类" },
                      { value: "none", label: "无跳转" },
                    ]}
                    onChange={(allowedProtocols) => updateSlot((next) => {
                      next.validation.allowedProtocols = allowedProtocols.length
                        ? allowedProtocols as NonNullable<typeof next.validation.allowedProtocols>
                        : undefined;
                    })}
                  />
                </div>
              ) : null}
              </section>
              <section className="homepage-editor__inspector-section template-editor__page-rule-group" aria-label="可调整设计">
                <div className="homepage-editor__inspector-section-head">
                  <strong>可调整设计</strong>
                  <span>不改变母模板结构</span>
                </div>
                {!pageField.editable ? <p className="homepage-editor__inspector-hint">允许页面填写内容后，才能开放设计调整；已配置的范围会保留。</p> : null}
                {!supportsPageTextStyles && (node.instanceEditPolicy?.typography || node.instanceEditPolicy?.spacing) ? <p className="homepage-editor__inspector-hint">已保留原有{[node.instanceEditPolicy.typography ? "文字样式" : "", node.instanceEditPolicy.spacing ? "间距" : ""].filter(Boolean).join("、")}设置；当前对象的页面表单不支持这些调整。</p> : null}
                <div className="homepage-editor__inspector-section-body template-editor__page-rule-switches">
                  <SwitchField label="允许调整位置" value={instancePolicy.position === true} disabled={isLocked || !pageField.editable} onChange={(position) => updateInstancePolicy((next) => { next.position = position; })} />
                  <SwitchField label="允许调整尺寸" value={instancePolicy.size === true} disabled={isLocked || !pageField.editable} onChange={(size) => updateInstancePolicy((next) => { next.size = size; })} />
                  <SwitchField label="允许调整层级" value={instancePolicy.zIndex === true} disabled={isLocked || !pageField.editable} onChange={(zIndex) => updateInstancePolicy((next) => { next.zIndex = zIndex; })} />
                  {supportsPageTextStyles ? <SwitchField label="允许调整间距" value={instancePolicy.spacing === true} disabled={isLocked || !pageField.editable} onChange={(spacing) => updateInstancePolicy((next) => { next.spacing = spacing; })} /> : null}
                  {supportsPageTextStyles ? <SwitchField label="允许调整文字样式" value={instancePolicy.typography === true} disabled={isLocked || !pageField.editable} onChange={(typography) => updateInstancePolicy((next) => { next.typography = typography; })} /> : null}
                  {pageField.controlKind === "image" ? <>
                    <SwitchField label="可调整图片适配" value={instancePolicy.imageFit === true} disabled={isLocked || !pageField.editable} onChange={(imageFit) => updateInstancePolicy((next) => { next.imageFit = imageFit; })} />
                    <SwitchField label="可调整画面焦点" value={instancePolicy.imageFocus === true} disabled={isLocked || !pageField.editable} onChange={(imageFocus) => updateInstancePolicy((next) => { next.imageFocus = imageFocus; })} />
                  </> : null}
                </div>
                {instancePolicy.position || instancePolicy.size || (supportsPageTextStyles && (instancePolicy.typography || instancePolicy.spacing)) ? <div className="template-editor__geometry-grid" aria-label="页面设计调整边界">
                  {instancePolicy.position ? <NumberField label="最大位置偏移" unit="%" min={0} max={50} value={instancePolicy.maxOffsetPercent} disabled={isLocked || !pageField.editable} onChange={(maxOffsetPercent) => updateInstancePolicy((next) => { next.maxOffsetPercent = maxOffsetPercent; })} /> : null}
                  {instancePolicy.size ? <>
                    <NumberField label="最小宽度比例" unit="%" min={10} max={100} value={instancePolicy.minWidthPercent} disabled={isLocked || !pageField.editable} onChange={(minWidthPercent) => updateInstancePolicy((next) => { next.minWidthPercent = minWidthPercent; })} />
                    <NumberField label="最大宽度比例" unit="%" min={100} max={200} value={instancePolicy.maxWidthPercent} disabled={isLocked || !pageField.editable} onChange={(maxWidthPercent) => updateInstancePolicy((next) => { next.maxWidthPercent = maxWidthPercent; })} />
                  </> : null}
                  {supportsPageTextStyles && instancePolicy.typography ? <>
                    <NumberField label="最小字号" unit="px" min={8} max={Math.min(72, instancePolicy.maxFontSizePx ?? 200)} value={instancePolicy.minFontSizePx} disabled={isLocked || !pageField.editable} onChange={(minFontSizePx) => updateInstancePolicy((next) => { next.minFontSizePx = minFontSizePx; })} />
                    <NumberField label="最大字号" unit="px" min={Math.max(12, instancePolicy.minFontSizePx ?? 8)} max={200} value={instancePolicy.maxFontSizePx} disabled={isLocked || !pageField.editable} onChange={(maxFontSizePx) => updateInstancePolicy((next) => { next.maxFontSizePx = maxFontSizePx; })} />
                  </> : null}
                  {supportsPageTextStyles && instancePolicy.spacing ? <NumberField label="最大间距" unit="px" min={0} max={200} value={instancePolicy.maxSpacingPx} disabled={isLocked || !pageField.editable} onChange={(maxSpacingPx) => updateInstancePolicy((next) => { next.maxSpacingPx = maxSpacingPx; })} /> : null}
                </div> : null}
              </section>
              <PageFieldFormPreview fields={[pageField]} onLocate={activatePageField} />
            </section>
          ) : (
            <section className="template-editor__page-field-list" aria-label="当前结构页面字段">
              {scopedPageFields.length ? <PageFieldFormPreview fields={scopedPageFields} onLocate={activatePageField} /> : null}
              {scopedPageFields.length ? scopedPageFields.map((field) => (
                <button
                  key={field.slotId}
                  type="button"
                  onClick={() => activatePageField(field.nodeId)}
                  {...getDynamicTemplatePageFieldDataAttributes(field, "full")}
                >
                  <span><strong>{field.label}</strong><small>{field.slotTypeLabel}</small></span>
                  <span>{field.required ? "必填" : "可选"} · {field.editable ? "可填写" : "只读"} · {field.hideable ? "可隐藏" : "固定显示"}</span>
                  <span>控件：{PAGE_FIELD_CONTROL_KIND_LABELS[field.controlKind]}</span>
                  <span>限制：{describePageFieldValidation(field)}</span>
                  <span>页面设计覆盖：{describePageFieldOverrides(field)}</span>
                  {field.required && (!field.editable || field.hideable) ? <strong className="template-editor__page-field-conflict">规则冲突 · 点击修复</strong> : null}
                </button>
              )) : (
                <Alert
                  type="info"
                  showIcon
                  message="当前结构没有页面字段"
                  description="从结构区添加图片、文字等内容元素后，会自动生成对应页面字段；再在这里设置名称与填写规则，无需另建字段。"
                />
              )}
            </section>
          )}
        </div>
      </aside>
    );
  }

  const simpleSlot = !publishIssueEditing && !selectedRoleObject && SIMPLE_SLOT_TYPES.has(node.type) && !hasDesignField("responsive.placement") && ["auto", "fixed", "aspect-ratio"].includes(rules.height.mode);
  const nativeDesign = Number(definition.schemaVersion) >= 2 && !selectedRoleObject;
  const simpleContainer = !isRoot && isLayoutContainer && !getTemplateComposition(definition, activeNodeId, device) && rules.layoutMode !== "free";
  return (
    <aside
      ref={inspectorPanelRef}
      className="homepage-editor__inspector template-editor__inspector"
      aria-label="模板属性"
      tabIndex={-1}
      data-template-inspector-view="context"
      data-template-inspector-object={isRoot ? "root" : selectedRoleObject?.kind ?? registrySlotType ?? "node"}
      data-template-inspector-object-id={activeNodeId}
      data-template-inspector-device={device}
      data-template-inspector-role={selectedRoleObject ? "true" : "false"}
    >
      {inspectorHeader}
      {inspectorTaskTabs}
      {publishIssueEditingNotice}
      {!isRoot && !simpleSlot && hasCapability("node.name") ? <div className="template-editor__pinned-name" data-template-inspector-field="node.name">
        <TextField transactional validate={(name) => name.trim() ? null : "节点名称不能为空。"} label="节点名称" value={node.name} maxLength={TEMPLATE_NODE_NAME_MAX_LENGTH} readOnly={isLocked} onChange={(name) => updateDefinition((next) => { next.nodes[activeNodeId].name = name; })} />
      </div> : null}

      <div
        id="template-inspector-design-panel"
        className="homepage-editor__inspector-scroll"
        role="tabpanel"
        aria-label="模板属性功能区"
      >
        {publishReview ? validationSection : null}
        {isRoot && !publishReview ? <div className="template-editor__pinned-name" data-template-inspector-field="name">
          <TextField transactional label="模板名称" hint="发布前必填；用于在模板列表中识别这份设计。" value={definition.name} maxLength={100} onChange={(name) => updateDefinition((next) => { next.name = name; })} />
        </div> : null}
        {lastCommandResult && !lastCommandResult.ok ? (
          <Alert
            className="template-editor__command-error"
            type="error"
            showIcon
            closable
            onClose={clearLastCommandResult}
            message={`${lastCommandResult.label}未应用`}
            description={`${lastCommandResult.message} 未写入草稿，撤销历史和未保存状态保持不变。`}
          />
        ) : null}
        {locateIssueNotice ? (
          <Alert
            className="template-editor__command-error"
            type="info"
            showIcon
            closable
            onClose={() => { setLocateIssueNotice(null); setLocateUnlockOwnerId(null); }}
            message={locateIssueNotice === RESPONSIVE_COPY_DIALOG_UNAVAILABLE ? "无法打开复制确认窗口" : "定位说明"}
            description={<>
              <p>{locateIssueNotice}</p>
              {locateIssueRecovery ? <p>请撤销产生此问题的修改；若问题来自导入文件，请修正源文件后重新导入。已发布版本保持不变。</p> : null}
              {locateUnlockOwnerId ? <Button size="small" onClick={() => {
                selectObject(locateUnlockOwnerId);
                window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
                  const field = document.querySelector<HTMLElement>('[data-template-inspector-field="authoring.structureLocked"]');
                  field?.scrollIntoView({ block: "nearest" });
                  field?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
                }));
              }}>定位解锁设置</Button> : null}
            </>}
          />
        ) : null}
        {publishIssueEditing && !isRoot && hasCapability("hidden") ? (
          <div className="homepage-editor__inspector-field" data-template-inspector-field="hidden">
            <SwitchField
              label="模板中隐藏节点"
              value={node.hidden}
              disabled={isLocked}
              onChange={(hidden) => updateDefinition((next) => { next.nodes[activeNodeId].hidden = hidden; })}
            />
          </div>
        ) : null}
        {nativeDesign ? <TemplateNativeDesignControls nodeIds={[activeNodeId]} onOpenPageScope={pageField ? openCurrentPageScope : undefined} layoutControls={({ disabled }) => <TemplateLayoutConversionControls nodeId={activeNodeId} disabled={disabled} />} /> : null}
        {isRoot ? <details open={rootSettingsOpen} onToggle={(event) => {
          if (!event.currentTarget.open && focusFirstInvalidNumberField()) { event.currentTarget.open = true; return; }
          setRootSettingsOpen(event.currentTarget.open);
        }}><summary>模板设置</summary>{rootUsageSection}</details> : null}
        {!nativeDesign && simpleSlot ? <TemplateSlotControls definition={definition} nodeId={activeNodeId} device={device} onChange={updateDefinition} /> : null}
        {!nativeDesign && (simpleSlot || simpleContainer) ? <section className="homepage-editor__inspector-section template-editor__responsive-source-section">
          <div className="homepage-editor__inspector-section-head"><strong>布局值来源</strong><span>{responsiveSource === "shared" ? "与另一画布一致" : "当前画布有独立值"}</span></div>
          <div className="homepage-editor__inspector-section-body"><div className="template-editor__responsive-source-actions">
            <p>先选择要处理的设计组；复制前会逐字段预览，确认后只形成一步历史。</p>
            <fieldset className="template-editor__responsive-group-picker" aria-label="响应式设计组">
              {applicableResponsiveGroups.map((group) => <label key={group}><input type="checkbox" checked={activeSelectedResponsiveGroups.includes(group)} onChange={(event) => toggleResponsiveGroup(group, event.target.checked)} /><span>{DYNAMIC_TEMPLATE_RESPONSIVE_GROUP_LABELS[group]}</span></label>)}
            </fieldset>
            <div>
              <Button size="small" disabled={isLocked || responsiveSource === "shared" || activeSelectedResponsiveGroups.length === 0} onClick={() => copyResponsive(otherDevice, device, "用另一画布值替换当前画布")}>用另一画布替换当前画布</Button>
              <Button size="small" disabled={isLocked || activeSelectedResponsiveGroups.length === 0} onClick={() => copyResponsive(device, otherDevice, "复制当前画布到另一画布")}>复制当前画布到另一画布</Button>
              <Button size="small" disabled={isLocked || activeSelectedResponsiveGroups.length === 0 || !baseline?.definition.nodes[activeNodeId]} onClick={() => baseline && executeCommand({ type: "restore-responsive-groups", label: "恢复当前对象上次保存值", nodeId: activeNodeId, device, groups: activeSelectedResponsiveGroups, baselineDefinition: baseline.definition })}>恢复上次保存值</Button>
              <Button size="small" disabled={isLocked || activeSelectedResponsiveGroups.length === 0} onClick={() => executeCommand({ type: "reset-responsive-groups", label: "恢复当前对象系统默认", nodeId: activeNodeId, device, groups: activeSelectedResponsiveGroups })}>恢复系统默认</Button>
            </div>
          </div></div>
        </section> : null}
        {!nativeDesign ? <TemplateCompositionControls definition={definition} selectedId={activeNodeId} device={device} onChange={updateDefinition} /> : null}
        {!nativeDesign && !getTemplateComposition(definition, activeNodeId, device) && isLayoutContainer ? <TemplateContainerControls definition={definition} nodeId={activeNodeId} device={device} showNodeName={isRoot} onChange={updateDefinition} /> : null}
        {structureLockSection}
        {nativeDesign || simpleSlot || isRoot || simpleContainer ? null : getTemplateComposition(definition, activeNodeId, device) || isLayoutContainer ? (
          <section className="template-editor__settings-section">
            <h3>精确位置与尺寸 · 查看当前数值</h3>
            {renderInspectorPanel("layout", TEMPLATE_INSPECTOR_PANELS[inspectorContext].find((entry) => entry.panel === "layout")!.label)}
          </section>
        ) : renderInspectorPanel("layout", TEMPLATE_INSPECTOR_PANELS[inspectorContext].find((entry) => entry.panel === "layout")!.label)}
        {metadataDetailsOpen && isRoot ? (
          <section id="template-inspector-metadata" ref={metadataDetailsRef} className="template-editor__settings-section">
            <h3>模板资料 · {nodeIssues.filter((issue) => issue.level === "error").length} 项错误</h3>
            {renderInspectorPanel("definition", TEMPLATE_INSPECTOR_PANELS[inspectorContext].find((entry) => entry.panel === "definition")!.label)}
            {renderInspectorPanel("rules", TEMPLATE_INSPECTOR_PANELS[inspectorContext].find((entry) => entry.panel === "rules")!.label)}
          </section>
        ) : null}
        {!publishReview && (validationOpenRequest > 0 || (Number(definition.schemaVersion) < 3 && displayedValidationIssues.length > 0)) ? validationSection : null}
      </div>
    </aside>
  );
}
