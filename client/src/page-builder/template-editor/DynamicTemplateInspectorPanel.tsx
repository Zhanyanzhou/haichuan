import TemplateSlotControls, { SIMPLE_SLOT_TYPES } from "./TemplateSlotControls";
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
import { Alert, App as AntdApp, Button, Input, InputNumber, Select, Slider } from "antd";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import NumberField from "../inspector/controls/NumberField";
import ImageFocusField from "../inspector/controls/ImageFocusField";
import SelectField from "../inspector/controls/SelectField";
import SwitchField from "../inspector/controls/SwitchField";
import TextField from "../inspector/controls/TextField";
import TemplateCompositionControls from "./TemplateCompositionControls";
import TemplateContainerControls from "./TemplateContainerControls";
import { getTemplateComposition } from "./templateCompositionPresets";
import DynamicComplexContentFields, { isDynamicComplexSlotType } from "../inspector/controls/DynamicComplexContentFields";
import {
  getDynamicTemplateNodeRegistryEntry,
  getDynamicTemplateStructureLockOwnerId,
  DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS,
  DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH,
  DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES,
  addDynamicTemplateNode,
  moveDynamicTemplateNode,
  normalizeTemplateDimensionContract,
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
} from "../template-definition";
import {
  clearDynamicTemplateCompatibilityContent,
  findDynamicTemplateParentId,
  getDynamicTemplateAllowedParentIds,
  parseCommaSeparatedValues,
} from "./dynamicTemplateEditorUtils";
import {
  resolveContractRoleForDevice,
  useTemplateEditorSession,
} from "./templateEditorSession";
import {
  objectPositionToPercent,
  percentToObjectPosition,
} from "../template-definition/imagePosition";
import {
  getContentTemplateContract,
  getContentTemplateDefaultRect,
  type ContentTemplateEditableCapability,
} from "../generated/contentTemplates.generated";
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
  TEMPLATE_CONTRACT_CAPABILITY_LABELS,
  TEMPLATE_CONTRACT_KIND_LABELS,
} from "./contractRolePresentation";
import { editorPages } from "../config/editorPages";
import { TEMPLATE_NODE_NAME_MAX_LENGTH } from "./templateEditorLimits";
import {
  getTemplateInspectorCapabilities,
  getTemplateResponsiveCopyChanges,
  getTemplateResponsiveSource,
  hasTemplateInspectorCapability,
  reconcileTemplatePublishIssueIndex,
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
      <InputNumber
        aria-label={label}
        min={0}
        max={10000}
        value={value?.value}
        placeholder={placeholder}
        onChange={(next) => {
          if (next === null) onChange(undefined);
          else onChange({ value: next, unit: value?.unit ?? "px" });
        }}
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
          <InputNumber
            aria-label={`${label}宽`}
            min={1}
            max={100}
            value={safeWidth}
            onChange={(next) => onChange(`${next ?? safeWidth}:${safeHeight}`)}
          />
          <span aria-hidden="true">:</span>
          <InputNumber
            aria-label={`${label}高`}
            min={1}
            max={100}
            value={safeHeight}
            onChange={(next) => onChange(`${safeWidth}:${next ?? safeHeight}`)}
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

import type { TemplatePublishReview } from "./TemplateWorkspaceController";
import type { TemplateInspectorIssueTarget } from "./templateInspectorCapabilities";

export default function DynamicTemplateInspectorPanel({
  localOnly = false,
  publishReview = null,
  onSelectPublishIssue,
  onPrepareIssueTarget,
}: {
  localOnly?: boolean;
  publishReview?: TemplatePublishReview | null;
  onSelectPublishIssue?: (index: number) => void;
  onPrepareIssueTarget?: (target: TemplateInspectorIssueTarget) => void;
}) {
  const publishReviewRef = useRef<HTMLElement>(null);
  const { modal } = AntdApp.useApp();
  useEffect(() => {
    if (!publishReview?.requestId) return;
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
  }, [publishReview?.requestId]);
  const draft = useTemplateEditorSession((state) => state.draft);
  const device = useTemplateEditorSession((state) => state.device);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  const selectedContractRole = useTemplateEditorSession((state) => state.selectedContractRole);
  const executeCommand = useTemplateEditorSession((state) => state.executeCommand);
  const lastCommandResult = useTemplateEditorSession((state) => state.lastCommandResult);
  const clearLastCommandResult = useTemplateEditorSession((state) => state.clearLastCommandResult);
  const setDynamicVersionNote = useTemplateEditorSession((state) => state.setDynamicVersionNote);
  const selectObject = useTemplateEditorSession((state) => state.selectObject);
  const dynamicDraft = draft;
  const metadataDetailsRef = useRef<HTMLElement>(null);
  const [gridColumnsError, setGridColumnsError] = useState<string | null>(null);
  const [metadataDetailsOpen, setMetadataDetailsOpen] = useState(false);
  const [locateIssueNotice, setLocateIssueNotice] = useState<string | null>(null);
  const [locateUnlockOwnerId, setLocateUnlockOwnerId] = useState<string | null>(null);
  const [locateIssueRecovery, setLocateIssueRecovery] = useState(false);
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
    const openMetadata = () => {
      setMetadataDetailsOpen(true);
      window.requestAnimationFrame(() => {
        metadataDetailsRef.current?.scrollIntoView({ block: "nearest" });
      });
    };
    window.addEventListener("template-editor:open-metadata", openMetadata);
    return () => window.removeEventListener("template-editor:open-metadata", openMetadata);
  }, []);
  const canvasMeasurement = useCanvasObjectMeasurement({
    definition: dynamicDraft?.definition,
    nodeId: selectionNodeId,
    roleId: selectedRoleId,
    device,
  });
  const validation = useMemo(
    () => dynamicDraft ? validateDynamicTemplateDefinition(dynamicDraft.definition) : null,
    [dynamicDraft],
  );
  const publishValidation = useMemo(
    () => dynamicDraft ? validateDynamicTemplatePublishDefinition(dynamicDraft.definition) : null,
    [dynamicDraft],
  );
  if (!dynamicDraft || !validation) return null;

  const definition = dynamicDraft.definition;
  const activeNodeId = selectedNodeId && definition.nodes[selectedNodeId]
    ? selectedNodeId
    : definition.rootNodeId;
  const node = definition.nodes[activeNodeId];
  const isRoot = activeNodeId === definition.rootNodeId;
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
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
  const selectedRoleSupports = (capability: ContentTemplateEditableCapability) => {
    if (!selectedRoleObject?.capabilities.includes(capability)) return false;
    const viewports = selectedRoleObject.capabilityViewports?.[capability];
    return !viewports || viewports.includes(device);
  };
  const selectedRoleVisual = selectedRoleObject ? resolveVisualNode({
    __instanceOverrides: node.props.contentTemplateLayoutData,
  }, selectedRoleObject.roleId, device) : undefined;
  const selectedRoleRect = selectedRoleObject && contentContract
    ? selectedRoleVisual?.rect
      ?? getContentTemplateDefaultRect(contentContract.moduleType, selectedRoleObject.roleId, device)
    : undefined;
  const selectedRoleMediaLayout = selectedRoleObject
    ? contentContract?.editorCapabilities.layoutOverrides?.slots?.find(
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
  const rules = node.responsive[device];
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
  const isVideoSlot = registrySlotType === "video";
  const complexSlotType = registrySlotType && isDynamicComplexSlotType(registrySlotType)
    ? registrySlotType
    : null;
  const isComplexSlot = complexSlotType !== null;
  const supportsTypography = hasCapability("slot.validation.maxLength");
  const supportsItems = hasCapability("slot.validation.maxItems");
  const supportsProtocols = hasCapability("slot.validation.allowedProtocols");
  const instancePolicy = node.instanceEditPolicy ?? {
    position: false,
    size: false,
    zIndex: false,
    imageFit: slot?.type === "image",
    imageFocus: slot?.type === "image",
    typography: false,
    spacing: false,
    minWidthPercent: 25,
    maxWidthPercent: 150,
    maxOffsetPercent: 30,
    minFontSizePx: 12,
    maxFontSizePx: 96,
    maxSpacingPx: 120,
  };

  const updateDefinition = (
    mutate: (next: TemplateDefinitionV2) => void,
    label = "更新模板字段",
  ) => executeCommand({ type: "update-definition", label, update: mutate });
  const updateRules = (mutate: (next: DynamicTemplateResponsiveRules) => void) => {
    updateDefinition((next) => mutate(next.nodes[activeNodeId].responsive[device]));
  };
  const updateSlot = (mutate: (next: DynamicTemplateSlotDefinition) => void) => {
    if (!node.slotId) return;
    updateDefinition((next) => mutate(next.slots[node.slotId!]));
  };
  const updateInstancePolicy = (
    mutate: (next: NonNullable<typeof node.instanceEditPolicy>) => void,
  ) => {
    if (!slot) return;
    updateDefinition((next) => {
      const target = next.nodes[activeNodeId];
      target.instanceEditPolicy ??= structuredClone(instancePolicy);
      mutate(target.instanceEditPolicy);
    });
  };
  const updateSelectedRoleLayoutPath = (path: string[], value: unknown) => {
    if (!selectedRoleObject) return;
    updateDefinition((next) => {
      const target = next.nodes[activeNodeId];
      const updated = setVisualOverridePath(target.props.contentTemplateLayoutData, path, value);
      if (updated) target.props.contentTemplateLayoutData = updated;
      else delete target.props.contentTemplateLayoutData;
    });
  };
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
  const copySelectedRoleToOtherDevice = () => {
    if (!selectedRoleObject || !selectedRoleRect || !selectedRoleForOtherDevice) return;
    updateDefinition((next) => {
      const target = next.nodes[activeNodeId];
      let layoutData = setVisualOverridePath(
        target.props.contentTemplateLayoutData,
        ["nodes", selectedRoleForOtherDevice.roleId, "rectByViewport", otherDevice],
        selectedRoleRect,
      );
      layoutData = setVisualOverridePath(
        layoutData,
        ["nodes", selectedRoleForOtherDevice.roleId, "zIndexByViewport", otherDevice],
        selectedRoleVisual?.zIndex,
      );
      if (layoutData) target.props.contentTemplateLayoutData = layoutData;
    }, `复制${selectedRoleLabel ?? "当前对象"}构图到另一画布`);
  };

  const responsiveSource = getTemplateResponsiveSource(definition, activeNodeId, device);
  const copyResponsive = (sourceDevice: typeof device, targetDevice: typeof device, label: string) => {
    const changes = getTemplateResponsiveCopyChanges(definition, activeNodeId, sourceDevice, targetDevice);
    modal.confirm({
      title: label,
      content: <div className="template-editor__responsive-copy-review">
        <p>将用{sourceDevice === device ? "当前画布" : "另一画布"}布局{slot ? "及槽位样式" : ""}替换{targetDevice === device ? "当前画布" : "另一画布"}对应值。确认后可一步撤销。</p>
        {changes.length ? <table><thead><tr><th>字段</th><th>当前值</th><th>替换后</th></tr></thead><tbody>
          {changes.map((change) => <tr key={change.field}><th>{change.field}</th><td>{change.before}</td><td>{change.after}</td></tr>)}
        </tbody></table> : <p>两端对应值一致，没有需要替换的字段。</p>}
      </div>,
      okText: "确认替换",
      cancelText: "取消",
      okButtonProps: { disabled: changes.length === 0 },
      onOk: () => { executeCommand({
        type: "copy-responsive", label, nodeId: activeNodeId, sourceDevice, targetDevice, includeSlotRules: Boolean(slot),
      }); },
    });
  };

  const focusValidationIssue = (issue: DynamicTemplateValidationIssue) => {
    const target = resolveTemplateInspectorIssueTarget(definition, issue);
    if (publishReview) {
      onSelectPublishIssue?.(publishReview.issues.findIndex((candidate) => candidate.code === issue.code && candidate.path === issue.path));
    }
    setLocateIssueNotice(null);
    setLocateUnlockOwnerId(null);
    setLocateIssueRecovery(false);
    onPrepareIssueTarget?.(target);
    selectObject(target.objectId);
    if (target.device && target.device !== device) {
      setLocateIssueNotice("此问题位于另一画布，请通过顶部设备入口切换后再次定位。");
      window.requestAnimationFrame(() => publishReviewRef.current?.focus());
      return;
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const markAndFocus = (destination: HTMLElement, focusTarget: HTMLElement) => {
        document.querySelectorAll<HTMLElement>("[data-template-inspector-located]")
          .forEach((element) => delete element.dataset.templateInspectorLocated);
        destination.dataset.templateInspectorLocated = "true";
        destination.scrollIntoView({ block: "nearest", behavior: "smooth" });
        focusTarget.focus();
      };
      if (target.destination === "structure-region" || target.destination === "structure-slot") {
        if (target.destination === "structure-slot") {
          const trigger = document.querySelector<HTMLButtonElement>(
            '.template-editor__add-trigger[aria-label="添加槽位"]',
          );
          if (trigger?.getAttribute("aria-expanded") !== "true") trigger?.click();
        }
        window.requestAnimationFrame(() => {
          const destination = document.querySelector<HTMLElement>(
            `[data-template-inspector-field="${target.field}"]`,
          );
          if (!destination) {
            setLocateIssueNotice(target.reason ?? "结构创建入口当前不可用，请先展开模板结构工具。");
            return;
          }
          markAndFocus(destination, destination);
          setLocateIssueNotice(target.reason ?? "请在结构工具中完成选择。");
        });
        return;
      }
      if (target.destination === "unavailable") {
        setLocateIssueNotice(target.reason ?? "当前问题没有可安全直接编辑的字段。");
        return;
      }
      const field = document.querySelector<HTMLElement>('[data-template-inspector-pinned-name]') && target.field === "name"
        ? document.querySelector<HTMLElement>('[data-template-inspector-pinned-name]')
        : document.querySelector<HTMLElement>("aside.template-editor__inspector")?.querySelector<HTMLElement>(
        `[data-template-inspector-field="${target.field}"]`,
      );
      const showUnavailableField = () => {
        const lockOwner = getDynamicTemplateStructureLockOwnerId(definition, target.objectId);
        setLocateUnlockOwnerId(lockOwner);
        setLocateIssueNotice(lockOwner
          ? `“${definition.nodes[lockOwner]?.name ?? "上级对象"}”的结构已锁定，请先定位并关闭“锁定位置、尺寸和层级”，再返回本条问题。`
          : target.reason ?? `“${target.field}”当前不可直接编辑。请先恢复该字段所需的设置。`);
        publishReviewRef.current?.focus();
      };
      if (!field) {
        showUnavailableField();
        return;
      }
      let ancestor: HTMLElement | null = field;
      while (ancestor) {
        if (ancestor.hidden) {
          ancestor.parentElement?.querySelector<HTMLButtonElement>(':scope > button[aria-expanded="false"]')?.click();
        }
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
        ancestor = ancestor.parentElement;
      }
      const focusTarget = target.access === "editable"
        ? field.querySelector<HTMLElement>("input:not(:disabled):not([readonly]),button:not(:disabled),select:not(:disabled),textarea:not(:disabled):not([readonly]),[tabindex]:not(:disabled):not([readonly]):not([aria-disabled='true'])")
        : field;
      if (!focusTarget) {
        showUnavailableField();
        return;
      }
      window.requestAnimationFrame(() => markAndFocus(field, focusTarget));
      if (target.access !== "editable") {
        setLocateIssueNotice(target.reason ?? `“${target.field}”由系统管理，不能在此直接修改。`);
        setLocateIssueRecovery(true);
      }
    }));
  };

  const canRepairValidationIssue = (issue: DynamicTemplateValidationIssue) => [
    "REQUIRED_SLOT_MUST_BE_EDITABLE",
    "PUBLISH_REQUIRED_SLOT_PAGE_HIDE_CONFLICT",
    "PUBLISH_REQUIRED_SLOT_HIDDEN",
    "PUBLISH_REQUIRED_SLOT_DEVICE_HIDDEN",
    "PUBLISH_FORBIDS_DEFAULT_CONTENT",
    "PUBLISH_FORBIDS_MOCK_CONTENT",
    "PUBLISH_FORBIDS_LEGACY_EMPTY_POLICY",
    "ROOT_RATIO_METADATA_MISMATCH",
  ].includes(issue.code);

  const repairValidationIssue = (issue: DynamicTemplateValidationIssue) => {
    const target = resolveTemplateInspectorIssueTarget(definition, issue);
    const result = executeCommand({
      type: "transform-definition",
      label: `修复：${issue.message}`,
      transform: (current) => {
        if ([
          "PUBLISH_FORBIDS_DEFAULT_CONTENT",
          "PUBLISH_FORBIDS_MOCK_CONTENT",
          "PUBLISH_FORBIDS_LEGACY_EMPTY_POLICY",
        ].includes(issue.code)) {
          return clearDynamicTemplateCompatibilityContent(current);
        }
        if (issue.code === "ROOT_RATIO_METADATA_MISMATCH") {
          return normalizeTemplateDimensionContract(current);
        }
        const object = current.nodes[target.objectId];
        const targetSlot = object?.slotId ? current.slots[object.slotId] : undefined;
        if (issue.code === "REQUIRED_SLOT_MUST_BE_EDITABLE" && targetSlot) {
          const next = structuredClone(current);
          next.slots[targetSlot.slotId].editable = true;
          return next;
        }
        if (issue.code === "PUBLISH_REQUIRED_SLOT_PAGE_HIDE_CONFLICT" && targetSlot) {
          const next = structuredClone(current);
          next.slots[targetSlot.slotId].hideable = false;
          return next;
        }
        if (issue.code === "PUBLISH_REQUIRED_SLOT_HIDDEN" && object) {
          const next = structuredClone(current);
          next.nodes[target.objectId].hidden = false;
          return next;
        }
        if (issue.code === "PUBLISH_REQUIRED_SLOT_DEVICE_HIDDEN" && object && target.device) {
          const next = structuredClone(current);
          next.nodes[target.objectId].responsive[target.device].display = "block";
          return next;
        }
        return current;
      },
    });
    if (result.ok) {
      if (publishReview) {
        // 安全修复可能同时清理多项；按最新草稿选择仍可处理的下一项。
        const next = useTemplateEditorSession.getState().draft;
        const issues = next ? validateDynamicTemplatePublishDefinition(next.definition).issues : [];
        const nextIssue = issues[reconcileTemplatePublishIssueIndex(publishReview.issues, publishReview.currentIndex, issues)];
        if (nextIssue) focusValidationIssue(nextIssue);
        else publishReviewRef.current?.focus();
      } else focusValidationIssue(issue);
    }
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
  const nodeIssues = activeValidation.issues.filter((issue) => (
    issue.nodeId === activeNodeId || (node.slotId && issue.slotId === node.slotId)
  ));
  const displayedValidationIssues = publishReview ? publishReview.issues : isRoot
    ? activeValidation.issues
    : nodeIssues.length
      ? nodeIssues
      : activeValidation.issues;
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
  const selectedRoleApplicable = !selectedRoleDefinition?.appliesTo
    || selectedRoleDefinition.appliesTo.includes(device);
  const inspectorTitle = isRoot ? "内容区域" : selectedRoleDisplayLabel ?? node.name;
  const structureLockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, activeNodeId);
  const isLocked = structureLockOwnerId !== null;
  const isOwnStructureLocked = structureLockOwnerId === activeNodeId;
  const isLockedByAncestor = isLocked && !isOwnStructureLocked;
  const activeFrame = resolveTemplateDesignFrame(definition, device);
  const validationSection = (
        <section ref={publishReview ? publishReviewRef : undefined} role={publishReview ? "region" : undefined} aria-label={publishReview ? "本次发布检查" : undefined} tabIndex={publishReview ? -1 : undefined} className="homepage-editor__inspector-section template-editor__validation-section">
          <div className="homepage-editor__inspector-section-head"><strong>{(publishReview || isRoot) ? "发布检查" : "实时校验"}</strong><span>{activeValidation.valid ? ((publishReview || isRoot) ? "满足发布门禁" : "可保存草稿") : ((publishReview || isRoot) ? "存在阻止发布的问题" : "存在阻止保存的错误")}</span></div>
          <div className="homepage-editor__inspector-section-body template-editor__validation-list" role="status" aria-live="polite">
            {publishReview ? <>
              <p>{displayedValidationIssues.filter((issue) => issue.level === "error").length} 项错误 · {displayedValidationIssues.filter((issue) => issue.level === "warning").length} 项提醒</p>
              <p>{activeValidation.valid ? "已满足发布门禁，请再次点击发布；已有页面继续使用旧版本。" : "模板尚未发布；修复后自动重验，已有页面继续使用旧版本。"}</p>
              {displayedValidationIssues.length > 0 ? <>
                <p>当前 {publishReview.currentIndex + 1} / {displayedValidationIssues.length}：{displayedValidationIssues[publishReview.currentIndex]?.message}</p>
                <span className="template-editor__validation-actions">
                  <Button size="small" disabled={publishReview.currentIndex <= 0} onClick={() => focusValidationIssue(displayedValidationIssues[publishReview.currentIndex - 1])}>上一个问题</Button>
                  <Button size="small" disabled={publishReview.currentIndex >= displayedValidationIssues.length - 1} onClick={() => focusValidationIssue(displayedValidationIssues[publishReview.currentIndex + 1])}>下一个问题</Button>
                </span>
              </> : null}
            </> : null}
            {!publishReview && isRoot && displayedValidationIssues.length > 0 ? (
              <p className="template-editor__role-definition-note">
                安全修复只更新当前未保存草稿并立即重新校验；通过后仍需使用顶部“发布模板”显式重试，不会绕过发布门禁。
              </p>
            ) : null}
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
                  <strong>{issue.level === "error" ? "错误" : issue.level === "warning" ? "提醒" : "说明"}</strong>
                  <span>{issue.message}</span>
                  {target.destination === "structure-region" || target.destination === "structure-slot" ? (
                    <small>{target.reason}</small>
                  ) : null}
                  <span className="template-editor__validation-actions">
                    <Button type="link" size="small" onClick={() => focusValidationIssue(issue)}>定位</Button>
                    {canRepairValidationIssue(issue) ? (
                      <Button type="link" size="small" onClick={() => repairValidationIssue(issue)}>安全修复并重验</Button>
                    ) : null}
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
                          <Button type="link" size="small" onClick={() => focusValidationIssue(issue)}>定位</Button>
                          {canRepairValidationIssue(issue) ? (
                            <Button type="link" size="small" onClick={() => repairValidationIssue(issue)}>安全修复并重验</Button>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {displayedValidationIssues.length === 0 ? <p>{(publishReview || isRoot) ? "当前模板通过发布结构、尺寸、内容边界和权限检查。" : "当前模板定义通过结构与语义校验。"}</p> : null}
          </div>
        </section>
  );
  const inspectorBreadcrumb = isRoot
    ? "模板容器"
    : [definition.name, parentId ? definition.nodes[parentId]?.name : null]
        .filter((label): label is string => Boolean(label))
        .join(" / ");
  const renderInspectorPanel = (activePanel: TemplateInspectorPanel, label: string) => (
          <div key={activePanel} id={`template-inspector-panel-${activePanel}`} role="group" aria-label={label} data-template-inspector-section={activePanel}>
        {slot && activePanel === "rules" ? (
          <section className="template-editor__usage-summary" aria-label="使用规则摘要">
            <strong>{selectedRoleObject ? "所属槽位与对象的使用规则" : "页面使用规则"}</strong>
            <p>{slot.required ? "必填" : "选填"} · {slot.editable ? "页面可填写内容" : "页面不可改内容"} · {slot.hideable ? "页面允许隐藏" : "页面不可隐藏"}</p>
            <p>结构{isLocked ? "已锁定" : "未锁定"}；结构锁定控制模板位置、尺寸与层级。</p>
            <p>页面可调整：{selectedRoleObject
              ? selectedRoleObject.capabilities.map((capability) => TEMPLATE_CONTRACT_CAPABILITY_LABELS[capability]).join("、") || "无"
              : ([['position', '位置'], ['size', '尺寸'], ['zIndex', '层级'], ['imageFit', '图片适配'], ['imageFocus', '图片焦点'], ['typography', '文字样式'], ['spacing', '间距']] as const).filter(([key]) => instancePolicy[key]).map(([, text]) => text).join("、") || "无"}。</p>
          </section>
        ) : null}
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
              <span>身份、用途与视觉职责</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              <div data-template-inspector-field="name">
                <TextField label="模板名称" value={definition.name} maxLength={100} onChange={(name) => updateDefinition((next) => { next.name = name; })} />
              </div>
              <div className="template-editor__geometry-grid">
                <div data-template-inspector-field="metadata.category"><TextField label="分类" value={definition.metadata.category} maxLength={50} onChange={(category) => updateDefinition((next) => { next.metadata.category = category; })} /></div>
                <div data-template-inspector-field="metadata.purpose"><TextField label="用途" value={definition.metadata.purpose} maxLength={100} onChange={(purpose) => updateDefinition((next) => { next.metadata.purpose = purpose; })} /></div>
                <div data-template-inspector-field="metadata.layoutType"><TextField label="构图类型" value={definition.metadata.layoutType} maxLength={DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.layoutType} onChange={(layoutType) => updateDefinition((next) => { next.metadata.layoutType = layoutType; })} /></div>
              </div>
              <div data-template-inspector-field="metadata.visualRole"><VisualChoiceField label="页面视觉职责" value={definition.metadata.visualRole ?? "support-stage"} columns={3} options={[
                { value: "primary-stage", label: "主舞台", icon: <FullscreenOutlined /> },
                { value: "feature-stage", label: "重点区", icon: <AppstoreOutlined /> },
                { value: "support-stage", label: "辅助区", icon: <BarsOutlined /> },
              ]} onChange={(visualRole) => updateDefinition((next) => {
                if (visualRole === "primary-stage" || visualRole === "feature-stage" || visualRole === "support-stage") next.metadata.visualRole = visualRole;
              })} /></div>
              <div data-template-inspector-field="description"><TextField label="模板说明" value={definition.description ?? ""} maxLength={500} rows={3} onChange={(description) => updateDefinition((next) => { next.description = description; })} /></div>
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

        {hasCapability("responsive.*.display") && activePanel === "layout" ? (
          <section className="homepage-editor__inspector-section template-editor__responsive-source-section">
            <div className="homepage-editor__inspector-section-head">
              <strong>布局值来源</strong>
              <span>{responsiveSource === "shared" ? "与另一画布一致" : "当前画布有独立值"}</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              <div className="template-editor__responsive-source-actions" data-template-inspector-field="responsive.source">
                <p>
                  各画布分别保存布局值。替换前可检查字段差异，确认后可一步撤销。
                </p>
                <div>
                  <Button
                    size="small"
                    disabled={isLocked || responsiveSource === "shared"}
                    onClick={() => copyResponsive(otherDevice, device, "用另一画布值替换当前画布")}
                  >
                    用另一画布替换当前画布
                  </Button>
                  <Button
                    size="small"
                    disabled={isLocked}
                    onClick={() => copyResponsive(device, otherDevice, "复制当前画布到另一画布")}
                  >
                    复制当前画布到另一画布
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

              <section className="template-editor__settings-section">
                <h3>高级位置与尺寸</h3>
                <div className="template-editor__role-advanced-body">
                  <div className="template-editor__responsive-source-actions" data-template-inspector-field="contentTemplateLayoutData">
                    <p>{selectedRoleHasDeviceOverride ? "当前画布已单独调整。" : "当前画布使用模板默认值。"}</p>
                    <div>
                      <Button size="small" disabled={!selectedRoleRect || !selectedRoleForOtherDevice} onClick={copySelectedRoleToOtherDevice}>
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
                          value={selectedRoleVisual?.zIndex ?? Math.max(0, selectedRoleObject.constraints.layerRange.min)}
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
            {rules.placement ? (
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
                  hint={slot?.required ? "必填槽位必须在全部画布保持显示；如需隐藏，先在“页面可编辑”中取消必填。" : undefined}
                  options={[
                    { value: "block", label: "显示", accessibleLabel: "自然", icon: <MenuOutlined /> },
                    {
                      value: "none",
                      label: "隐藏",
                      icon: <EyeInvisibleOutlined />,
                      disabledReason: slot?.required ? "必填槽位不能隐藏" : undefined,
                    },
                  ]}
                  onChange={(display) => updateRules((next) => {
                    if (display === "none" && slot?.required) return;
                    next.display = display;
                  })}
                /></div>
              )}
              {isLayoutContainer && rules.display === "flex" ? <div data-template-inspector-field="responsive.*.direction"><VisualChoiceField label="排列方向" value={rules.direction ?? "row"} columns={2} options={[
                { value: "row", label: "横向", icon: <ColumnWidthOutlined /> },
                { value: "column", label: "纵向", icon: <ColumnHeightOutlined /> },
              ]} onChange={(direction) => updateRules((next) => { if (direction === "row" || direction === "column") next.direction = direction; })} /></div> : null}
              {isLayoutContainer && rules.display === "grid" ? (
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
                <VisualChoiceField label="交叉方向对齐" value={rules.alignItems ?? "default"} columns={5} options={[
                  { value: "default", label: "默认", icon: <MenuOutlined /> },
                  { value: "start", label: "靠前", icon: <VerticalAlignTopOutlined /> },
                  { value: "center", label: "居中", icon: <VerticalAlignMiddleOutlined /> },
                  { value: "end", label: "靠后", icon: <VerticalAlignBottomOutlined /> },
                  { value: "stretch", label: "拉伸", icon: <ArrowsAltOutlined /> },
                ]} onChange={(alignItems) => updateRules((next) => {
                  next.alignItems = alignItems === "start" || alignItems === "center" || alignItems === "end" || alignItems === "stretch" ? alignItems : undefined;
                })} />
                {isLayoutContainer ? <VisualChoiceField label="主要方向对齐" value={rules.justifyContent ?? "default"} columns={3} options={[
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

        {(hasCapability("slot.slotId") || inspectorContext === "role") && slot && !(selectedRoleObject && activePanel === "layout") && !(isLocked && activePanel === "layout") ? (
          <section className="homepage-editor__inspector-section template-editor__slot-properties-section">
            <div className={`homepage-editor__inspector-section-head${selectedRoleObject ? " template-editor__slot-section-head" : ""}`}>
              <strong>{activePanel === "definition" ? "槽位定义" : activePanel === "layout" ? "当前画布槽位样式" : selectedRoleObject ? "页面装修可编辑项" : "槽位规则"}</strong>
              <span>{selectedRoleObject && activePanel === "rules" ? "系统模板已预设" : selectedRoleObject ? "只定义模板职责，不编辑页面内容" : registry.label}</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              {activePanel === "layout" && !selectedRoleObject ? <>
              <div className="template-editor__geometry-grid">
                <div data-template-inspector-field="slot.required">
                  <SwitchField label="页面必须填写" value={slot.required} onChange={(required) => updateSlot((next) => {
                    next.required = required;
                    if (required) {
                      next.editable = true;
                      next.hideable = false;
                    }
                  })} />
                </div>
                <div data-template-inspector-field="slot.editable">
                  <SwitchField
                    label="页面可编辑内容"
                    value={slot.editable}
                    disabled={slot.required && slot.editable}
                    hint={slot.required
                      ? slot.editable
                        ? "必填槽位必须允许页面填写；取消必填后才可关闭。"
                        : "当前设置与必填冲突，请开启页面可编辑内容。"
                      : "关闭后，页面装修只能使用模板或业务提供的只读内容。"}
                    onChange={(editable) => {
                      if (!editable && slot.required) return;
                      updateDefinition((next) => {
                        next.slots[node.slotId!].editable = editable;
                        if (!editable) {
                          const policy = next.nodes[activeNodeId].instanceEditPolicy;
                          if (policy) {
                            policy.position = false;
                            policy.size = false;
                            policy.zIndex = false;
                            policy.imageFit = false;
                            policy.imageFocus = false;
                            policy.typography = false;
                            policy.spacing = false;
                          }
                        }
                      });
                    }}
                  />
                </div>
                <div data-template-inspector-field="slot.hideable">
                  <SwitchField
                    label="页面可隐藏"
                    value={slot.hideable}
                    disabled={slot.required && !slot.hideable}
                    hint={slot.required
                      ? slot.hideable
                        ? "当前设置与必填冲突，请关闭此项后再发布。"
                        : "必填槽位不能在页面装修中隐藏；取消必填后才可开启。"
                      : "允许页面运营者隐藏这个可选槽位。"}
                    onChange={(hideable) => {
                      if (hideable && slot.required) return;
                      updateSlot((next) => { next.hideable = hideable; });
                    }}
                  />
                </div>
              </div>
              </> : null}
              {activePanel === "rules" && !selectedRoleObject ? <>
              <div className="homepage-editor__inspector-section-head"><strong>页面装修可调整范围</strong><span>只保留运营需要的设置；页面装修不能改变母模板结构</span></div>
              <div className="template-editor__geometry-grid">
                <SwitchField label="允许调整位置" hint="页面可在下方偏移上限内移动当前槽位。" value={instancePolicy.position} disabled={!slot.editable} onChange={(position) => updateInstancePolicy((next) => { next.position = position; })} />
                <SwitchField label="允许调整尺寸" hint="页面可在下方宽度范围内缩放当前槽位。" value={instancePolicy.size} disabled={!slot.editable} onChange={(size) => updateInstancePolicy((next) => { next.size = size; })} />
                <SwitchField label="允许调整层级" hint="页面可调整当前槽位与模板内其他槽位的前后关系。" value={instancePolicy.zIndex} disabled={!slot.editable} onChange={(zIndex) => updateInstancePolicy((next) => { next.zIndex = zIndex; })} />
                <SwitchField label="允许调整间距" hint="页面可调整当前槽位的上下留白。" value={instancePolicy.spacing === true} disabled={!slot.editable} onChange={(spacing) => updateInstancePolicy((next) => { next.spacing = spacing; })} />
                {supportsTypography ? (
                  <SwitchField label="允许调整文字样式" hint="页面可在下方字号范围内调整字号和对齐。" value={instancePolicy.typography === true} disabled={!slot.editable} onChange={(typography) => updateInstancePolicy((next) => { next.typography = typography; })} />
                ) : null}
                {isImageSlot ? <>
                  <SwitchField label="可调整图片适配" value={instancePolicy.imageFit !== false} disabled={!slot.editable} onChange={(imageFit) => updateInstancePolicy((next) => { next.imageFit = imageFit; })} />
                  <SwitchField label="可调整画面焦点" value={instancePolicy.imageFocus !== false} disabled={!slot.editable} onChange={(imageFocus) => updateInstancePolicy((next) => { next.imageFocus = imageFocus; })} />
                </> : null}
              </div>
              <div className="template-editor__geometry-grid">
                {instancePolicy.position ? (
                  <NumberField label="最大位置偏移" hint="相对模板默认位置，横向和纵向最多可移动的百分比。" unit="%" min={0} max={50} value={instancePolicy.maxOffsetPercent} onChange={(maxOffsetPercent) => updateInstancePolicy((next) => { next.maxOffsetPercent = maxOffsetPercent; })} />
                ) : null}
                {instancePolicy.size ? <>
                  <NumberField label="最小宽度" unit="%" min={10} max={100} value={instancePolicy.minWidthPercent} onChange={(minWidthPercent) => updateInstancePolicy((next) => { next.minWidthPercent = minWidthPercent; })} />
                  <NumberField label="最大宽度" unit="%" min={100} max={200} value={instancePolicy.maxWidthPercent} onChange={(maxWidthPercent) => updateInstancePolicy((next) => { next.maxWidthPercent = maxWidthPercent; })} />
                </> : null}
                {supportsTypography && instancePolicy.typography ? <>
                  <NumberField label="最小字号" unit="像素" min={8} max={72} value={instancePolicy.minFontSizePx ?? 12} onChange={(minFontSizePx) => updateInstancePolicy((next) => {
                    next.minFontSizePx = minFontSizePx;
                    if ((next.maxFontSizePx ?? 96) < minFontSizePx) next.maxFontSizePx = minFontSizePx;
                  })} />
                  <NumberField label="最大字号" unit="像素" min={12} max={200} value={instancePolicy.maxFontSizePx ?? 96} onChange={(maxFontSizePx) => updateInstancePolicy((next) => {
                    next.maxFontSizePx = maxFontSizePx;
                    if ((next.minFontSizePx ?? 12) > maxFontSizePx) next.minFontSizePx = maxFontSizePx;
                  })} />
                </> : null}
                {instancePolicy.spacing ? (
                  <NumberField label="最大上下间距" unit="像素" min={0} max={200} value={instancePolicy.maxSpacingPx ?? 120} onChange={(maxSpacingPx) => updateInstancePolicy((next) => { next.maxSpacingPx = maxSpacingPx; })} />
                ) : null}
              </div>
              </> : null}
              {activePanel === "definition" ? <>
              {selectedRoleObject ? (
                <div className="template-editor__role-definition-card">
                  <div className="template-editor__role-definition-grid">
                    <div>
                      <span>对象职责</span>
                      <strong>{selectedRoleLabel}</strong>
                    </div>
                    <div>
                      <span>内容类型</span>
                      <strong>{selectedRoleKindLabel}</strong>
                    </div>
                    <div>
                      <span>适用画布</span>
                      <strong>{!selectedRoleDefinition?.appliesTo || selectedRoleDefinition.appliesTo.length > 1
                        ? "全部画布"
                        : selectedRoleApplicable ? "当前画布" : "另一画布"}</strong>
                    </div>
                    <div>
                      <span>页面装修</span>
                      <strong>{slot.editable ? "配置实际内容" : "只读业务内容"}</strong>
                    </div>
                  </div>
                  <p>此处只确定槽位职责。图片、文字、链接和商品等实际内容仍在页面装修中配置。</p>
                </div>
              ) : (
                <div data-template-inspector-field="slot.label"><TextField label="槽位名称" value={slot.label} maxLength={100} readOnly={isLocked} onChange={(label) => updateSlot((next) => { next.label = label; })} /></div>
              )}
              {!selectedRoleObject ? <>
                <div className="template-editor__read-only-field" data-template-inspector-field="slot.type" data-template-inspector-read-only="true" tabIndex={-1}>
                  <span>槽位类型</span>
                  <strong>{registry.label}</strong>
                </div>
                <div className="template-editor__read-only-field" data-template-inspector-field="slot.editable" data-template-inspector-read-only="true" tabIndex={-1}>
                  <span>页面装修职责</span>
                  <strong>{slot.editable ? "配置实际内容" : "只读业务内容"}</strong>
                </div>
                <div className="template-editor__read-only-field" data-template-inspector-field="slot.key" data-template-inspector-read-only="true" tabIndex={-1}>
                  <span>槽位键</span>
                  <strong>{slot.key} · 为保持页面实例关联稳定，此处只读</strong>
                </div>
                <p className="template-editor__role-definition-note">模板模式只定义槽位职责、构图和页面可编辑范围；实际内容在页面装修中配置。</p>
              </> : null}
              </> : null}
              {activePanel === "rules" ? <>
              {selectedRoleObject ? (
                <div className="template-editor__capability-summary">
                  <strong>{selectedRoleLabel} · 页面装修可调整</strong>
                  <em>系统预设 · 不可修改</em>
                  <div>
                    {selectedRoleObject.capabilities.map((capability) => (
                      <span key={capability}>{TEMPLATE_CONTRACT_CAPABILITY_LABELS[capability] ?? "其他受控设置"}</span>
                    ))}
                  </div>
                  <p>页面装修只显示以下设置，且不会改变母模板结构。</p>
                </div>
              ) : null}
              {!selectedRoleObject && (isImageSlot || isVideoSlot) ? <div className="template-editor__geometry-grid">
                <div data-template-inspector-field="slot.validation.recommendedWidth"><NumberField label="建议图片宽" unit="像素" min={1} max={20000} value={slot.validation.recommendedWidth} onChange={(value) => updateSlot((next) => { next.validation.recommendedWidth = value; })} onClear={() => updateSlot((next) => { next.validation.recommendedWidth = undefined; })} /></div>
                <div data-template-inspector-field="slot.validation.recommendedHeight"><NumberField label="建议图片高" unit="像素" min={1} max={20000} value={slot.validation.recommendedHeight} onChange={(value) => updateSlot((next) => { next.validation.recommendedHeight = value; })} onClear={() => updateSlot((next) => { next.validation.recommendedHeight = undefined; })} /></div>
              </div> : null}
              {!selectedRoleObject && supportsTypography ? <div className="template-editor__geometry-grid">
                <div data-template-inspector-field="slot.validation.maxLength"><NumberField label="最大字数" min={1} max={100000} value={slot.validation.maxLength} onChange={(value) => updateSlot((next) => { next.validation.maxLength = value; })} onClear={() => updateSlot((next) => { next.validation.maxLength = undefined; })} /></div>
                <div data-template-inspector-field="slot.validation.minLength"><NumberField label="最小字数" min={0} max={100000} value={slot.validation.minLength} onChange={(value) => updateSlot((next) => { next.validation.minLength = value; })} onClear={() => updateSlot((next) => { next.validation.minLength = undefined; })} /></div>
              </div> : null}
              {!selectedRoleObject && supportsItems ? (
                <div className="template-editor__geometry-grid">
                  <div data-template-inspector-field="slot.validation.minItems"><NumberField label="最少项目数" min={0} max={100} value={slot.validation.minItems} onChange={(minItems) => updateSlot((next) => {
                    next.validation.minItems = minItems;
                    if ((next.validation.maxItems ?? 100) < minItems) next.validation.maxItems = Math.max(1, minItems);
                  })} onClear={() => updateSlot((next) => { next.validation.minItems = undefined; })} /></div>
                  <div data-template-inspector-field="slot.validation.maxItems">
                    <NumberField label="最多项目数" min={1} max={100} value={slot.validation.maxItems} onChange={(maxItems) => updateSlot((next) => {
                      next.validation.maxItems = maxItems;
                      if ((next.validation.minItems ?? 0) > maxItems) next.validation.minItems = maxItems;
                    })} onClear={() => updateSlot((next) => { next.validation.maxItems = undefined; })} />
                  </div>
                </div>
              ) : null}
              {!selectedRoleObject && supportsProtocols ? (
                <div className="homepage-editor__inspector-field" data-template-inspector-field="slot.validation.allowedProtocols">
                  <label htmlFor={`dynamic-slot-protocols-${slot.slotId}`}>允许跳转类型</label>
                  <Select
                    id={`dynamic-slot-protocols-${slot.slotId}`}
                    mode="multiple"
                    allowClear
                    aria-label="允许跳转类型"
                    value={slot.validation.allowedProtocols}
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
                  <span className="homepage-editor__inspector-hint">只限制页面装修可保存的跳转目标，不在模板中写入实际链接。</span>
                </div>
              ) : null}
              {!selectedRoleObject ? <>
                <div className="template-editor__read-only-field" data-template-inspector-field="slot.emptyPolicy" data-template-inspector-read-only="true" tabIndex={-1}>
                  <span>空内容处理</span>
                  <strong>{slot.required
                    ? "页面发布前必须填写"
                    : slot.emptyPolicy === "use-default"
                      ? "兼容历史默认内容"
                      : "公开页隐藏槽位"}</strong>
                </div>
              </> : null}
              </> : null}
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
                  <ImageFocusField
                    label="画面焦点"
                    value={objectPositionToPercent(
                      (device === "desktop" ? slot.desktopRules : slot.mobileRules).objectPosition,
                    )}
                    allowPreciseInput={false}
                    onChange={(focus) => updateSlot((next) => {
                      (device === "desktop" ? next.desktopRules : next.mobileRules).objectPosition = percentToObjectPosition(focus);
                    })}
                  />
                </> : isVideoSlot ? (
                  <RatioField label="视频槽位比例" value={typeof node.props.contentTemplateDesignProps?.aspectRatio === "string" ? node.props.contentTemplateDesignProps.aspectRatio : "16:9"} presets={[
                    { value: "16:9", label: "16:9" },
                    { value: "21:6", label: "21:6" },
                    { value: "4:5", label: "4:5" },
                    { value: "9:16", label: "9:16" },
                  ]} customDefault="1:1" onChange={(aspectRatio) => updateDefinition((next) => {
                    next.nodes[activeNodeId].props.contentTemplateDesignProps = {
                      ...next.nodes[activeNodeId].props.contentTemplateDesignProps,
                      aspectRatio,
                    };
                  })} />
                ) : isComplexSlot && complexSlotType ? (
                  <DynamicComplexContentFields
                    scope="template"
                    device={device}
                    slotType={complexSlotType}
                    designValue={node.props.contentTemplateDesignProps}
                    onDesignChange={(value) => updateDefinition((next) => {
                      const target = next.nodes[activeNodeId];
                      const previous = target.props.contentTemplateDesignProps;
                      target.props.contentTemplateDesignProps = value;
                      if (complexSlotType !== "doublePosterTemplate" || !contentContract) return;

                      for (const [ratioKey, roleId] of [
                        ["mainImageRatio", "mainImage"],
                        ["detailImageRatio", "detailImage"],
                      ] as const) {
                        const ratioValue = value[ratioKey];
                        if (typeof ratioValue !== "string" || previous?.[ratioKey] === ratioValue) continue;
                        const [ratioWidth, ratioHeight] = ratioValue.split(":").map(Number);
                        const ratio = ratioWidth / ratioHeight;
                        if (!Number.isFinite(ratio) || ratio <= 0) continue;

                        const layoutData = target.props.contentTemplateLayoutData;
                        if (!isVisualRecord(layoutData) || layoutData.version !== 2) continue;
                        const nodes = isVisualRecord(layoutData.nodes) ? layoutData.nodes : {};
                        const roleNode = isVisualRecord(nodes[roleId]) ? nodes[roleId] : undefined;
                        const rects = isVisualRecord(roleNode?.rectByViewport)
                          ? roleNode.rectByViewport
                          : undefined;
                        // 没有手工矩形时继续沿用合同骨架；只有显式矩形需要同步高度，
                        // 否则比例控件会凭空创建布局覆盖并改变既有主次构图。
                        if (!isVisualRecord(rects?.[device])) continue;
                        const rect = resolveVisualNode({ __instanceOverrides: layoutData }, roleId, device).rect;
                        if (!rect) continue;

                        const frame = isVisualRecord(layoutData.frame) ? layoutData.frame : {};
                        const aspectRatios = isVisualRecord(frame.aspectRatioByViewport)
                          ? frame.aspectRatioByViewport
                          : {};
                        const frameAspectRatio = Number(
                          aspectRatios[device]
                            ?? frame.aspectRatio
                            ?? contentContract.defaultGeometryByViewport[device].frameAspectRatio,
                        );
                        if (!Number.isFinite(frameAspectRatio) || frameAspectRatio <= 0) continue;
                        const editableObject = contentContract.editorCapabilities.editableObjects.find(
                          (candidate) => candidate.roleId === roleId,
                        );
                        const minHeight = editableObject?.constraints.minSize.height ?? 0.08;
                        const maxHeight = editableObject?.constraints.maxSize.height ?? 1;
                        const nextHeight = Math.min(
                          1 - rect.y,
                          maxHeight,
                          Math.max(minHeight, rect.width * frameAspectRatio / ratio),
                        );
                        const updated = setVisualOverridePath(
                          target.props.contentTemplateLayoutData,
                          ["nodes", roleId, "rectByViewport", device],
                          { ...rect, height: nextHeight },
                        );
                        if (updated) target.props.contentTemplateLayoutData = updated;
                      }
                    })}
                  />
                ) : <>
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

        {hasCapability("authoring.structureLocked") && activePanel === "layout" ? (
          <section className="homepage-editor__inspector-section template-editor__structure-lock-section">
            <div className="homepage-editor__inspector-section-head"><strong>结构锁定</strong><span>锁定后仍可选中和查看</span></div>
            <div className="homepage-editor__inspector-section-body">
              <div data-template-inspector-field="authoring.structureLocked"><SwitchField
                label="锁定位置、尺寸和层级"
                hint={isLockedByAncestor
                  ? `当前节点受“${definition.nodes[structureLockOwnerId!]?.name ?? "上级节点"}”保护，请先解除上级锁定。`
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
        ) : null}

        {hasCapability("metadata.mobileBreakpoint") && activePanel === "rules" ? (
          <section className="homepage-editor__inspector-section template-editor__publish-settings-section">
            <div className="homepage-editor__inspector-section-head">
              <strong>发布设置</strong>
              <span>版本记录与模板适用范围</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              <TextField label="版本说明" value={dynamicDraft.versionNote} maxLength={500} rows={3} showCount placeholder="说明本次结构、响应式或槽位变化；发布时随版本保存。" onChange={setDynamicVersionNote} />
              <div className="template-editor__geometry-grid">
                <div data-template-inspector-field="metadata.mobileBreakpoint"><NumberField label="小屏布局切换宽度" unit="像素" min={480} max={1024} value={definition.metadata.mobileBreakpoint ?? 767} onChange={(mobileBreakpoint) => updateDefinition((next) => { next.metadata.mobileBreakpoint = mobileBreakpoint; })} /></div>
                <div data-template-inspector-field="metadata.minViewportWidth"><NumberField label="最小适用宽度" unit="像素" min={280} max={3840} value={definition.metadata.minViewportWidth ?? 320} onChange={(minViewportWidth) => updateDefinition((next) => { next.metadata.minViewportWidth = minViewportWidth; })} /></div>
                <div data-template-inspector-field="metadata.maxViewportWidth"><NumberField label="最大适用宽度" unit="像素" min={280} max={3840} value={definition.metadata.maxViewportWidth ?? 1920} onChange={(maxViewportWidth) => updateDefinition((next) => { next.metadata.maxViewportWidth = maxViewportWidth; })} /></div>
              </div>
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
  const simpleSlot = !selectedRoleObject && SIMPLE_SLOT_TYPES.has(node.type) && !rules.placement && ["auto", "fixed", "aspect-ratio"].includes(rules.height.mode);
  return (
    <aside
      className="homepage-editor__inspector template-editor__inspector"
      aria-label="模板属性"
      data-template-inspector-view="context"
      data-template-inspector-object={isRoot ? "root" : selectedRoleObject?.kind ?? registrySlotType ?? "node"}
      data-template-inspector-object-id={activeNodeId}
      data-template-inspector-device={device}
      data-template-inspector-role={selectedRoleObject ? "true" : "false"}
    >
      <header className="homepage-editor__inspector-header">
        <span className={`template-editor__inspector-object-icon${selectedRoleObject ? ` is-${selectedRoleObject.kind}` : ""}`} aria-hidden="true">
          {selectedRoleObject ? <ContractRoleIcon kind={selectedRoleObject.kind} /> : <ApartmentOutlined />}
        </span>
        <div className="homepage-editor__inspector-heading">
          <span className="homepage-editor__inspector-eyebrow">
            当前对象 · {selectedRoleKindLabel ?? (isRoot ? "模板容器" : "结构节点")}
          </span>
          <strong className="homepage-editor__inspector-title" title={inspectorTitle}>{inspectorTitle}</strong>
          <span className="template-editor__inspector-breadcrumb" title={inspectorBreadcrumb}>{inspectorBreadcrumb}</span>
        </div>
        {selectedRoleObject && !selectedRoleApplicable ? (
          <span className="homepage-editor__inspector-device is-inapplicable">当前画布不显示</span>
        ) : null}
      </header>
      {!isRoot && !simpleSlot && hasCapability("node.name") ? <div className="template-editor__pinned-name" data-template-inspector-field="node.name">
        <TextField label="节点名称" value={node.name} maxLength={TEMPLATE_NODE_NAME_MAX_LENGTH} readOnly={isLocked} onChange={(name) => updateDefinition((next) => { next.nodes[activeNodeId].name = name; })} />
      </div> : null}

      <div
        className="homepage-editor__inspector-scroll"
        role="region"
        aria-label="模板属性功能区"
      >
        {publishReview ? validationSection : null}
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
            message="定位说明"
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
        {isRoot ? <TextField label="模板名称" value={definition.name} maxLength={80} onChange={(name) => { if (name.trim()) updateDefinition((next) => { next.name = name; }, "修改模板名称"); }} /> : null}
        {simpleSlot ? <TemplateSlotControls definition={definition} nodeId={activeNodeId} device={device} onChange={updateDefinition} /> : null}
        <TemplateCompositionControls definition={definition} selectedId={activeNodeId} device={device} onChange={updateDefinition} />
        {!getTemplateComposition(definition, activeNodeId, device) && isLayoutContainer ? <TemplateContainerControls definition={definition} nodeId={activeNodeId} device={device} onChange={updateDefinition} /> : null}
        {simpleSlot || isRoot || (node.type === "Container" && !getTemplateComposition(definition, activeNodeId, device) && rules.layoutMode !== "free") ? null : getTemplateComposition(definition, activeNodeId, device) || isLayoutContainer ? (
          <section className="template-editor__settings-section">
            <h3>精确位置与尺寸 · 查看当前数值</h3>
            {renderInspectorPanel("layout", TEMPLATE_INSPECTOR_PANELS[inspectorContext].find((entry) => entry.panel === "layout")!.label)}
          </section>
        ) : renderInspectorPanel("layout", TEMPLATE_INSPECTOR_PANELS[inspectorContext].find((entry) => entry.panel === "layout")!.label)}
        {metadataDetailsOpen ? (
          <section ref={metadataDetailsRef} className="template-editor__settings-section">
            <h3>模板资料与使用限制 · {nodeIssues.filter((issue) => issue.level === "error").length} 项错误</h3>
            {renderInspectorPanel("definition", TEMPLATE_INSPECTOR_PANELS[inspectorContext].find((entry) => entry.panel === "definition")!.label)}
            {renderInspectorPanel("rules", TEMPLATE_INSPECTOR_PANELS[inspectorContext].find((entry) => entry.panel === "rules")!.label)}
          </section>
        ) : null}
        {!publishReview && displayedValidationIssues.length > 0 ? validationSection : null}
      </div>
    </aside>
  );
}
