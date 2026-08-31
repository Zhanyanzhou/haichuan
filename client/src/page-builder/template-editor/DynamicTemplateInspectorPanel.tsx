import { ApartmentOutlined } from "@ant-design/icons";
import { Button, Input, InputNumber, Select } from "antd";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import MediaPickerField from "../fields/MediaPickerField";
import NumberField from "../inspector/controls/NumberField";
import ImageFocusField from "../inspector/controls/ImageFocusField";
import SelectField from "../inspector/controls/SelectField";
import SwitchField from "../inspector/controls/SwitchField";
import TextField from "../inspector/controls/TextField";
import VideoContentFields from "../inspector/controls/VideoContentFields";
import DynamicComplexContentFields, { isDynamicComplexSlotType } from "../inspector/controls/DynamicComplexContentFields";
import {
  getDynamicTemplateNodeRegistryEntry,
  moveDynamicTemplateNode,
  validateDynamicTemplateDefinition,
  type TemplateDefinitionV2,
  type DynamicTemplateLength,
  type DynamicTemplateLengthUnit,
  type DynamicTemplateResponsiveRules,
  type DynamicTemplateSlotDefinition,
} from "../template-definition";
import {
  findDynamicTemplateParentId,
  getDynamicTemplateAllowedParentIds,
  parseCommaSeparatedValues,
} from "./dynamicTemplateEditorUtils";
import { useTemplateEditorSession } from "./templateEditorSession";
import {
  objectPositionToPercent,
  percentToObjectPosition,
} from "../template-definition/imagePosition";
import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import {
  isMatureContentTemplateSlotType,
  MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE,
} from "../template-definition/validateTemplateDefinition";

const LENGTH_UNIT_OPTIONS: Array<{ value: DynamicTemplateLengthUnit; label: string }> = [
  { value: "px", label: "像素" },
  { value: "%", label: "父容器比例" },
  { value: "rem", label: "基础字号倍数" },
  { value: "vw", label: "画布宽度比例" },
  { value: "vh", label: "画布高度比例" },
];

type TemplateInspectorPanel = "content" | "layout" | "advanced";

