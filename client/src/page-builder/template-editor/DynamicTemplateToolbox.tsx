import { AlignLeftOutlined, BlockOutlined, FontSizeOutlined, LinkOutlined, PictureOutlined, PlusOutlined, ShoppingOutlined } from "@ant-design/icons";
import { App as AntdApp, Popover } from "antd";
import { useEffect, useRef, useState } from "react";
import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import {
  addDynamicTemplateLayoutGroup,
  addDynamicTemplateNode,
  getDynamicTemplateNodeAdapter,
  getDynamicTemplateNodeRegistryEntry,
  getContentTemplateModuleTypeForSlotType,
  getDynamicTemplateInsertionLandings,
  getDynamicTemplateLayoutGroupNodeType,
  getDynamicTemplateRegionInsertionLandings,
  getDynamicTemplateStructureLockOwnerId,
  type DynamicTemplateLayoutGroupKind,
  type DynamicTemplateNodeType,
  type DynamicTemplateStructureLanding,
  type TemplateDefinitionV2,
} from "../template-definition";
import { useTemplateEditorSession } from "./templateEditorSession";
import { addConfiguredTemplateRegion } from "./dynamicTemplateDraftRepository";
import TemplateLayoutStarterPicker from "./TemplateLayoutStarterPicker";
import { placeInsertedTemplateNode } from "./templateInsertionPlacement";

const PUBLIC_RENDERER_BUILTIN_SLOT_TYPES = new Set([
  "image", "heading", "text", "richText", "button", "link", "badge", "icon", "product", "collection",
]);

const COMPONENT_GROUPS = [
  { id: "basic", label: "基础内容" },
  { id: "media", label: "媒体展示" },
  { id: "commerce", label: "商品与集合" },
  { id: "business", label: "互动/业务组件" },
] as const;

type ComponentGroupId = typeof COMPONENT_GROUPS[number]["id"];

const COMPONENT_TOOL_CONFIG = [
  { type: "HeadingSlot", group: "basic", hint: "放置标题文字", keywords: "标题 heading", icon: <FontSizeOutlined /> },
  { type: "TextSlot", group: "basic", uiLabel: "正文槽位", hint: "放置一段文字", keywords: "正文 text", icon: <AlignLeftOutlined /> },
  { type: "RichTextSlot", group: "basic", hint: "放置富文本内容", keywords: "富文本 rich text", icon: <AlignLeftOutlined /> },
  { type: "ButtonSlot", group: "basic", hint: "放置跳转按钮", keywords: "按钮 action", icon: <LinkOutlined /> },
  { type: "LinkSlot", group: "basic", hint: "放置文字链接", keywords: "链接 link", icon: <LinkOutlined /> },
  { type: "BadgeSlot", group: "basic", hint: "放置小型徽标", keywords: "徽标 badge", icon: <FontSizeOutlined /> },
  { type: "IconSlot", group: "basic", hint: "放置图标内容", keywords: "图标 icon", icon: <PictureOutlined /> },
  { type: "ImageSlot", group: "media", hint: "放置一张图片", keywords: "图片 image", icon: <PictureOutlined /> },
  { type: "ProductSlot", group: "commerce", hint: "选择一件真实商品", keywords: "商品 product", icon: <ShoppingOutlined /> },
  { type: "CollectionSlot", group: "commerce", hint: "选择一组商品", keywords: "集合 collection", icon: <ShoppingOutlined /> },
] as const satisfies readonly {
  type: DynamicTemplateNodeType;
  group: ComponentGroupId;
  hint: string;
  keywords: string;
  icon: JSX.Element;
  uiLabel?: string;
}[];

const COMPONENT_TOOLS = COMPONENT_TOOL_CONFIG.flatMap((tool) => {
  const registry = getDynamicTemplateNodeRegistryEntry(tool.type);
  const rendererSupported = Boolean(
    registry.slotType
    && (PUBLIC_RENDERER_BUILTIN_SLOT_TYPES.has(registry.slotType) || getDynamicTemplateNodeAdapter(registry.slotType)),
  );
  return registry.kind === "slot" && !registry.rootOnly && rendererSupported
    ? [{ ...tool, label: "uiLabel" in tool ? tool.uiLabel : registry.label }]
    : [];
});

