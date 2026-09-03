import { App as AntdApp, Popover } from "antd";
import {
  AlignLeftOutlined,
  AppstoreOutlined,
  FontSizeOutlined,
  LinkOutlined,
  PictureOutlined,
  PlusOutlined,
  ShoppingOutlined,
} from "@ant-design/icons";
import { useEffect, useRef } from "react";
import {
  addDynamicTemplateNode,
  DYNAMIC_TEMPLATE_CONTENT_NODE_TYPES,
  DYNAMIC_TEMPLATE_STRUCTURE_NODE_TYPES,
  getDynamicTemplateNodeRegistryEntry,
  validateDynamicTemplateDefinition,
  type TemplateDefinitionV2,
  type DynamicTemplateNodeType,
} from "../template-definition";
import {
  findDynamicTemplateInsertionParentId,
  getDynamicTemplateRegionDisplayName,
} from "./dynamicTemplateEditorUtils";
import { useTemplateEditorSession } from "./templateEditorSession";

function getNodeToolIcon(type: DynamicTemplateNodeType) {
  switch (type) {
    case "ImageSlot":
      return <PictureOutlined />;
    case "HeadingSlot":
      return <FontSizeOutlined />;
    case "TextSlot":
      return <AlignLeftOutlined />;
    case "ProductSlot":
      return <ShoppingOutlined />;
    case "ButtonSlot":
      return <LinkOutlined />;
    default:
      return <AppstoreOutlined />;
  }
}

function createThreeImageComposition(definition: TemplateDefinitionV2) {
  const isBlankTemplate = definition.nodes[definition.rootNodeId]?.childIds.length === 0
    && Object.keys(definition.slots).length === 0;
  const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
  const grid = addDynamicTemplateNode(region.definition, region.nodeId, "Grid");
  const mainImage = addDynamicTemplateNode(grid.definition, grid.nodeId, "ImageSlot");
  const detailColumn = addDynamicTemplateNode(mainImage.definition, grid.nodeId, "Column");
  const detailImageOne = addDynamicTemplateNode(
    detailColumn.definition,
    detailColumn.nodeId,
    "ImageSlot",
  );
  const detailImageTwo = addDynamicTemplateNode(
    detailImageOne.definition,
    detailColumn.nodeId,
    "ImageSlot",
  );
  const nextDefinition = structuredClone(detailImageTwo.definition);
  const regionCount = nextDefinition.nodes[definition.rootNodeId].childIds.length;
  const regionNode = nextDefinition.nodes[region.nodeId];
  const gridNode = nextDefinition.nodes[grid.nodeId];
  const detailColumnNode = nextDefinition.nodes[detailColumn.nodeId];

  regionNode.name = `三图展示区域 ${String(regionCount).padStart(2, "0")}`;
  gridNode.name = "主图 + 双图布局";
  detailColumnNode.name = "双图区域";
  gridNode.responsive.desktop = {
    ...gridNode.responsive.desktop,
    display: "grid",
    columns: [2, 1],
    gap: { value: 20, unit: "px" },
    alignItems: "center",
  };
  gridNode.responsive.mobile = {
    ...gridNode.responsive.mobile,
    display: "flex",
    direction: "column",
    gap: { value: 8, unit: "px" },
  };
  delete gridNode.responsive.mobile.columns;
  detailColumnNode.responsive.desktop = {
    ...detailColumnNode.responsive.desktop,
    display: "flex",
    direction: "column",
    gap: { value: 20, unit: "px" },
  };
  detailColumnNode.responsive.mobile = {
    ...detailColumnNode.responsive.mobile,
    display: "grid",
    columns: [1, 1],
    gap: { value: 8, unit: "px" },
  };
  delete detailColumnNode.responsive.mobile.direction;

  const imageSlots = [
    {
      result: mainImage,
      label: "主图",
      mobileRatio: "4:3",
      recommendedWidth: 2400,
      recommendedHeight: 1800,
    },
    {
      result: detailImageOne,
      label: "细节图 01",
      mobileRatio: "1:1",
      recommendedWidth: 1600,
      recommendedHeight: 1600,
    },
    {
      result: detailImageTwo,
      label: "细节图 02",
      mobileRatio: "1:1",
      recommendedWidth: 1600,
      recommendedHeight: 1600,
    },
  ];
  imageSlots.forEach(({
    result,
    label,
    mobileRatio,
    recommendedWidth,
    recommendedHeight,
  }) => {
    nextDefinition.nodes[result.nodeId].name = label;
    if (!result.slotId) return;
    const slot = nextDefinition.slots[result.slotId];
    slot.label = label;
    slot.required = true;
    slot.hideable = false;
    slot.validation.recommendedWidth = recommendedWidth;
    slot.validation.recommendedHeight = recommendedHeight;
    slot.desktopRules = {
      ...slot.desktopRules,
      aspectRatio: "4:3",
      objectFit: "cover",
      objectPosition: "center center",
    };
    slot.mobileRules = {
      ...slot.mobileRules,
      aspectRatio: mobileRatio,
      objectFit: "cover",
      objectPosition: "center center",
    };
  });

  if (isBlankTemplate) {
    if (!nextDefinition.name.trim() || nextDefinition.name === "未命名模板") {
      nextDefinition.name = "三图主次叙事";
    }
    if (nextDefinition.metadata.category === "未分类") {
      nextDefinition.metadata.category = "品牌展示";
    }
    if (nextDefinition.metadata.purpose === "自定义内容展示") {
      nextDefinition.metadata.purpose = "主视觉与细节并置";
    }
    if (nextDefinition.metadata.layoutType === "空白结构") {
      nextDefinition.metadata.layoutType = "一大两小响应式构图";
    }
    if (!nextDefinition.description?.trim()) {
      nextDefinition.description = "桌面端以主次分栏呈现三张 4:3 图片；移动端主图 4:3，双图 1:1 并排。";
    }
    if (nextDefinition.metadata.visualRole === "support-stage") {
      nextDefinition.metadata.visualRole = "feature-stage";
    }
    nextDefinition.metadata.slotSummary = "3 个必填图片槽位";
  }

  const validation = validateDynamicTemplateDefinition(nextDefinition);
  const firstError = validation.issues.find((issue) => issue.level === "error");
  if (firstError) throw new Error(`三图构图创建失败：${firstError.message}`);
  return {
    definition: nextDefinition,
    selectedNodeId: grid.nodeId,
    initializedTemplateInfo: isBlankTemplate,
  };
}