function TemplateInspectorTabs({
  activePanel,
  onChange,
}: {
  activePanel: TemplateInspectorPanel;
  onChange: (panel: TemplateInspectorPanel) => void;
}) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabs: Array<{ panel: TemplateInspectorPanel; label: string }> = [
    { panel: "content", label: "内容" },
    { panel: "layout", label: "布局" },
    { panel: "advanced", label: "高级" },
  ];
  return (
    <nav className="homepage-editor__panel-mode-tabs template-editor__inspector-tabs" aria-label="模板属性分类">
      <div role="tablist" aria-label="模板属性分类">
        {tabs.map(({ panel, label }, index) => (
          <button
            key={panel}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={activePanel === panel}
            aria-controls={`template-inspector-panel-${panel}`}
            tabIndex={activePanel === panel ? 0 : -1}
            className={activePanel === panel ? "is-active" : ""}
            onClick={() => onChange(panel)}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              const lastIndex = tabs.length - 1;
              let nextIndex: number | undefined;
              if (event.key === "ArrowRight") nextIndex = index === lastIndex ? 0 : index + 1;
              if (event.key === "ArrowLeft") nextIndex = index === 0 ? lastIndex : index - 1;
              if (event.key === "Home") nextIndex = 0;
              if (event.key === "End") nextIndex = lastIndex;
              if (nextIndex === undefined) return;
              event.preventDefault();
              onChange(tabs[nextIndex].panel);
              buttonRefs.current[nextIndex]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function LengthField({
  value,
  onChange,
  placeholder,
}: {
  value?: DynamicTemplateLength;
  onChange: (value: DynamicTemplateLength | undefined) => void;
  placeholder?: string;
}) {
  return (
    <div className="template-editor__length-field">
      <InputNumber
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
        aria-label="尺寸单位"
      />
    </div>
  );
}

function parseDefaultContent(slot: DynamicTemplateSlotDefinition, value: string): unknown {
  if (slot.type === "button" || slot.type === "link") return { label: value };
  if (slot.type === "collection") return parseCommaSeparatedValues(value);
  if (slot.type === "image") return value ? { src: value, alt: slot.label } : "";
  return value;
}

function stringifyDefaultContent(slot: DynamicTemplateSlotDefinition, value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join("，");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (slot.type === "image" && typeof record.src === "string") return record.src;
    if ((slot.type === "button" || slot.type === "link") && typeof record.label === "string") return record.label;
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readTemplateContent(
  definition: TemplateDefinitionV2,
  slotId: string,
  layer: "default" | "preview",
): unknown {
  if (layer === "default") return definition.defaultContent[slotId];
  return Object.prototype.hasOwnProperty.call(definition.previewContent ?? {}, slotId)
    ? definition.previewContent?.[slotId]
    : definition.defaultContent[slotId];
}

export default function DynamicTemplateInspectorPanel() {
  const draft = useTemplateEditorSession((state) => state.draft);
  const device = useTemplateEditorSession((state) => state.device);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  const selectedContractRole = useTemplateEditorSession((state) => state.selectedContractRole);
  const setDynamicDefinition = useTemplateEditorSession((state) => state.setDynamicDefinition);
  const setDynamicVersionNote = useTemplateEditorSession((state) => state.setDynamicVersionNote);
  const selectObject = useTemplateEditorSession((state) => state.selectObject);
  const [activePanel, setActivePanel] = useState<TemplateInspectorPanel>("content");
  useEffect(() => {
    setActivePanel("content");
  }, [selectedNodeId]);
  const dynamicDraft = draft;
  const validation = useMemo(
    () => dynamicDraft ? validateDynamicTemplateDefinition(dynamicDraft.definition) : null,
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
  const selectedRoleObject = selectedContractRole?.nodeId === activeNodeId
    && slot
    && isMatureContentTemplateSlotType(slot.type)
    ? getContentTemplateContract(MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE[slot.type])
      ?.editorCapabilities.editableObjects.find((object) => object.roleId === selectedContractRole.roleId)
    : undefined;
  const rules = node.responsive[device];
  const registry = getDynamicTemplateNodeRegistryEntry(node.type);
  const registrySlotType = registry.kind === "slot" ? registry.slotType : undefined;
  const isImageSlot = registrySlotType === "image";
  const isVideoSlot = registrySlotType === "video";
  const complexSlotType = registrySlotType && isDynamicComplexSlotType(registrySlotType)
    ? registrySlotType
    : null;
  const isComplexSlot = complexSlotType !== null;
  const supportsTypography = Boolean(slot && !isImageSlot && !isVideoSlot && !isComplexSlot);
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

  const updateDefinition = (mutate: (next: TemplateDefinitionV2) => void) => {
    const next = structuredClone(definition);
    mutate(next);
    setDynamicDefinition(next);
  };
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
  const nodeIssues = validation.issues.filter((issue) => (
    issue.nodeId === activeNodeId || (node.slotId && issue.slotId === node.slotId)
  ));

  return (
    <aside className="homepage-editor__inspector template-editor__inspector" aria-label="模板属性">
      <header className="homepage-editor__inspector-header">
        <span className="homepage-editor__inspector-eyebrow">
          <ApartmentOutlined /> 模板属性
        </span>
        <strong className="homepage-editor__inspector-title">{isRoot ? definition.name : selectedRoleObject ? selectedRoleObject.roleId : node.name}</strong>
        <span className="homepage-editor__inspector-device">
          {device === "desktop" ? "桌面端几何规则" : "移动端几何规则"}
        </span>
      </header>

      <TemplateInspectorTabs activePanel={activePanel} onChange={setActivePanel} />

      <div
        id={`template-inspector-panel-${activePanel}`}
        className="homepage-editor__inspector-scroll"
        role="tabpanel"
      >
        {isRoot && (activePanel === "content" || activePanel === "advanced") ? (
          <section className="homepage-editor__inspector-section">
            <div className="homepage-editor__inspector-section-head">
              <strong>{activePanel === "content" ? "模板信息" : "更多设置"}</strong>
              <span>{activePanel === "content" ? "名称、比例与视觉职责" : "版本、适用范围与稳定标识"}</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              {activePanel === "content" ? <>
              <TextField label="模板名称" value={definition.name} maxLength={100} onChange={(name) => updateDefinition((next) => { next.name = name; })} />
              <div className="template-editor__geometry-grid">
                <TextField label="分类" value={definition.metadata.category} maxLength={50} onChange={(category) => updateDefinition((next) => { next.metadata.category = category; })} />
                <TextField label="用途" value={definition.metadata.purpose} maxLength={100} onChange={(purpose) => updateDefinition((next) => { next.metadata.purpose = purpose; })} />
                <TextField label="桌面比例" value={definition.metadata.desktopRatio === "auto" ? "" : definition.metadata.desktopRatio} placeholder="16:9" onChange={(desktopRatio) => updateDefinition((next) => { next.metadata.desktopRatio = desktopRatio || "auto"; })} />
                <TextField label="移动比例" value={definition.metadata.mobileRatio === "auto" ? "" : definition.metadata.mobileRatio} placeholder="3:4" onChange={(mobileRatio) => updateDefinition((next) => { next.metadata.mobileRatio = mobileRatio || "auto"; })} />
              </div>
              <SelectField label="默认背景" value={definition.metadata.defaultBackgroundToken ?? "surface"} options={[
                { value: "surface", label: "白色表面" },
                { value: "surface-muted", label: "柔灰表面" },
                { value: "brand-ink", label: "品牌深色" },
                { value: "brand-soft", label: "品牌浅色" },
              ]} onChange={(defaultBackgroundToken) => updateDefinition((next) => { next.metadata.defaultBackgroundToken = defaultBackgroundToken; })} />
              <SelectField label="页面视觉职责" value={definition.metadata.visualRole ?? "support-stage"} options={[
                { value: "primary-stage", label: "首屏主舞台" },
                { value: "feature-stage", label: "重点内容区" },
                { value: "support-stage", label: "辅助内容区" },
              ]} onChange={(visualRole) => updateDefinition((next) => {
                if (visualRole === "primary-stage" || visualRole === "feature-stage" || visualRole === "support-stage") next.metadata.visualRole = visualRole;
              })} />
              <div className="homepage-editor__inspector-field">
                <label>新页面实例默认内容</label>
                <Button onClick={() => {
                  if (!window.confirm("将当前全部预览样例复制为新页面实例的默认内容？既有页面不会改变。")) return;
                  updateDefinition((next) => {
                    next.defaultContent = {
                      ...next.defaultContent,
                      ...structuredClone(next.previewContent ?? {}),
                    };
                  });
                }}>将全部样例设为默认</Button>
                <span className="homepage-editor__inspector-hint">只有执行此操作，预览样例才会进入以后新建的页面实例。</span>
              </div>
              </> : <>
              <TextField label="构图类型" value={definition.metadata.layoutType} maxLength={100} onChange={(layoutType) => updateDefinition((next) => { next.metadata.layoutType = layoutType; })} />
              <TextField label="描述" value={definition.description ?? ""} maxLength={500} rows={3} onChange={(description) => updateDefinition((next) => { next.description = description; })} />
              <div className="template-editor__geometry-grid">
                <NumberField label="桌面预览宽度" unit="像素" min={768} max={2560} value={definition.metadata.previewDesktopWidth ?? RESPONSIVE_CANVAS.desktop.width} onChange={(previewDesktopWidth) => updateDefinition((next) => { next.metadata.previewDesktopWidth = previewDesktopWidth; })} />
                <NumberField label="移动预览宽度" unit="像素" min={280} max={767} value={definition.metadata.previewMobileWidth ?? RESPONSIVE_CANVAS.mobile.width} onChange={(previewMobileWidth) => updateDefinition((next) => { next.metadata.previewMobileWidth = previewMobileWidth; })} />
                <NumberField label="移动布局切换宽度" unit="像素" min={480} max={1024} value={definition.metadata.mobileBreakpoint ?? 767} onChange={(mobileBreakpoint) => updateDefinition((next) => { next.metadata.mobileBreakpoint = mobileBreakpoint; })} />
                <NumberField label="最小适用宽度" unit="像素" min={280} max={3840} value={definition.metadata.minViewportWidth ?? 320} onChange={(minViewportWidth) => updateDefinition((next) => { next.metadata.minViewportWidth = minViewportWidth; })} />
                <NumberField label="最大适用宽度" unit="像素" min={280} max={3840} value={definition.metadata.maxViewportWidth ?? 1920} onChange={(maxViewportWidth) => updateDefinition((next) => { next.metadata.maxViewportWidth = maxViewportWidth; })} />
              </div>
              <div className="homepage-editor__inspector-field">
                <label>导航兼容模式</label>
                <Select
                  mode="multiple"
                  value={definition.metadata.headerCompatibility ?? ["solid"]}
                  options={[
                    { value: "solid", label: "实色导航" },
                    { value: "overlay-light", label: "浅色覆盖导航" },
                  ]}
                  onChange={(headerCompatibility) => updateDefinition((next) => {
                    const modes = headerCompatibility.filter(
                      (mode): mode is "solid" | "overlay-light" =>
                        mode === "solid" || mode === "overlay-light",
                    );
                    next.metadata.headerCompatibility = modes.length > 0
                      ? modes
                      : ["solid"];
                  })}
                />
                <span className="homepage-editor__properties-hint">只有背景和首屏构图能保证浅色文字可读时，才启用浅色覆盖导航。</span>
              </div>
              <TextField label="版本说明" value={dynamicDraft.versionNote} maxLength={500} rows={3} showCount placeholder="说明本次结构、响应式或槽位变化；发布时随版本保存。" onChange={setDynamicVersionNote} />
              <div className="homepage-editor__inspector-field">
                <label htmlFor="dynamic-template-pages">推荐页面（不限制使用）</label>
                <Input id="dynamic-template-pages" key={definition.metadata.recommendedFor.join("|")} defaultValue={definition.metadata.recommendedFor.join("，")} onBlur={(event) => updateDefinition((next) => { next.metadata.recommendedFor = parseCommaSeparatedValues(event.target.value); })} />
                <span className="homepage-editor__inspector-hint">仅用于搜索与运营提示；所有已发布模板都可添加到任意装修页面。</span>
              </div>
              <div className="homepage-editor__inspector-field">
                <label htmlFor="dynamic-template-tags">标签</label>
                <Input id="dynamic-template-tags" key={definition.metadata.tags.join("|")} defaultValue={definition.metadata.tags.join("，")} onBlur={(event) => updateDefinition((next) => { next.metadata.tags = parseCommaSeparatedValues(event.target.value); })} />
                <span className="homepage-editor__inspector-hint">使用逗号分隔；离开输入框后应用。</span>
              </div>
              <div className="template-editor__read-only-field"><span>模板标识</span><strong>{definition.templateId}</strong></div>
              <div className="template-editor__read-only-field"><span>槽位摘要</span><strong>{definition.metadata.slotSummary}</strong></div>
              </>}
            </div>
          </section>
        ) : !isRoot && activePanel === "advanced" ? (
          <section className="homepage-editor__inspector-section">
            <div className="homepage-editor__inspector-section-head"><strong>节点身份</strong><span>{registry.label}</span></div>
            <div className="homepage-editor__inspector-section-body">
              <TextField label="节点名称" value={node.name} maxLength={100} onChange={(name) => updateDefinition((next) => { next.nodes[activeNodeId].name = name; })} />
              <SelectField
                label="父节点"
                value={parentId ?? ""}
                options={allowedParents.map((candidateId) => ({ value: candidateId, label: definition.nodes[candidateId].name }))}
                onChange={(nextParentId) => {
                  if (!nextParentId) return;
                  setDynamicDefinition(moveDynamicTemplateNode(definition, activeNodeId, nextParentId));
                  selectObject(activeNodeId);
                }}
              />
              <SwitchField label="隐藏节点" hint="影响两种设备，可撤销。" value={node.hidden} onChange={(hidden) => updateDefinition((next) => { next.nodes[activeNodeId].hidden = hidden; })} />
              <div className="template-editor__read-only-field"><span>节点类型</span><strong>{registry.label}</strong></div>
              <div className="template-editor__read-only-field"><span>节点标识（发布后不可变）</span><strong>{node.nodeId}</strong></div>
            </div>
          </section>
        ) : null}

        {activePanel === "layout" ? <section className="homepage-editor__inspector-section">
          <div className="homepage-editor__inspector-section-head"><strong>{device === "desktop" ? "桌面端" : "移动端"}布局</strong><span>只改当前设备的几何规则</span></div>
          <div className="homepage-editor__inspector-section-body">
            {node.type === "Stack" ? (
              <div className="homepage-editor__inspector-field">
                <label>Stack 布局模式</label>
                <div className="template-editor__canvas-layer-switch" role="group" aria-label="Stack 布局模式">
                  <button type="button" className={rules.layoutMode !== "free" ? "is-active" : ""} aria-pressed={rules.layoutMode !== "free"} onClick={() => setStackLayoutMode("flow")}>顺序布局</button>
                  <button type="button" className={rules.layoutMode === "free" ? "is-active" : ""} aria-pressed={rules.layoutMode === "free"} onClick={() => setStackLayoutMode("free")}>自由叠放</button>
                </div>
                <span className="homepage-editor__inspector-hint">自由叠放只影响当前设备；切换时会按画布当前几何锁定子层。</span>
              </div>
            ) : null}
            {rules.placement ? (
              <div className="template-editor__geometry-grid">
                <NumberField label="横向位置" unit="%" min={0} max={100} value={Math.round(rules.placement.x * 100)} onChange={(value) => updateRules((next) => { if (next.placement) next.placement.x = Math.min(value / 100, 1 - next.placement.width); })} />
                <NumberField label="纵向位置" unit="%" min={0} max={100} value={Math.round(rules.placement.y * 100)} onChange={(value) => updateRules((next) => { if (next.placement) next.placement.y = Math.min(value / 100, 1 - next.placement.height); })} />
                <NumberField label="宽度" unit="%" min={2} max={100} value={Math.round(rules.placement.width * 100)} onChange={(value) => updateRules((next) => { if (next.placement) next.placement.width = Math.min(value / 100, 1 - next.placement.x); })} />
                <NumberField label="高度" unit="%" min={2} max={100} value={Math.round(rules.placement.height * 100)} onChange={(value) => updateRules((next) => { if (next.placement) next.placement.height = Math.min(value / 100, 1 - next.placement.y); })} />
                <NumberField label="图层" min={-10} max={10} value={rules.placement.zIndex} onChange={(value) => updateRules((next) => { if (next.placement) next.placement.zIndex = value; })} />
              </div>
            ) : null}
            <div className="template-editor__geometry-grid">
              <SelectField label="布局方式" value={rules.display} options={[
                { value: "block", label: "自然排列" },
                { value: "flex", label: "横向或纵向排列" },
                { value: "grid", label: "网格排列" },
                { value: "none", label: "当前设备隐藏" },
              ]} onChange={(display) => updateRules((next) => {
                if (display === "block" || display === "flex" || display === "grid" || display === "none") next.display = display;
              })} />
              {rules.display === "flex" ? <SelectField label="排列方向" value={rules.direction ?? "row"} options={[{ value: "row", label: "横向" }, { value: "column", label: "纵向" }]} onChange={(direction) => updateRules((next) => { if (direction === "row" || direction === "column") next.direction = direction; })} /> : null}
              <SelectField label="宽度策略" value={typeof rules.width === "string" ? rules.width : "custom"} options={[{ value: "fill", label: "填满可用空间" }, { value: "auto", label: "自动" }, { value: "fit", label: "适应内容" }, { value: "custom", label: "自定义宽度" }]} onChange={(width) => updateRules((next) => {
                if (width === "custom") next.width = { value: 100, unit: "%" };
                else if (width === "fill" || width === "auto" || width === "fit") next.width = width;
              })} />
              <NumberField label="排列顺序" hint="数值越小越靠前" min={-100} max={100} value={rules.order} onChange={(order) => updateRules((next) => { next.order = order; })} />
              <SelectField label="交叉方向对齐" value={rules.alignItems ?? ""} allowEmpty options={[
                { value: "start", label: "靠前" }, { value: "center", label: "居中" }, { value: "end", label: "靠后" }, { value: "stretch", label: "拉伸填满" },
              ]} onChange={(alignItems) => updateRules((next) => {
                next.alignItems = alignItems === "start" || alignItems === "center" || alignItems === "end" || alignItems === "stretch" ? alignItems : undefined;
              })} />
              <SelectField label="主要方向对齐" value={rules.justifyContent ?? ""} allowEmpty options={[
                { value: "start", label: "靠前" }, { value: "center", label: "居中" }, { value: "end", label: "靠后" }, { value: "space-between", label: "两端对齐" }, { value: "space-around", label: "均匀留白" },
              ]} onChange={(justifyContent) => updateRules((next) => {
                next.justifyContent = justifyContent === "start" || justifyContent === "center" || justifyContent === "end" || justifyContent === "space-between" || justifyContent === "space-around" ? justifyContent : undefined;
              })} />
            </div>
            {typeof rules.width !== "string" ? <div className="homepage-editor__inspector-field"><label>自定义宽度</label><LengthField value={rules.width} onChange={(value) => updateRules((next) => { next.width = value ?? "auto"; })} /></div> : null}
            <SelectField label="高度策略" value={rules.height.mode} options={[
              { value: "auto", label: "随内容自动增长" },
              { value: "min-height", label: "至少达到指定高度" },
              { value: "aspect-ratio", label: "保持宽高比例" },
              { value: "fixed", label: "固定高度" },
              { value: "viewport", label: "按屏幕高度" },
            ]} onChange={(mode) => updateRules((next) => {
              if (mode === "aspect-ratio") next.height = { mode, ratio: { width: 16, height: 9 } };
              else if (mode === "auto") next.height = { mode };
              else if (mode === "min-height" || mode === "fixed" || mode === "viewport") next.height = { mode, value: { value: mode === "viewport" ? 60 : 480, unit: mode === "viewport" ? "vh" : "px" } };
            })} />
            {rules.height.mode === "aspect-ratio" ? (
              <div className="template-editor__geometry-grid">
                <NumberField label="比例宽" min={1} max={1000} value={rules.height.ratio?.width} onChange={(value) => updateRules((next) => { next.height.ratio = { width: value, height: next.height.ratio?.height ?? 9 }; })} />
                <NumberField label="比例高" min={1} max={1000} value={rules.height.ratio?.height} onChange={(value) => updateRules((next) => { next.height.ratio = { width: next.height.ratio?.width ?? 16, height: value }; })} />
              </div>
            ) : rules.height.mode !== "auto" ? <div className="homepage-editor__inspector-field"><label>高度数值</label><LengthField value={rules.height.value} onChange={(value) => updateRules((next) => { if (value) next.height.value = value; else delete next.height.value; })} /></div> : null}
            <div className="template-editor__geometry-grid">
              <div className="homepage-editor__inspector-field"><label>间距</label><LengthField value={rules.gap} onChange={(value) => updateRules((next) => { next.gap = value; })} /></div>
              <div className="homepage-editor__inspector-field"><label>最大宽度</label><LengthField value={rules.maxWidth} onChange={(value) => updateRules((next) => { next.maxWidth = value; })} /></div>
              <div className="homepage-editor__inspector-field"><label>最小高度</label><LengthField value={rules.minHeight} onChange={(value) => updateRules((next) => { next.minHeight = value; })} /></div>
              <div className="homepage-editor__inspector-field"><label>圆角</label><LengthField value={rules.radius} onChange={(value) => updateRules((next) => { next.radius = value; })} /></div>
            </div>
            <div className="homepage-editor__inspector-field"><label>统一内边距</label><LengthField value={rules.padding?.top} onChange={(value) => updateRules((next) => { next.padding = value ? { top: value, right: value, bottom: value, left: value } : undefined; })} /></div>
            <div className="homepage-editor__inspector-field"><label>统一外边距</label><LengthField value={rules.margin?.top} onChange={(value) => updateRules((next) => { next.margin = value ? { top: value, right: value, bottom: value, left: value } : undefined; })} /></div>
            {rules.display === "grid" ? <div className="homepage-editor__inspector-field"><label htmlFor="dynamic-grid-columns">网格比例</label><Input id="dynamic-grid-columns" key={`${activeNodeId}-${device}-${rules.columns?.join("-")}`} defaultValue={rules.columns?.join("，") ?? "1，1"} onBlur={(event) => {
              const columns = parseCommaSeparatedValues(event.target.value).map(Number).filter((value) => Number.isFinite(value) && value > 0);
              if (columns.length) updateRules((next) => { next.columns = columns; });
            }} /></div> : null}
            <div className="template-editor__geometry-grid">
              <SelectField label="背景样式" value={rules.backgroundToken ?? ""} allowEmpty emptyLabel="透明" options={[
                { value: "surface", label: "白色表面" }, { value: "surface-muted", label: "柔灰表面" }, { value: "brand-ink", label: "品牌深色" }, { value: "brand-soft", label: "品牌浅色" },
              ]} onChange={(backgroundToken) => updateRules((next) => { next.backgroundToken = backgroundToken || undefined; })} />
              <SelectField label="边框样式" value={rules.borderToken ?? ""} allowEmpty emptyLabel="无边框" options={[
                { value: "subtle", label: "轻边界" }, { value: "strong", label: "强调边界" }, { value: "accent", label: "品牌强调边界" },
              ]} onChange={(borderToken) => updateRules((next) => { next.borderToken = borderToken || undefined; })} />
            </div>
            <SelectField label="超出边界时" value={rules.overflow ?? ""} allowEmpty options={[
              { value: "visible", label: "继续显示" }, { value: "hidden", label: "隐藏超出内容" }, { value: "clip", label: "按边界裁切" },
            ]} onChange={(overflow) => updateRules((next) => {
              next.overflow = overflow === "visible" || overflow === "hidden" || overflow === "clip" ? overflow : undefined;
            })} />
          </div>
        </section> : null}

        {!isRoot && !slot && activePanel === "content" ? (
          <section className="homepage-editor__inspector-section">
            <div className="homepage-editor__inspector-section-head"><strong>结构节点</strong><span>{registry.label}</span></div>
            <div className="homepage-editor__inspector-section-body">
              <p className="template-editor__panel-empty-copy">当前节点只负责模板结构，没有可编辑内容。请切换到“布局”调整几何规则，或到“高级”修改节点身份。</p>
            </div>
          </section>
        ) : null}

        {selectedRoleObject && activePanel === "content" ? (
          <section className="homepage-editor__inspector-section">
            <div className="homepage-editor__inspector-section-head">
              <strong>组件内部对象</strong>
              <span>{selectedRoleObject.kind}</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              <div className="template-editor__read-only-field"><span>角色</span><strong>{selectedRoleObject.roleId}</strong></div>
              <div className="template-editor__read-only-field"><span>可编辑能力</span><strong>{selectedRoleObject.capabilities.join(" · ")}</strong></div>
              <p className="template-editor__structure-note">下方字段继续写回当前 V2 节点的预览内容与构图属性，不创建第二份模板数据。</p>
            </div>
          </section>
        ) : null}

        {slot ? (
          <section className="homepage-editor__inspector-section">
            <div className="homepage-editor__inspector-section-head">
              <strong>{activePanel === "content" ? "模板内容" : activePanel === "layout" ? `${device === "desktop" ? "桌面端" : "移动端"}内容样式` : "槽位与页面权限"}</strong>
              <span>{registry.label} · 内容在桌面和移动端共享</span>
            </div>
            <div className="homepage-editor__inspector-section-body">
              {activePanel === "advanced" ? <>
              <div className="template-editor__geometry-grid">
                <TextField label="槽位名称" value={slot.label} maxLength={100} onChange={(label) => updateSlot((next) => { next.label = label; })} />
                <TextField label="内容字段标识" value={slot.key} maxLength={64} hint="用于版本映射，发布后保持稳定" onChange={(key) => updateSlot((next) => { next.key = key; })} />
              </div>
              <div className="template-editor__geometry-grid">
                <SwitchField label="必填内容" value={slot.required} onChange={(required) => updateSlot((next) => { next.required = required; })} />
                <SwitchField label="页面可修改" value={slot.editable} onChange={(editable) => updateSlot((next) => { next.editable = editable; })} />
                <SwitchField label="页面可隐藏" value={slot.hideable} onChange={(hideable) => updateSlot((next) => { next.hideable = hideable; })} />
                <SelectField label="页面显式清空后" value={slot.emptyPolicy ?? "hide"} options={[
                  { value: "hide", label: "公开页隐藏该槽位" },
                  { value: "use-default", label: "回退母模板默认内容" },
                ]} onChange={(emptyPolicy) => updateSlot((next) => {
                  next.emptyPolicy = emptyPolicy === "use-default" ? "use-default" : "hide";
                })} />
              </div>
              <div className="homepage-editor__inspector-section-head"><strong>页面实例可调整范围</strong><span>只授权运营所需能力；页面不能改变节点树</span></div>
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
              {activePanel === "content" ? <>
              <div className="homepage-editor__inspector-section-head">
                <strong>内容用途</strong>
                <span>画布始终编辑预览样例</span>
              </div>
              <div className="template-editor__geometry-grid">
                <div className="homepage-editor__inspector-field">
                  <label>新实例默认</label>
                  <Button size="small" onClick={() => updateDefinition((next) => {
                    next.defaultContent[slot.slotId] = structuredClone(readTemplateContent(next, slot.slotId, "preview"));
                  })}>设为新实例默认</Button>
                </div>
                {Object.prototype.hasOwnProperty.call(definition.previewContent ?? {}, slot.slotId) ? (
                  <div className="homepage-editor__inspector-field">
                    <label>预览覆盖</label>
                    <Button type="link" size="small" onClick={() => updateDefinition((next) => {
                      if (!next.previewContent) return;
                      delete next.previewContent[slot.slotId];
                      if (Object.keys(next.previewContent).length === 0) delete next.previewContent;
                    })}>恢复继承页面初始内容</Button>
                  </div>
                ) : null}
              </div>
              {isVideoSlot ? (
                <VideoContentFields
                  scope="template"
                  required={slot.required}
                  value={asRecord(readTemplateContent(definition, slot.slotId, "preview"))}
                  onChange={(value) => updateDefinition((next) => {
                    next.previewContent ??= {}; next.previewContent[slot.slotId] = value;
                  })}
                  designValue={node.props.contentTemplateDesignProps}
                  onDesignChange={(value) => updateDefinition((next) => {
                    next.nodes[activeNodeId].props.contentTemplateDesignProps = value;
                  })}
                />
              ) : complexSlotType ? (
                <DynamicComplexContentFields
                  scope="template"
                  device={device}
                  slotType={complexSlotType}
                  value={asRecord(readTemplateContent(definition, slot.slotId, "preview"))}
                  onChange={(value) => updateDefinition((next) => {
                    next.previewContent ??= {}; next.previewContent[slot.slotId] = value;
                  })}
                  designValue={node.props.contentTemplateDesignProps}
                  onDesignChange={(value) => updateDefinition((next) => {
                    next.nodes[activeNodeId].props.contentTemplateDesignProps = value;
                  })}
                />
              ) : isImageSlot ? (
                <div className="homepage-editor__inspector-field">
                  <label>中性示例图片</label>
                  <MediaPickerField
                    fieldKey="dynamic-slot-default-content"
                    device="shared"
                    value={stringifyDefaultContent(slot, readTemplateContent(definition, slot.slotId, "preview"))}
                    required={slot.required}
                    placeholder="上传中性示例图或填写图片链接"
                    spec={slot.validation.recommendedWidth && slot.validation.recommendedHeight ? {
                      width: slot.validation.recommendedWidth,
                      height: slot.validation.recommendedHeight,
                      ratio: `${slot.validation.recommendedWidth}:${slot.validation.recommendedHeight}`,
                      label: `${slot.validation.recommendedWidth}×${slot.validation.recommendedHeight}`,
                    } : undefined}
                    onChange={(value) => updateDefinition((next) => {
                      const content = parseDefaultContent(slot, value);
                      next.previewContent ??= {}; next.previewContent[slot.slotId] = content;
                    })}
                  />
                  <span className="homepage-editor__inspector-hint">只作为模板预览占位；真实页面素材仍由页面实例提供。</span>
                </div>
              ) : (
                <TextField label="预览示例" value={stringifyDefaultContent(slot, readTemplateContent(definition, slot.slotId, "preview"))} rows={2} onChange={(value) => updateDefinition((next) => {
                  const content = parseDefaultContent(slot, value);
                  next.previewContent ??= {}; next.previewContent[slot.slotId] = content;
                })} />
              )}
              </> : null}
              {activePanel === "advanced" ? <>
              <div className="template-editor__geometry-grid">
                <NumberField label="建议图片宽" unit="像素" min={1} max={20000} value={slot.validation.recommendedWidth} onChange={(value) => updateSlot((next) => { next.validation.recommendedWidth = value; })} onClear={() => updateSlot((next) => { next.validation.recommendedWidth = undefined; })} />
                <NumberField label="建议图片高" unit="像素" min={1} max={20000} value={slot.validation.recommendedHeight} onChange={(value) => updateSlot((next) => { next.validation.recommendedHeight = value; })} onClear={() => updateSlot((next) => { next.validation.recommendedHeight = undefined; })} />
                <NumberField label="最大字数" min={1} max={100000} value={slot.validation.maxLength} onChange={(value) => updateSlot((next) => { next.validation.maxLength = value; })} onClear={() => updateSlot((next) => { next.validation.maxLength = undefined; })} />
                <NumberField label="最小字数" min={0} max={100000} value={slot.validation.minLength} onChange={(value) => updateSlot((next) => { next.validation.minLength = value; })} onClear={() => updateSlot((next) => { next.validation.minLength = undefined; })} />
              </div>
              <div className="template-editor__read-only-field"><span>槽位标识（发布后不可变）</span><strong>{slot.slotId}</strong></div>
              </> : null}
              {activePanel === "layout" ? <>
              <div className="homepage-editor__inspector-section-head"><strong>{device === "desktop" ? "桌面端" : "移动端"}槽位规则</strong><span>不复制内容</span></div>
              <div className="template-editor__geometry-grid">
                {isImageSlot ? <>
                  <TextField label="图片比例" value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).aspectRatio ?? ""} placeholder="例如 4:5" onChange={(aspectRatio) => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).aspectRatio = aspectRatio || undefined; })} />
                  <SelectField label="图片适配" value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).objectFit ?? ""} allowEmpty options={[
                    { value: "cover", label: "填满并裁切" }, { value: "contain", label: "完整显示" }, { value: "fill", label: "拉伸填满" },
                  ]} onChange={(objectFit) => updateSlot((next) => {
                    (device === "desktop" ? next.desktopRules : next.mobileRules).objectFit = objectFit === "cover" || objectFit === "contain" || objectFit === "fill" ? objectFit : undefined;
                  })} />
                  <ImageFocusField
                    label={`画面焦点 · ${device === "desktop" ? "桌面端" : "移动端"}`}
                    value={objectPositionToPercent(
                      (device === "desktop" ? slot.desktopRules : slot.mobileRules).objectPosition,
                    )}
                    allowPreciseInput={false}
                    onChange={(focus) => updateSlot((next) => {
                      (device === "desktop" ? next.desktopRules : next.mobileRules).objectPosition = percentToObjectPosition(focus);
                    })}
                  />
                </> : isVideoSlot || isComplexSlot ? (
                  <p className="template-editor__structure-note">组件比例、媒体焦点和交互规则由上方业务字段设置，并通过现有成熟业务组件渲染。</p>
                ) : <>
                  <SelectField label="文字层级" value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).fontRole ?? ""} allowEmpty options={[
                    { value: "display", label: "展示大标题" }, { value: "heading", label: "区块标题" }, { value: "body", label: "正文" }, { value: "caption", label: "辅助说明" }, { value: "action", label: "行动文字" },
                  ]} onChange={(fontRole) => updateSlot((next) => {
                    (device === "desktop" ? next.desktopRules : next.mobileRules).fontRole = fontRole === "display" || fontRole === "heading" || fontRole === "body" || fontRole === "caption" || fontRole === "action" ? fontRole : undefined;
                  })} />
                  <div className="homepage-editor__inspector-field"><label>字号</label><LengthField value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).fontSize} onChange={(fontSize) => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).fontSize = fontSize; })} /></div>
                  <NumberField label="字重" min={100} max={900} step={100} value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).fontWeight} onChange={(value) => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).fontWeight = value; })} onClear={() => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).fontWeight = undefined; })} />
                  <NumberField label="行高" min={0.8} max={3} step={0.1} value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).lineHeight} onChange={(value) => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).lineHeight = value; })} onClear={() => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).lineHeight = undefined; })} />
                  <NumberField label="最大行数" min={1} max={100} value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).maxLines} onChange={(value) => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).maxLines = value; })} onClear={() => updateSlot((next) => { (device === "desktop" ? next.desktopRules : next.mobileRules).maxLines = undefined; })} />
                  <SelectField label="文字对齐" value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).textAlign ?? ""} allowEmpty options={[{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }]} onChange={(textAlign) => updateSlot((next) => {
                    (device === "desktop" ? next.desktopRules : next.mobileRules).textAlign = textAlign === "left" || textAlign === "center" || textAlign === "right" ? textAlign : undefined;
                  })} />
                  <SelectField label="超长文字" value={(device === "desktop" ? slot.desktopRules : slot.mobileRules).overflow ?? ""} allowEmpty options={[{ value: "wrap", label: "自动换行" }, { value: "ellipsis", label: "超出省略" }, { value: "clip", label: "按边界裁切" }]} onChange={(overflow) => updateSlot((next) => {
                    (device === "desktop" ? next.desktopRules : next.mobileRules).overflow = overflow === "wrap" || overflow === "ellipsis" || overflow === "clip" ? overflow : undefined;
                  })} />
                </>}
              </div>
              </> : null}
            </div>
          </section>
        ) : null}

        {activePanel === "advanced" ? <section className="homepage-editor__inspector-section">
          <div className="homepage-editor__inspector-section-head"><strong>实时校验</strong><span>{validation.valid ? "可保存草稿" : "存在阻止保存的错误"}</span></div>
          <div className="homepage-editor__inspector-section-body template-editor__validation-list" role="status" aria-live="polite">
            {(nodeIssues.length ? nodeIssues : validation.issues).slice(0, 8).map((issue) => (
              <div key={`${issue.code}-${issue.path}`} className={`is-${issue.level}`}>
                <strong>{issue.level.toUpperCase()} · {issue.code}</strong>
                <span>{issue.message}</span>
              </div>
            ))}
            {validation.issues.length === 0 ? <p>当前模板定义通过结构与语义校验。</p> : null}
          </div>
        </section> : null}
      </div>
    </aside>
  );
}