const LAYOUT_TOOLS: Array<{
  kind: DynamicTemplateLayoutGroupKind;
  label: string;
  hint: string;
}> = [
  { kind: "vertical", label: "上下排列", hint: "内容从上到下排列" },
  { kind: "horizontal", label: "左右排列", hint: "内容左右并排" },
  { kind: "columns", label: "分列", hint: "建立两列网格" },
  { kind: "empty", label: "空分组", hint: "建立空白布局组" },
];

const TYPOGRAPHY_SLOT_TYPES = new Set<DynamicTemplateNodeType>(["HeadingSlot", "TextSlot", "ButtonSlot"]);
type ComponentTool = typeof COMPONENT_TOOLS[number];
type PanelMode = "content" | "region";

interface InsertionCursor {
  sessionId: string;
  parentId: string;
  anchorNodeId: string;
}

function getComponentInsertionLandings(
  definition: TemplateDefinitionV2,
  anchorNodeId?: string | null,
) {
  const landings = new Map<string, DynamicTemplateStructureLanding>();
  for (const tool of COMPONENT_TOOLS) {
    for (const landing of getDynamicTemplateInsertionLandings(definition, tool.type, anchorNodeId)) {
      const current = landings.get(landing.landingId);
      if (!current || (current.disabledReason && !landing.disabledReason)) {
        landings.set(landing.landingId, landing);
      }
    }
  }
  return [...landings.values()];
}

function addConfiguredSlot(
  definition: TemplateDefinitionV2,
  parentId: string,
  tool: ComponentTool,
  index?: number,
) {
  const result = addDynamicTemplateNode(definition, parentId, tool.type, index);
  const next = structuredClone(result.definition);
  const slot = next.slots[result.slotId!];
  const count = Object.values(next.slots).filter((item) => item.type === slot.type).length;
  const label = `${tool.label}${count > 1 ? ` ${count}` : ""}`;
  next.nodes[result.nodeId].name = label;
  slot.label = label;
  if (TYPOGRAPHY_SLOT_TYPES.has(tool.type)) {
    slot.desktopRules.fontWeight = slot.mobileRules.fontWeight = tool.type === "HeadingSlot" ? 600 : 400;
    slot.desktopRules.fontSize = {
      value: tool.type === "HeadingSlot" ? 48 : tool.type === "TextSlot" ? 28 : 24,
      unit: "px",
    };
    slot.mobileRules.fontSize = { value: tool.type === "HeadingSlot" ? 28 : 16, unit: "px" };
  }
  if (tool.type === "TextSlot") {
    let keyIndex = 1;
    const keys = new Set(Object.values(next.slots)
      .filter((item) => item.slotId !== slot.slotId)
      .map((item) => item.key));
    while (keys.has(keyIndex === 1 ? "description" : `description${keyIndex}`)) keyIndex += 1;
    slot.key = keyIndex === 1 ? "description" : `description${keyIndex}`;
  }
  placeInsertedTemplateNode(next, parentId, result.nodeId);
  return { definition: next, nodeId: result.nodeId };
}

function selectAddedComponent(nodeId: string) {
  const session = useTemplateEditorSession.getState();
  const node = session.draft?.definition.nodes[nodeId];
  const slot = node?.slotId ? session.draft?.definition.slots[node.slotId] : undefined;
  const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
  const contract = moduleType ? getContentTemplateContract(moduleType) : undefined;
  const editableRole = contract?.editorCapabilities.editableObjects.find((object) => {
    const role = contract.roles.find((candidate) => candidate.id === object.roleId);
    return !role?.appliesTo?.length || role.appliesTo.includes(session.device);
  });
  if (editableRole) session.selectContractRole(nodeId, editableRole.roleId);
  else session.selectObject(nodeId);
}