function NodeToolGroup({
  title,
  types,
  onAdd,
  canAdd,
  className,
}: {
  title: string;
  types: readonly DynamicTemplateNodeType[];
  onAdd: (type: DynamicTemplateNodeType) => void;
  canAdd: (type: DynamicTemplateNodeType) => boolean;
  className?: string;
}) {
  return (
    <section>
      {title ? <h3>{title}</h3> : null}
      <div className={`template-editor__node-tools${className ? ` ${className}` : ""}`}>
        {types.map((type) => {
          const entry = getDynamicTemplateNodeRegistryEntry(type);
          const displayLabel = type === "TextSlot" ? "描述槽位" : entry.label;
          const enabled = canAdd(type);
          return (
            <button
              key={type}
              type="button"
              disabled={!enabled}
              aria-label={`${displayLabel} ${entry.kind === "slot" ? "内容槽位" : "结构节点"}`}
              title={enabled ? `添加${displayLabel}` : `当前位置不能添加${displayLabel}`}
              onClick={() => onAdd(type)}
            >
              <span aria-hidden="true">{getNodeToolIcon(type)}</span>
              <strong>{displayLabel}</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface DynamicTemplateNodePaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DynamicTemplateNodePalette({
  open,
  onOpenChange,
}: DynamicTemplateNodePaletteProps) {
  const { message } = AntdApp.useApp();
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onOpenChange, open]);
  const draft = useTemplateEditorSession((state) => state.draft);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  const setDynamicDefinition = useTemplateEditorSession((state) => state.setDynamicDefinition);
  const selectObject = useTemplateEditorSession((state) => state.selectObject);
  if (!draft) return null;

  const createRegion = (definition = draft.definition) => {
    const result = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    const nextDefinition = structuredClone(result.definition);
    const regionCount = nextDefinition.nodes[definition.rootNodeId].childIds.length;
    nextDefinition.nodes[result.nodeId].name = `内容区域 ${String(regionCount).padStart(2, "0")}`;
    return { definition: nextDefinition, nodeId: result.nodeId };
  };
  const addNode = (type: DynamicTemplateNodeType, autoCreateRegion = false) => {
    let baseDefinition = draft.definition;
    let parentId = findDynamicTemplateInsertionParentId(
      draft.definition,
      selectedNodeId,
      type,
    );
    let createdRegionName: string | null = null;
    if (!parentId && autoCreateRegion && getDynamicTemplateNodeRegistryEntry(type).kind === "slot") {
      const region = createRegion();
      baseDefinition = region.definition;
      parentId = region.nodeId;
      createdRegionName = region.definition.nodes[region.nodeId].name;
    }
    if (!parentId) {
      message.warning({
        content: "槽位必须放在区域或容器内，请先创建内容区域。",
        key: "template-slot-parent-required",
      });
      return false;
    }
    try {
      const result = addDynamicTemplateNode(baseDefinition, parentId, type);
      const nextDefinition = structuredClone(result.definition);
      if (type === "TextSlot" && result.slotId) {
        const descriptionCount = Object.values(nextDefinition.slots)
          .filter((slot) => slot.key.startsWith("description")).length;
        nextDefinition.nodes[result.nodeId].name = "描述槽位";
        nextDefinition.slots[result.slotId].label = "描述槽位";
        nextDefinition.slots[result.slotId].key = descriptionCount === 0
          ? "description"
          : `description${descriptionCount + 1}`;
      } else if (result.slotId) {
        const slot = nextDefinition.slots[result.slotId];
        const sameTypeCount = Object.values(nextDefinition.slots)
          .filter((candidate) => candidate.type === slot.type).length;
        if (sameTypeCount > 1) {
          const numberedLabel = `${getDynamicTemplateNodeRegistryEntry(type).label} ${String(sameTypeCount).padStart(2, "0")}`;
          nextDefinition.nodes[result.nodeId].name = numberedLabel;
          slot.label = numberedLabel;
        }
      }
      setDynamicDefinition(nextDefinition);
      selectObject(result.nodeId);
      if (createdRegionName) {
        message.success({
          content: `已自动建立“${createdRegionName}”，并将槽位放入该区域。`,
          key: "template-slot-parent-created",
        });
      }
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : "节点添加失败");
      return false;
    }
  };
  const canAddNode = (type: DynamicTemplateNodeType) => Boolean(
    findDynamicTemplateInsertionParentId(draft.definition, selectedNodeId, type),
  );
  const addRegion = () => {
    try {
      const region = createRegion();
      setDynamicDefinition(region.definition);
      selectObject(region.nodeId);
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : "区域添加失败");
      return false;
    }
  };
  const addThreeImageComposition = () => {
    try {
      const result = createThreeImageComposition(draft.definition);
      setDynamicDefinition(result.definition);
      selectObject(result.selectedNodeId);
      message.success({
        content: result.initializedTemplateInfo
          ? `已建立“${result.definition.name}”模板骨架并补全构图信息：桌面均为 4:3，手机主图 4:3、双图 1:1 并排。`
          : "已增加 3 个必填图片槽位：桌面均为 4:3，手机主图 4:3、双图 1:1 并排。",
        key: "template-three-image-composition-created",
      });
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : "三图构图创建失败");
      return false;
    }
  };
  const coreTypes: DynamicTemplateNodeType[] = [
    "ImageSlot",
    "HeadingSlot",
    "TextSlot",
    "ProductSlot",
    "ButtonSlot",
  ];
  const shortcutParentId = findDynamicTemplateInsertionParentId(
    draft.definition,
    selectedNodeId,
    "ImageSlot",
  );
  const rootRegionIds = draft.definition.nodes[draft.definition.rootNodeId]?.childIds ?? [];
  const shortcutParentName = shortcutParentId
    ? rootRegionIds.includes(shortcutParentId)
      ? getDynamicTemplateRegionDisplayName(draft.definition, shortcutParentId)
      : draft.definition.nodes[shortcutParentId]?.name
    : null;
  const shortcutTargetName = shortcutParentName || "新内容区域";
  const contentGroups: Array<{ title: string; types: DynamicTemplateNodeType[] }> = [
    { title: "媒体", types: DYNAMIC_TEMPLATE_CONTENT_NODE_TYPES.filter((type) => ["ImageSlot", "Video", "Carousel", "Hotspot", "BeforeAfter"].includes(type)) },
    { title: "文字", types: DYNAMIC_TEMPLATE_CONTENT_NODE_TYPES.filter((type) => ["HeadingSlot", "TextSlot", "RichTextSlot", "BadgeSlot", "IconSlot"].includes(type)) },
    { title: "行动", types: DYNAMIC_TEMPLATE_CONTENT_NODE_TYPES.filter((type) => ["ButtonSlot", "LinkSlot", "Appointment"].includes(type)) },
    { title: "业务组件", types: DYNAMIC_TEMPLATE_CONTENT_NODE_TYPES.filter((type) => !["ImageSlot", "Video", "Carousel", "Hotspot", "BeforeAfter", "HeadingSlot", "TextSlot", "RichTextSlot", "BadgeSlot", "IconSlot", "ButtonSlot", "LinkSlot", "Appointment"].includes(type)) },
  ];

  const isBlankTemplate = draft.definition.nodes[draft.definition.rootNodeId]?.childIds.length === 0
    && Object.keys(draft.definition.slots).length === 0;
  const addFromPalette = (type: DynamicTemplateNodeType, autoCreateRegion = false) => {
    addNode(type, autoCreateRegion);
  };
  const paletteContent = (
    <div
      className="template-editor__add-popover"
      role="dialog"
      aria-label="添加模板结构"
    >
      <header className="template-editor__add-popover-header">
        <span>添加到：</span>
        <strong>{shortcutTargetName}</strong>
        {!shortcutParentName ? <small>添加内容时会自动创建内容区域 1</small> : null}
      </header>

      <section className="template-editor__region-tools" aria-labelledby="template-region-tools-title">
        <h3 id="template-region-tools-title">区域</h3>
        <button
          type="button"
          className="template-editor__add-region"
          aria-label="添加区域（新增内容区域）"
          onClick={addRegion}
        >
          <PlusOutlined />
          <span><strong>新建内容区域</strong><small>在模板根层创建独立区域</small></span>
        </button>
      </section>

      <section className="template-editor__core-slot-tools" aria-label="常用内容槽位">
        <h3>常用内容</h3>
        <NodeToolGroup
          title=""
          types={coreTypes}
          onAdd={(type) => addFromPalette(type, true)}
          canAdd={() => true}
          className="template-editor__node-tools--core"
        />
      </section>

      <details className="template-editor__advanced-layout-tools">
        <summary>布局</summary>
        <div className="template-editor__node-palette-content">
          <NodeToolGroup
            title="排列方式"
            types={DYNAMIC_TEMPLATE_STRUCTURE_NODE_TYPES.filter((type) => type !== "Section" && type !== "Container")}
            onAdd={(type) => addFromPalette(type)}
            canAdd={canAddNode}
          />
        </div>
      </details>

      <details className="template-editor__add-slot-tools">
        <summary role="button" aria-label="高级内容">高级内容</summary>
        <div className="template-editor__node-palette-content">
          {contentGroups.map((group) => {
            const types = group.types.filter((type) => !coreTypes.includes(type));
            return types.length ? (
              <NodeToolGroup
                key={group.title}
                title={group.title}
                types={types}
                onAdd={(type) => addFromPalette(type)}
                canAdd={canAddNode}
              />
            ) : null;
          })}
        </div>
      </details>

      <details className="template-editor__composition-tools">
        <summary>组合模块</summary>
        <div className="template-editor__node-palette-content">
          <button
            type="button"
            className="template-editor__composition-tool"
            aria-label="建立主图加双图布局"
            title="建立 3 个必填图片槽位；桌面均为 4:3，手机主图 4:3、双图 1:1 并排"
            onClick={() => {
              if (addThreeImageComposition()) onOpenChange(false);
            }}
          >
            <span className="template-editor__composition-preview" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              <strong>{isBlankTemplate ? "主图 + 双图" : "插入主图 + 双图"}</strong>
              <small>{isBlankTemplate ? "建立完整模板骨架" : "作为新区域加入，不替换现有内容"}</small>
            </span>
          </button>
        </div>
      </details>
    </div>
  );

  return (
    <div className="template-editor__dynamic-node-palette" aria-label="模板结构工具">
      <Popover
        content={paletteContent}
        open={open}
        onOpenChange={onOpenChange}
        placement="rightBottom"
        trigger="click"
        overlayClassName="template-editor__add-popover-overlay"
      >
        <button
          ref={triggerRef}
          type="button"
          className="template-editor__add-trigger"
          aria-label={`添加模板结构到${shortcutTargetName}`}
          aria-expanded={open}
        >
          <PlusOutlined />
          <span>添加结构</span>
        </button>
      </Popover>
    </div>
  );
}