export function DynamicTemplateNodePalette({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { message } = AntdApp.useApp();
  const regionTriggerRef = useRef<HTMLButtonElement>(null);
  const slotTriggerRef = useRef<HTMLButtonElement>(null);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cursorRef = useRef<InsertionCursor | null>(null);
  const draft = useTemplateEditorSession((state) => state.draft);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  const sessionId = useTemplateEditorSession((state) => state.sessionId);
  const [panelMode, setPanelMode] = useState<PanelMode>("content");
  const [contentAnchorNodeId, setContentAnchorNodeId] = useState<string | null>(null);
  const [contentLandingId, setContentLandingId] = useState("");
  const [componentSearch, setComponentSearch] = useState("");
  const [regionAnchorNodeId, setRegionAnchorNodeId] = useState<string | null>(null);
  const [regionLandingId, setRegionLandingId] = useState("");

  const closePanel = () => {
    onOpenChange(false);
    queueMicrotask(() => activeTriggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePanel();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  });

  if (!draft) return null;
  const definition = draft.definition;
  const compactViewport = typeof window !== "undefined" && window.innerWidth <= 480;
  const rootLocked = Boolean(getDynamicTemplateStructureLockOwnerId(definition, definition.rootNodeId));
  const selectedLockOwnerId = selectedNodeId
    ? getDynamicTemplateStructureLockOwnerId(definition, selectedNodeId)
    : null;
  const contentLandings = getComponentInsertionLandings(definition, contentAnchorNodeId);
  const targetLandings = contentLandings.filter((landing) => landing.placement === "end");
  const selectedContentLanding = contentLandings.find((landing) => landing.landingId === contentLandingId) ?? null;
  const selectedTargetValid = Boolean(selectedContentLanding && !selectedContentLanding.disabledReason);
  const placementLandings = selectedContentLanding
    ? contentLandings.filter((landing) => landing.parentId === selectedContentLanding.parentId)
    : [];
  const regionLandings = getDynamicTemplateRegionInsertionLandings(definition, regionAnchorNodeId);
  const selectedRegionLanding = regionLandings.find((landing) => landing.landingId === regionLandingId) ?? null;
  const normalizedComponentSearch = componentSearch.trim().toLocaleLowerCase("zh-CN");
  const visibleComponentTools = COMPONENT_TOOLS.filter((tool) => (
    !normalizedComponentSearch
    || `${tool.label} ${tool.hint} ${tool.keywords} ${tool.type}`.toLocaleLowerCase("zh-CN")
      .includes(normalizedComponentSearch)
  ));

  const runCommand = (
    label: string,
    transform: (current: TemplateDefinitionV2) => TemplateDefinitionV2,
    onSuccess: () => void,
  ) => {
    const result = useTemplateEditorSession.getState().executeCommand({
      type: "transform-definition",
      label,
      transform,
    });
    if (!result.ok) {
      message.error(result.message);
      return false;
    }
    if (!result.changed) return false;
    onSuccess();
    return true;
  };

  const resolveContentLanding = (
    current: TemplateDefinitionV2,
    childType: DynamicTemplateNodeType,
  ): DynamicTemplateStructureLanding | null => {
    const cursor = cursorRef.current;
    if (cursor
      && cursor.sessionId === useTemplateEditorSession.getState().sessionId
      && current.nodes[cursor.parentId]?.childIds.includes(cursor.anchorNodeId)) {
      const cursorLandingId = `${cursor.parentId}:${cursor.anchorNodeId}:after`;
      const cursorLanding = getDynamicTemplateInsertionLandings(current, childType, cursor.anchorNodeId)
        .find((landing) => landing.landingId === cursorLandingId && !landing.disabledReason);
      if (cursorLanding) return cursorLanding;
    }
    return getDynamicTemplateInsertionLandings(current, childType, contentAnchorNodeId)
      .find((landing) => landing.landingId === contentLandingId && !landing.disabledReason) ?? null;
  };

  const addRegion = (landing: DynamicTemplateStructureLanding) => {
    let addedNodeId = "";
    runCommand("添加内容区域", (current) => {
      const currentLanding = getDynamicTemplateRegionInsertionLandings(current, regionAnchorNodeId)
        .find((candidate) => candidate.landingId === landing.landingId && !candidate.disabledReason);
      if (!currentLanding) throw new Error("区域插入位置已经失效，请重新选择。");
      const result = addConfiguredTemplateRegion(current, currentLanding.parentId, currentLanding.index);
      const next = result.definition;
      placeInsertedTemplateNode(next, currentLanding.parentId, result.nodeId);
      addedNodeId = result.nodeId;
      return next;
    }, () => {
      useTemplateEditorSession.getState().selectObject(addedNodeId);
      closePanel();
    });
  };

  const openRegionPanel = () => {
    const current = useTemplateEditorSession.getState();
    if (!current.draft || rootLocked) return;
    activeTriggerRef.current = regionTriggerRef.current;
    const currentDefinition = current.draft.definition;
    const currentSelectedNodeId = current.selectedObjectId;
    const currentLandings = getDynamicTemplateRegionInsertionLandings(currentDefinition, currentSelectedNodeId);
    const endLanding = currentLandings.find((landing) => landing.placement === "end" && !landing.disabledReason);
    const rootChildren = currentDefinition.nodes[currentDefinition.rootNodeId].childIds;
    if (rootChildren.length === 0) {
      if (endLanding) addRegion(endLanding);
      return;
    }
    setRegionAnchorNodeId(currentSelectedNodeId);
    setRegionLandingId(endLanding?.landingId ?? "");
    setPanelMode("region");
    onOpenChange(true);
  };

  const confirmRegionAdd = () => {
    if (selectedRegionLanding && !selectedRegionLanding.disabledReason) addRegion(selectedRegionLanding);
  };

  const openContentPanel = () => {
    const current = useTemplateEditorSession.getState();
    if (!current.draft) return;
    const currentDefinition = current.draft.definition;
    const currentSelectedNodeId = current.selectedObjectId;
    const currentLandings = getComponentInsertionLandings(currentDefinition, currentSelectedNodeId);
    const legalTargetLandings = currentLandings.filter((landing) => landing.placement === "end" && !landing.disabledReason);
    const selectedAfterLanding = currentLandings.find((landing) => landing.placement === "after" && !landing.disabledReason);
    const selectedContainerLanding = currentLandings.find((landing) => (
      landing.placement === "end"
      && landing.parentId === currentSelectedNodeId
      && !landing.disabledReason
    ));
    const selectedIsRoot = currentSelectedNodeId === currentDefinition.rootNodeId;
    const requiresExplicitRootTarget = selectedIsRoot
      && currentDefinition.nodes[currentDefinition.rootNodeId].childIds.length > 1;
    const inferredLanding = requiresExplicitRootTarget
      ? null
      : selectedContainerLanding ?? selectedAfterLanding ?? (legalTargetLandings.length === 1 ? legalTargetLandings[0] : null);

    activeTriggerRef.current = slotTriggerRef.current;
    cursorRef.current = null;
    setContentAnchorNodeId(currentSelectedNodeId);
    setContentLandingId(inferredLanding?.landingId ?? "");
    setPanelMode("content");
    onOpenChange(true);
  };

  const addSlot = (tool: ComponentTool) => {
    if (!selectedTargetValid || !sessionId) return;
    let addedNodeId = "";
    let parentId = "";
    runCommand(`添加${tool.label}`, (current) => {
      const landing = resolveContentLanding(current, tool.type);
      if (!landing) throw new Error("添加目标或插入位置已经失效，请重新选择。");
      parentId = landing.parentId;
      const result = addConfiguredSlot(current, landing.parentId, tool, landing.index);
      addedNodeId = result.nodeId;
      return result.definition;
    }, () => {
      cursorRef.current = { sessionId, parentId, anchorNodeId: addedNodeId };
      setContentAnchorNodeId(addedNodeId);
      setContentLandingId(`${parentId}:${addedNodeId}:after`);
      selectAddedComponent(addedNodeId);
      message.success(`${tool.label}已添加到“${definition.nodes[parentId]?.name ?? "当前容器"}”`);
    });
  };

  const addLayout = (tool: typeof LAYOUT_TOOLS[number]) => {
    if (!selectedTargetValid || !sessionId) return;
    let addedNodeId = "";
    runCommand(`添加${tool.label}布局分组`, (current) => {
      const targetParentId = selectedContentLanding?.parentId;
      const targetParentType = targetParentId ? current.nodes[targetParentId]?.type : undefined;
      const landing = resolveContentLanding(
        current,
        getDynamicTemplateLayoutGroupNodeType(tool.kind, targetParentType),
      );
      if (!landing) throw new Error("当前添加目标不接受这种布局分组。");
      const result = addDynamicTemplateLayoutGroup(current, landing.parentId, tool.kind, landing.index);
      placeInsertedTemplateNode(result.definition, landing.parentId, result.nodeId);
      addedNodeId = result.nodeId;
      return result.definition;
    }, () => {
      cursorRef.current = null;
      setContentAnchorNodeId(null);
      setContentLandingId(`${addedNodeId}:end`);
      useTemplateEditorSession.getState().selectObject(addedNodeId);
    });
  };

  const getComponentUnavailableReason = (tool: ComponentTool) => {
    if (!selectedContentLanding) {
      return targetLandings.length
        ? "请先选择添加目标"
        : "先添加并选择可容纳内容的区域或布局容器";
    }
    const landing = getDynamicTemplateInsertionLandings(
      definition,
      tool.type,
      contentAnchorNodeId,
    ).find((candidate) => candidate.landingId === selectedContentLanding.landingId);
    if (landing) return landing.disabledReason;
    const parent = definition.nodes[selectedContentLanding.parentId];
    return parent
      ? `${tool.label}不能放入${getDynamicTemplateNodeRegistryEntry(parent.type).label}`
      : "添加目标已失效";
  };

  const regionPanel = <div className="template-editor__add-popover template-editor__simple-palette" role="dialog" aria-label="添加区域">
    <h3>添加区域</h3>
    <label className="template-editor__add-field">
      <span>插入位置</span>
      <select aria-label="区域插入位置" value={selectedRegionLanding?.placement ?? ""} onChange={(event) => {
        const nextLanding = regionLandings.find((landing) => landing.placement === event.target.value);
        setRegionLandingId(nextLanding?.landingId ?? "");
      }}>
        {regionLandings.map((landing) => (
          <option key={landing.landingId} value={landing.placement} disabled={Boolean(landing.disabledReason)}>
            {landing.placement === "before" ? "当前区域前" : landing.placement === "after" ? "当前区域后" : "模板末尾"}
            {landing.disabledReason ? `（${landing.disabledReason}）` : ""}
          </option>
        ))}
      </select>
    </label>
    <button type="button" className="template-editor__add-primary" disabled={!selectedRegionLanding || Boolean(selectedRegionLanding.disabledReason)} onClick={confirmRegionAdd}>确认添加区域</button>
  </div>;

  const contentPanel = <div className="template-editor__add-popover template-editor__simple-palette" role="dialog" aria-label="添加槽位">
    <h3>添加槽位</h3>
    <p className="template-editor__add-target-note">
      当前选择：{selectedNodeId ? definition.nodes[selectedNodeId]?.name ?? "未知对象" : "未选择"}
    </p>
    {selectedLockOwnerId && selectedLockOwnerId !== selectedNodeId ? (
      <p role="status">
        当前对象由上级“{definition.nodes[selectedLockOwnerId]?.name}”锁定。
        <button type="button" onClick={() => {
          useTemplateEditorSession.getState().selectObject(selectedLockOwnerId);
          closePanel();
        }}>定位并选择上级</button>
      </p>
    ) : null}
    {targetLandings.length ? <>
      <label className="template-editor__add-field">
        <span>添加到：</span>
        <select aria-label="添加目标" value={selectedContentLanding?.parentId ?? ""} onChange={(event) => {
          const nextLanding = contentLandings.find((landing) => (
            landing.parentId === event.target.value && landing.placement === "end"
          ));
          setContentAnchorNodeId(null);
          setContentLandingId(nextLanding?.landingId ?? "");
          cursorRef.current = null;
        }}>
          <option value="">请选择目标</option>
          {targetLandings.map((landing) => (
            <option key={landing.landingId} value={landing.parentId} disabled={Boolean(landing.disabledReason)}>
              {landing.parentPathLabel}{landing.disabledReason ? `（${landing.disabledReason}）` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="template-editor__add-field">
        <span>插入位置</span>
        <select aria-label="槽位插入位置" value={selectedContentLanding?.placement ?? ""} disabled={!selectedTargetValid} onChange={(event) => {
          const nextLanding = placementLandings.find((landing) => landing.placement === event.target.value);
          setContentLandingId(nextLanding?.landingId ?? "");
          cursorRef.current = null;
        }}>
          {placementLandings.map((landing) => (
            <option key={landing.landingId} value={landing.placement} disabled={Boolean(landing.disabledReason)}>
              {landing.placement === "before" ? "当前对象前" : landing.placement === "after" ? "当前对象后" : "容器末尾"}
              {landing.disabledReason ? `（${landing.disabledReason}）` : ""}
            </option>
          ))}
        </select>
      </label>
      {!selectedTargetValid ? <p role="status">请选择明确且可用的添加目标后再添加内容。</p> : <p className="template-editor__add-target-note">添加到：{selectedContentLanding?.parentPathLabel}</p>}
    </> : <p role="status">当前没有合法添加位置。请先添加区域，再选择可容纳内容的区域或布局容器。</p>}
    <TemplateLayoutStarterPicker
      parentId={selectedContentLanding?.parentId ?? ""}
      index={selectedContentLanding?.index}
      disabled={!selectedTargetValid}
      onAdded={(firstTargetId) => {
        cursorRef.current = null;
        setContentAnchorNodeId(null);
        setContentLandingId(`${firstTargetId}:end`);
      }}
    />
    <label className="template-editor__add-field">
      <span>搜索组件</span>
      <input
        type="search"
        aria-label="搜索可添加组件"
        placeholder="按名称或用途搜索"
        value={componentSearch}
        onChange={(event) => setComponentSearch(event.target.value)}
      />
    </label>
    {visibleComponentTools.length ? COMPONENT_GROUPS.map((group) => {
      const tools = visibleComponentTools.filter((tool) => tool.group === group.id);
      if (!tools.length) return null;
      return <section key={group.id} aria-label={`${group.label}组件`}>
        <h4>{group.label}</h4>
        <div className="template-editor__node-tools template-editor__node-tools--core" role="group" aria-label={group.label}>
          {tools.map((tool) => {
            const unavailableReason = getComponentUnavailableReason(tool);
            return <button
              key={tool.type}
              type="button"
              disabled={Boolean(unavailableReason)}
              aria-label={`添加${tool.label}`}
              title={unavailableReason ?? tool.hint}
              onClick={() => addSlot(tool)}
            >
              <span aria-hidden="true">{tool.icon}</span>
              <strong>{tool.label}</strong>
              <small>{unavailableReason ?? tool.hint}</small>
            </button>;
          })}
        </div>
      </section>;
    }) : <p role="status">没有匹配的可添加组件。</p>}
    <h4>布局分组</h4>
    <div className="template-editor__node-tools template-editor__node-tools--layout" role="region" aria-label="布局分组">
      {LAYOUT_TOOLS.map((tool) => {
        const targetParentType = selectedContentLanding
          ? definition.nodes[selectedContentLanding.parentId]?.type
          : undefined;
        const allowed = Boolean(selectedContentLanding && getDynamicTemplateInsertionLandings(
          definition,
          getDynamicTemplateLayoutGroupNodeType(tool.kind, targetParentType),
          contentAnchorNodeId,
        ).some((landing) => landing.landingId === selectedContentLanding.landingId && !landing.disabledReason));
        return <button key={tool.kind} type="button" disabled={!allowed} aria-label={`添加${tool.label}布局分组`} onClick={() => addLayout(tool)}>
          <BlockOutlined aria-hidden="true" /><strong>{tool.label}</strong><small>{tool.hint}</small>
        </button>;
      })}
    </div>
  </div>;

  return <Popover
    open={open}
    onOpenChange={(nextOpen) => { if (!nextOpen) closePanel(); }}
    placement={compactViewport ? "bottomLeft" : "rightBottom"}
    trigger={[]}
    overlayClassName="template-editor__add-popover-overlay"
    content={panelMode === "region" ? regionPanel : contentPanel}
  >
    <div className="template-editor__dynamic-node-palette" aria-label="模板结构工具">
      <button ref={regionTriggerRef} type="button" className="template-editor__add-trigger" aria-label="添加区域" aria-expanded={open && panelMode === "region"} data-template-inspector-field="structure.create.region" disabled={rootLocked} onClick={openRegionPanel}>
        <BlockOutlined /><span>添加区域</span>
      </button>
      <button ref={slotTriggerRef} type="button" className="template-editor__add-trigger" aria-label="添加槽位" aria-expanded={open && panelMode === "content"} onClick={openContentPanel}>
        <PlusOutlined /><span>添加槽位</span>
      </button>
    </div>
  </Popover>;
}
