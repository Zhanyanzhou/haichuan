import { useEffect, useRef, useState, type CSSProperties, type ElementType, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import {
  AlignCenterOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeInvisibleOutlined,
  SwapOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignMiddleOutlined,
  VerticalAlignTopOutlined,
} from "@ant-design/icons";
import type {
  TemplateDefinitionV2,
  DynamicTemplateLength,
  DynamicTemplatePlacement,
  TemplateInstanceLayoutOverride,
  TemplateInstanceLayoutOverridesByNodeId,
} from "./generated/templateDefinition.generated";
import {
  compileDynamicTemplateRenderPlan,
  type DynamicTemplateRenderPlanNode,
} from "./renderPlan";
import { getDynamicTemplateNodeAdapter } from "./dynamicTemplateNodeAdapters";
import { objectPositionToPercent } from "./imagePosition";
import {
  moveFreePlacement,
  resizeFreePlacement,
  type FreePlacementResizeHandle,
} from "./freePlacementGeometry";

export interface DynamicTemplateRendererProps {
  definition: TemplateDefinitionV2;
  device: "desktop" | "mobile";
  contentBySlotId?: Record<string, unknown>;
  hiddenSlotIds?: readonly string[];
  layoutOverridesByNodeId?: TemplateInstanceLayoutOverridesByNodeId;
  mode?: "public" | "editor" | "preview" | "thumbnail";
  /**
   * 编辑态的交互边界。页面实例只负责整体预览，只有母模板定义工作面
   * 可以注册内部节点选择和直接布局手势；未声明时按无内部交互处理。
   */
  editorSurface?: "page-instance" | "template-definition";
  /** 当前模板编辑会话；仅用于给隔离画布内的合同槽位建立可写回身份。 */
  templateEditorSessionId?: string;
  selectedNodeId?: string | null;
  selectedContractRole?: { nodeId: string; roleId: string } | null;
  onSelectNode?: (nodeId: string) => void;
  onSelectContractRole?: (nodeId: string, roleId: string) => void;
  onNodeAction?: (
    nodeId: string,
    action: "duplicate" | "hide" | "delete" | "forward" | "backward"
      | "align-horizontal" | "align-vertical" | "copy-responsive",
  ) => void;
  /** 公开页主舞台可把首个可见标题槽位提升为页面唯一 h1。 */
  primaryHeadingLevel?: 1 | 2;
  layoutEditMode?: boolean;
  onLayoutOverrideCommit?: (
    nodeId: string,
    device: "desktop" | "mobile",
    override: TemplateInstanceLayoutOverride | undefined,
  ) => void;
  onTemplatePlacementCommit?: (
    nodeId: string,
    device: "desktop" | "mobile",
    placement: DynamicTemplatePlacement,
  ) => void;
}

const DYNAMIC_TEMPLATE_BACKGROUND_TOKENS: Record<string, string> = {
  surface: "#ffffff",
  "surface-muted": "#F4F5F5",
  "brand-ink": "#181A1B",
  "brand-soft": "#ECEEEF",
};

function lengthToCss(length: DynamicTemplateLength | undefined): string | undefined {
  return length ? `${length.value}${length.unit}` : undefined;
}

function sizeToCss(value: DynamicTemplateRenderPlanNode["rules"]["width"]): string {
  if (value === "fill") return "100%";
  if (value === "fit") return "fit-content";
  if (value === "auto") return "auto";
  return lengthToCss(value) ?? "auto";
}

function spacingToCss(
  spacing: DynamicTemplateRenderPlanNode["rules"]["padding"],
): string | undefined {
  if (!spacing) return undefined;
  return [spacing.top, spacing.right, spacing.bottom, spacing.left]
    .map((value) => lengthToCss(value))
    .join(" ");
}

function ratioToCss(ratio: string | undefined): string | undefined {
  return ratio && /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(ratio)
    ? ratio.replace(":", " / ")
    : undefined;
}

function rulesToStyle(
  node: DynamicTemplateRenderPlanNode,
  previewOverride?: TemplateInstanceLayoutOverride,
  placementPreview?: DynamicTemplatePlacement,
  parentFree = false,
): CSSProperties {
  const { rules } = node;
  const alignsOwnChildren = rules.display === "flex" || rules.display === "grid";
  const style: CSSProperties = {
    display: rules.display,
    order: rules.order,
    width: sizeToCss(rules.width),
    maxWidth: lengthToCss(rules.maxWidth),
    minHeight: lengthToCss(rules.minHeight),
    gap: lengthToCss(rules.gap),
    padding: spacingToCss(rules.padding),
    marginTop: lengthToCss(rules.margin?.top),
    marginRight: lengthToCss(rules.margin?.right),
    marginBottom: lengthToCss(rules.margin?.bottom),
    marginLeft: lengthToCss(rules.margin?.left),
    // 同一个“交叉方向对齐”控件需要兼顾容器和普通流节点：
    // flex/grid 对齐自己的子项，block 节点则在父级交叉轴上对齐自身。
    // 把 block 的值写成 align-items 虽然合法，但没有布局效果，会造成
    // Inspector 显示“靠后”而画布仍停在左侧。
    alignItems: alignsOwnChildren ? rules.alignItems : undefined,
    alignSelf: alignsOwnChildren ? undefined : rules.alignItems,
    justifyContent: rules.justifyContent,
    borderRadius: lengthToCss(rules.radius),
    overflow: rules.overflow,
    background: rules.backgroundToken
      ? DYNAMIC_TEMPLATE_BACKGROUND_TOKENS[rules.backgroundToken]
      : undefined,
    border: rules.borderToken ? {
      subtle: "1px solid #DDE1E2",
      strong: "1px solid #6E7477",
      accent: "1px solid #181A1B",
    }[rules.borderToken] : undefined,
  };
  if (rules.display === "flex") style.flexDirection = rules.direction ?? "row";
  if (rules.display === "grid" && rules.columns?.length) {
    style.gridTemplateColumns = rules.columns.map((column) => `${column}fr`).join(" ");
  }
  const height = rules.height;
  if (height.mode === "min-height") style.minHeight = lengthToCss(height.value);
  if (height.mode === "fixed" || height.mode === "viewport") style.height = lengthToCss(height.value);
  if (height.mode === "aspect-ratio" && height.ratio) {
    style.aspectRatio = `${height.ratio.width} / ${height.ratio.height}`;
  }
  const imageSlotAspectRatio = node.slot?.type === "image" && height.mode === "auto"
    ? ratioToCss(node.slotRules?.aspectRatio)
    : undefined;
  if (imageSlotAspectRatio) {
    style.aspectRatio = imageSlotAspectRatio;
    if (!rules.overflow) style.overflow = "hidden";
  }
  if (rules.layoutMode === "free") {
    style.position = "relative";
    style.display = "block";
  }
  const placement = placementPreview ?? rules.placement;
  if (parentFree && placement) {
    style.position = "absolute";
    style.left = `${placement.x * 100}%`;
    style.top = `${placement.y * 100}%`;
    style.width = `${placement.width * 100}%`;
    style.height = `${placement.height * 100}%`;
    style.zIndex = placement.zIndex;
    style.marginTop = 0;
    style.marginRight = 0;
    style.marginBottom = 0;
    style.marginLeft = 0;
  }
  const instance = previewOverride ?? node.layoutOverride;
  if (instance) {
    style.position = "relative";
    if (instance.offsetXPercent || instance.offsetYPercent) {
      style.transform = `translate(${instance.offsetXPercent ?? 0}%, ${instance.offsetYPercent ?? 0}%)`;
    }
    if (instance.widthPercent !== undefined) style.width = `${instance.widthPercent}%`;
    if (instance.zIndex !== undefined) style.zIndex = instance.zIndex;
    if (instance.marginTopPx !== undefined) style.marginTop = instance.marginTopPx;
    if (instance.marginBottomPx !== undefined) style.marginBottom = instance.marginBottomPx;
  }
  return style;
}

function sparseLayoutOverride(value: TemplateInstanceLayoutOverride): TemplateInstanceLayoutOverride | undefined {
  const next: TemplateInstanceLayoutOverride = {};
  if (value.offsetXPercent) next.offsetXPercent = Math.round(value.offsetXPercent * 100) / 100;
  if (value.offsetYPercent) next.offsetYPercent = Math.round(value.offsetYPercent * 100) / 100;
  if (value.widthPercent !== undefined && value.widthPercent !== 100) {
    next.widthPercent = Math.round(value.widthPercent * 100) / 100;
  }
  if (value.zIndex) next.zIndex = value.zIndex;
  if (value.objectFit) next.objectFit = value.objectFit;
  if (value.imageScalePercent !== undefined && value.imageScalePercent !== 100) {
    next.imageScalePercent = Math.round(value.imageScalePercent * 100) / 100;
  }
  if (value.focusXPercent !== undefined && value.focusXPercent !== 50) {
    next.focusXPercent = Math.round(value.focusXPercent * 100) / 100;
  }
  if (value.focusYPercent !== undefined && value.focusYPercent !== 50) {
    next.focusYPercent = Math.round(value.focusYPercent * 100) / 100;
  }
  if (value.fontSizePx !== undefined) next.fontSizePx = Math.round(value.fontSizePx * 100) / 100;
  if (value.textAlign) next.textAlign = value.textAlign;
  if (value.marginTopPx) next.marginTopPx = Math.round(value.marginTopPx * 100) / 100;
  if (value.marginBottomPx) next.marginBottomPx = Math.round(value.marginBottomPx * 100) / 100;
  return Object.keys(next).length ? next : undefined;
}

function getSafeActionContent(content: unknown): { label: string; href?: string } {
  if (!content || typeof content !== "object" || Array.isArray(content)) return { label: "" };
  const record = content as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label : "";
  if (record.targetType === "page" && typeof record.pagePath === "string" && record.pagePath.startsWith("/")) {
    return { label, href: record.pagePath };
  }
  if (record.targetType === "external" && typeof record.url === "string" && /^https:\/\//i.test(record.url)) {
    return { label, href: record.url };
  }
  if (record.targetType === "product" && typeof record.productCode === "string" && record.productCode.trim()) {
    return { label, href: `/products/${encodeURIComponent(record.productCode.trim())}` };
  }
  if (record.targetType === "category" && typeof record.categorySlug === "string" && record.categorySlug.trim()) {
    return { label, href: `/catalog?category=${encodeURIComponent(record.categorySlug.trim())}` };
  }
  return { label };
}

function renderSlotContent(
  node: DynamicTemplateRenderPlanNode,
  mode: NonNullable<DynamicTemplateRendererProps["mode"]>,
  headingLevel: 1 | 2 = 2,
  editorBlockId?: string,
  editorViewport?: "desktop" | "mobile",
): ReactNode {
  const { slot, content } = node;
  if (!slot) return null;
  const adapter = getDynamicTemplateNodeAdapter(slot.type);
  if (adapter) return adapter.render({
    content: editorBlockId && content && typeof content === "object" && !Array.isArray(content)
      ? { ...content as Record<string, unknown>, id: editorBlockId, __editorViewport: editorViewport }
      : editorBlockId
        ? { id: editorBlockId, __editorViewport: editorViewport }
        : content,
    mode,
    nodeProps: node.props,
    headingLevel,
  });
  const textStyle: CSSProperties = {
    margin: 0,
    fontSize: node.layoutOverride?.fontSizePx !== undefined
      ? `${node.layoutOverride.fontSizePx}px`
      : lengthToCss(node.slotRules?.fontSize),
    fontWeight: node.slotRules?.fontWeight,
    lineHeight: node.slotRules?.lineHeight,
    textAlign: node.layoutOverride?.textAlign ?? node.slotRules?.textAlign,
    ...(node.slotRules?.maxLines ? {
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: node.slotRules.maxLines,
      overflow: "hidden",
    } : {}),
    ...(node.slotRules?.overflow === "ellipsis" && !node.slotRules?.maxLines ? {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    } : {}),
  };
  if (slot.type === "image") {
    const record = content && typeof content === "object" && !Array.isArray(content)
      ? content as Record<string, unknown>
      : null;
    const src = typeof content === "string" ? content : typeof record?.src === "string" ? record.src : "";
    const alt = typeof record?.alt === "string" ? record.alt : "";
    const defaultFocus = objectPositionToPercent(node.slotRules?.objectPosition);
    if (!src) return <span className="hc-dynamic-template__empty-slot">图片待填写</span>;
    return (
      <img
        src={src}
        alt={alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: node.layoutOverride?.objectFit ?? node.slotRules?.objectFit ?? "cover",
          objectPosition: `${node.layoutOverride?.focusXPercent ?? defaultFocus.x}% ${node.layoutOverride?.focusYPercent ?? defaultFocus.y}%`,
          transform: node.layoutOverride?.imageScalePercent && node.layoutOverride.imageScalePercent !== 100
            ? `scale(${node.layoutOverride.imageScalePercent / 100})`
            : undefined,
          transformOrigin: `${node.layoutOverride?.focusXPercent ?? defaultFocus.x}% ${node.layoutOverride?.focusYPercent ?? defaultFocus.y}%`,
        }}
      />
    );
  }
  if (["heading", "text", "richText", "badge", "icon"].includes(slot.type)) {
    const text = typeof content === "string" ? content : "";
    if (!text) return <span className="hc-dynamic-template__empty-slot">{slot.label}待填写</span>;
    if (slot.type === "heading") {
      const Heading = headingLevel === 1 ? "h1" : "h2";
      return <Heading data-template-font-role={node.slotRules?.fontRole} style={textStyle}>{text}</Heading>;
    }
    if (slot.type === "badge") return <span data-template-font-role={node.slotRules?.fontRole} style={textStyle}>{text}</span>;
    return <p data-template-font-role={node.slotRules?.fontRole} style={{ ...textStyle, whiteSpace: "pre-wrap" }}>{text}</p>;
  }
  if (slot.type === "button" || slot.type === "link") {
    const action = getSafeActionContent(content);
    if (!action.label) return <span className="hc-dynamic-template__empty-slot">行动待填写</span>;
    return action.href
      ? <a href={action.href} data-template-font-role={node.slotRules?.fontRole} style={textStyle}>{action.label}</a>
      : <span data-template-font-role={node.slotRules?.fontRole} style={textStyle}>{action.label}</span>;
  }
  if (slot.type === "product") {
    const productCode = typeof content === "string" ? content.trim() : "";
    const mockLabel = mode !== "public"
      && content && typeof content === "object" && !Array.isArray(content)
      && (content as Record<string, unknown>).mock === true
      && typeof (content as Record<string, unknown>).label === "string"
      ? String((content as Record<string, unknown>).label)
      : "";
    if (mockLabel) return <span data-template-mock-content="product">{mockLabel}</span>;
    return productCode
      ? <a href={`/products/${encodeURIComponent(productCode)}`}>{productCode}</a>
      : <span className="hc-dynamic-template__empty-slot">商品待选择</span>;
  }
  if (slot.type === "collection") {
    const refs = Array.isArray(content) ? content.filter((item): item is string => typeof item === "string") : [];
    return refs.length ? (
      <ul>
        {refs.map((reference) => (
          <li key={reference}>
            <a href={`/products/${encodeURIComponent(reference)}`}>{reference}</a>
          </li>
        ))}
      </ul>
    ) : <span className="hc-dynamic-template__empty-slot">集合待选择</span>;
  }
  return null;
}

function nodeElementType(node: DynamicTemplateRenderPlanNode): ElementType {
  if (node.type === "Section") return node.props.semanticTag === "header" ? "header" : "section";
  if (["Container", "Grid", "Row", "Column", "Stack"].includes(node.type)) {
    return node.props.semanticTag ?? "div";
  }
  return "div";
}

function RenderNode({
  node,
  mode,
  selectedNodeId,
  selectedContractRole,
  onSelectNode,
  onSelectContractRole,
  onNodeAction,
  primaryHeadingSlotId,
  primaryHeadingLevel,
  device,
  layoutEditMode,
  onLayoutOverrideCommit,
  onTemplatePlacementCommit,
  templateEditorSessionId,
  parentFree = false,
  siblingPlacements = [],
}: {
  node: DynamicTemplateRenderPlanNode;
  mode: NonNullable<DynamicTemplateRendererProps["mode"]>;
  selectedNodeId?: string | null;
  selectedContractRole?: DynamicTemplateRendererProps["selectedContractRole"];
  onSelectNode?: (nodeId: string) => void;
  onSelectContractRole?: DynamicTemplateRendererProps["onSelectContractRole"];
  onNodeAction?: DynamicTemplateRendererProps["onNodeAction"];
  primaryHeadingSlotId?: string;
  primaryHeadingLevel: 1 | 2;
  device: "desktop" | "mobile";
  layoutEditMode?: boolean;
  onLayoutOverrideCommit?: DynamicTemplateRendererProps["onLayoutOverrideCommit"];
  onTemplatePlacementCommit?: DynamicTemplateRendererProps["onTemplatePlacementCommit"];
  templateEditorSessionId?: string;
  parentFree?: boolean;
  siblingPlacements?: DynamicTemplatePlacement[];
}) {
  const Element = nodeElementType(node);
  const interactive = mode === "editor" && Boolean(onSelectNode);
  const structureLocked = node.props.contentTemplateDesignProps?.structureLocked === true;
  const layoutEditable = Boolean(
    interactive &&
    !structureLocked &&
    layoutEditMode &&
    selectedNodeId === node.nodeId &&
    node.instanceEditPolicy &&
    (node.instanceEditPolicy.position || node.instanceEditPolicy.size) &&
    onLayoutOverrideCommit,
  );
  const freePlacementEditable = Boolean(
    interactive
    && !structureLocked
    && parentFree
    && selectedNodeId === node.nodeId
    && node.rules.placement
    && onTemplatePlacementCommit,
  );
  const [layoutPreview, setLayoutPreview] = useState<TemplateInstanceLayoutOverride | undefined>();
  const [placementPreview, setPlacementPreview] = useState<DynamicTemplatePlacement | undefined>();
  const freeGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    parentWidth: number;
    parentHeight: number;
    handle?: FreePlacementResizeHandle;
    start: DynamicTemplatePlacement;
    current: DynamicTemplatePlacement;
  } | null>(null);
  const gestureRef = useRef<{
    pointerId: number;
    operation: "move" | "resize";
    startX: number;
    startY: number;
    baseWidth: number;
    baseHeight: number;
    start: TemplateInstanceLayoutOverride;
    current: TemplateInstanceLayoutOverride;
  } | null>(null);
  useEffect(() => {
    if (!layoutEditable) {
      gestureRef.current = null;
      setLayoutPreview(undefined);
    }
  }, [layoutEditable]);
  useEffect(() => {
    if (!gestureRef.current) setLayoutPreview(undefined);
  }, [node.layoutOverride]);
  useEffect(() => {
    if (!freePlacementEditable) {
      freeGestureRef.current = null;
      setPlacementPreview(undefined);
    }
  }, [freePlacementEditable]);
  useEffect(() => {
    if (!freeGestureRef.current) setPlacementPreview(undefined);
  }, [node.rules.placement]);

  const beginFreePlacementGesture = (event: PointerEvent) => {
    if (!freePlacementEditable || event.button !== 0 || !node.rules.placement) return false;
    const target = event.target as HTMLElement;
    const handleElement = target.closest<HTMLElement>("[data-template-free-resize-handle]");
    if (!handleElement && target.closest("a,button,input,textarea,select,[contenteditable='true']")) return false;
    event.preventDefault();
    event.stopPropagation();
    const owner = event.currentTarget as HTMLElement;
    const parentRect = owner.parentElement?.getBoundingClientRect();
    if (!parentRect) return false;
    const start = { ...node.rules.placement };
    freeGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      parentWidth: Math.max(1, parentRect.width),
      parentHeight: Math.max(1, parentRect.height),
      handle: handleElement?.dataset.templateFreeResizeHandle as FreePlacementResizeHandle | undefined,
      start,
      current: start,
    };
    owner.setPointerCapture(event.pointerId);
    return true;
  };

  const updateFreePlacementGesture = (event: PointerEvent) => {
    const gesture = freeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    event.preventDefault();
    const dx = (event.clientX - gesture.startX) / gesture.parentWidth;
    const dy = (event.clientY - gesture.startY) / gesture.parentHeight;
    const next = gesture.handle
      ? resizeFreePlacement(gesture.start, gesture.handle, dx, dy, siblingPlacements)
      : moveFreePlacement(gesture.start, dx, dy, siblingPlacements);
    gesture.current = next;
    setPlacementPreview(next);
    return true;
  };

  const finishFreePlacementGesture = (event: PointerEvent) => {
    const gesture = freeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return false;
    event.preventDefault();
    freeGestureRef.current = null;
    setPlacementPreview(undefined);
    onTemplatePlacementCommit?.(node.nodeId, device, gesture.current);
    return true;
  };

  const cancelFreePlacementGesture = (event: PointerEvent) => {
    if (freeGestureRef.current?.pointerId !== event.pointerId) return false;
    freeGestureRef.current = null;
    setPlacementPreview(undefined);
    return true;
  };
  const beginLayoutGesture = (event: PointerEvent) => {
    if (!layoutEditable || event.button !== 0 || !node.instanceEditPolicy) return;
    const target = event.target as HTMLElement;
    const resize = Boolean(target.closest("[data-template-resize-handle]"));
    if (!resize && target.closest("a,button,input,textarea,select,[contenteditable='true']")) return;
    if (resize && !node.instanceEditPolicy.size) return;
    if (!resize && !node.instanceEditPolicy.position) return;
    event.preventDefault();
    event.stopPropagation();
    const owner = event.currentTarget as HTMLElement;
    const rect = owner.getBoundingClientRect();
    const start = { widthPercent: 100, ...node.layoutOverride };
    gestureRef.current = {
      pointerId: event.pointerId,
      operation: resize ? "resize" : "move",
      startX: event.clientX,
      startY: event.clientY,
      baseWidth: Math.max(1, rect.width / ((start.widthPercent ?? 100) / 100)),
      baseHeight: Math.max(1, rect.height),
      start,
      current: start,
    };
    owner.setPointerCapture(event.pointerId);
  };
  const updateLayoutGesture = (event: PointerEvent) => {
    const gesture = gestureRef.current;
    const policy = node.instanceEditPolicy;
    if (!gesture || gesture.pointerId !== event.pointerId || !policy) return;
    event.preventDefault();
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const next: TemplateInstanceLayoutOverride = { ...gesture.start };
    if (gesture.operation === "resize") {
      next.widthPercent = Math.max(
        policy.minWidthPercent,
        Math.min(policy.maxWidthPercent, (gesture.start.widthPercent ?? 100) + dx / gesture.baseWidth * 100),
      );
    } else {
      next.offsetXPercent = Math.max(
        -policy.maxOffsetPercent,
        Math.min(policy.maxOffsetPercent, (gesture.start.offsetXPercent ?? 0) + dx / gesture.baseWidth * 100),
      );
      next.offsetYPercent = Math.max(
        -policy.maxOffsetPercent,
        Math.min(policy.maxOffsetPercent, (gesture.start.offsetYPercent ?? 0) + dy / gesture.baseHeight * 100),
      );
    }
    gesture.current = next;
    setLayoutPreview(next);
  };
  const finishLayoutGesture = (event: PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    gestureRef.current = null;
    const next = sparseLayoutOverride(gesture.current);
    setLayoutPreview(next);
    onLayoutOverrideCommit?.(node.nodeId, device, next);
  };
  const cancelLayoutGesture = (event: PointerEvent) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setLayoutPreview(undefined);
  };
  if (node.hidden) return null;
  if (node.type === "Spacer") {
    return <div data-template-node-id={node.nodeId} aria-hidden="true" style={{ height: lengthToCss(node.props.spacerSize) ?? "1rem" }} />;
  }
  if (node.type === "Divider") {
    return <hr data-template-node-id={node.nodeId} style={{ borderStyle: node.props.dividerStyle ?? "solid" }} />;
  }
  const slotContent = node.slot
    ? renderSlotContent(
      node,
      mode,
      node.slotId === primaryHeadingSlotId ? primaryHeadingLevel : 2,
      mode === "editor" && templateEditorSessionId
        ? `template-editor:${templateEditorSessionId}:${node.nodeId}`
        : undefined,
      device,
    )
    : null;
  return (
    <Element
      data-template-node-id={node.nodeId}
      data-template-node-type={node.type}
      data-template-node-label={node.name}
      data-template-slot-id={node.slotId}
      data-template-selected={selectedNodeId === node.nodeId ? "true" : undefined}
      data-template-selected-contract-role={selectedContractRole?.nodeId === node.nodeId ? selectedContractRole.roleId : undefined}
      data-template-background-token={node.rules.backgroundToken}
      data-template-border-token={node.rules.borderToken}
      style={{
        ...rulesToStyle(node, layoutPreview, placementPreview, parentFree),
        ...(layoutEditable || freePlacementEditable ? {
          ...(layoutEditable ? { position: "relative" as const } : {}),
          outline: "1px solid #335F7D",
          outlineOffset: -1,
          cursor: freePlacementEditable || node.instanceEditPolicy?.position ? "move" : undefined,
        } : {}),
      }}
      {...(interactive ? {
        role: "group",
        tabIndex: 0,
        "aria-label": `选择模板节点 ${node.name}`,
        onClick: (event: MouseEvent) => {
          if ((event.currentTarget as HTMLElement).closest('[data-editor-node-selection="module"]')) return;
          event.stopPropagation();
          const roleElement = (event.target as HTMLElement).closest<HTMLElement>("[data-content-role], [data-content-node-id]");
          const roleId = roleElement?.dataset.contentRole ?? roleElement?.dataset.contentNodeId;
          if (roleId && onSelectContractRole) {
            onSelectContractRole(node.nodeId, roleId);
            return;
          }
          onSelectNode?.(node.nodeId);
        },
        onKeyDown: (event: KeyboardEvent) => {
          if ((event.target as HTMLElement).closest("[contenteditable='true']")) return;
          if (event.key === "Escape" && freeGestureRef.current) {
            event.preventDefault();
            freeGestureRef.current = null;
            setPlacementPreview(undefined);
            return;
          }
          if (freePlacementEditable && node.rules.placement && event.target === event.currentTarget && event.key.startsWith("Arrow")) {
            event.preventDefault();
            event.stopPropagation();
            const owner = event.currentTarget as HTMLElement;
            const parentRect = owner.parentElement?.getBoundingClientRect();
            const pixelStep = event.shiftKey ? 10 : 1;
            const dx = event.key === "ArrowLeft" ? -pixelStep : event.key === "ArrowRight" ? pixelStep : 0;
            const dy = event.key === "ArrowUp" ? -pixelStep : event.key === "ArrowDown" ? pixelStep : 0;
            const next = moveFreePlacement(
              node.rules.placement,
              dx / Math.max(1, parentRect?.width ?? 1),
              dy / Math.max(1, parentRect?.height ?? 1),
              siblingPlacements,
            );
            onTemplatePlacementCommit?.(node.nodeId, device, next);
            return;
          }
          if (layoutEditable && node.instanceEditPolicy && event.target === event.currentTarget && event.key.startsWith("Arrow")) {
            event.preventDefault();
            event.stopPropagation();
            const step = event.shiftKey ? 5 : 1;
            const current = { widthPercent: 100, ...node.layoutOverride };
            if (event.altKey && node.instanceEditPolicy.size) {
              const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
              current.widthPercent = Math.max(node.instanceEditPolicy.minWidthPercent, Math.min(node.instanceEditPolicy.maxWidthPercent, (current.widthPercent ?? 100) + direction * step));
            } else if (node.instanceEditPolicy.position) {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                current.offsetXPercent = Math.max(-node.instanceEditPolicy.maxOffsetPercent, Math.min(node.instanceEditPolicy.maxOffsetPercent, (current.offsetXPercent ?? 0) + (event.key === "ArrowLeft" ? -step : step)));
              } else {
                current.offsetYPercent = Math.max(-node.instanceEditPolicy.maxOffsetPercent, Math.min(node.instanceEditPolicy.maxOffsetPercent, (current.offsetYPercent ?? 0) + (event.key === "ArrowUp" ? -step : step)));
              }
            }
            const next = sparseLayoutOverride(current);
            setLayoutPreview(next);
            onLayoutOverrideCommit?.(node.nodeId, device, next);
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onSelectNode?.(node.nodeId);
          }
        },
        onPointerDown: (event: PointerEvent) => {
          if (!beginFreePlacementGesture(event)) beginLayoutGesture(event);
        },
        onPointerMove: (event: PointerEvent) => {
          if (!updateFreePlacementGesture(event)) updateLayoutGesture(event);
        },
        onPointerUp: (event: PointerEvent) => {
          if (!finishFreePlacementGesture(event)) finishLayoutGesture(event);
        },
        onPointerCancel: (event: PointerEvent) => {
          if (!cancelFreePlacementGesture(event)) cancelLayoutGesture(event);
        },
      } : {})}
    >
      {slotContent}
      {node.children.map((child) => (
        <RenderNode
          key={child.nodeId}
          node={child}
          mode={mode}
          selectedNodeId={selectedNodeId}
          selectedContractRole={selectedContractRole}
          onSelectNode={onSelectNode}
          onSelectContractRole={onSelectContractRole}
          onNodeAction={onNodeAction}
          primaryHeadingSlotId={primaryHeadingSlotId}
          primaryHeadingLevel={primaryHeadingLevel}
          device={device}
          layoutEditMode={layoutEditMode}
          onLayoutOverrideCommit={onLayoutOverrideCommit}
          onTemplatePlacementCommit={onTemplatePlacementCommit}
          templateEditorSessionId={templateEditorSessionId}
          parentFree={node.type === "Stack" && node.rules.layoutMode === "free"}
          siblingPlacements={node.children
            .filter((sibling) => sibling.nodeId !== child.nodeId)
            .flatMap((sibling) => sibling.rules.placement ? [sibling.rules.placement] : [])}
        />
      ))}
      {interactive && selectedNodeId === node.nodeId && node.type !== "Section" && onNodeAction ? (
        <div
          role="toolbar"
          aria-label={`${node.name}快捷操作`}
          data-template-node-toolbar
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            zIndex: 40,
            display: "flex",
            gap: 3,
            padding: 3,
            border: "1px solid rgb(24 26 27 / 18%)",
            borderRadius: 4,
            background: "rgb(255 255 255 / 94%)",
            boxShadow: "0 2px 10px rgb(0 0 0 / 12%)",
          }}
        >
          <button type="button" aria-label="复制节点" title="复制" onClick={(event) => { event.stopPropagation(); onNodeAction(node.nodeId, "duplicate"); }}><CopyOutlined /></button>
          {node.rules.placement ? <>
            <button type="button" aria-label="在父容器中水平居中" title="水平居中" onClick={(event) => { event.stopPropagation(); onNodeAction(node.nodeId, "align-horizontal"); }}><AlignCenterOutlined /></button>
            <button type="button" aria-label="在父容器中垂直居中" title="垂直居中" onClick={(event) => { event.stopPropagation(); onNodeAction(node.nodeId, "align-vertical"); }}><VerticalAlignMiddleOutlined /></button>
            <button
              type="button"
              aria-label={`复制当前自由布局到${device === "desktop" ? "移动端" : "桌面端"}`}
              title={`把当前自由布局及同级节点构图复制到${device === "desktop" ? "移动端" : "桌面端"}`}
              onClick={(event) => { event.stopPropagation(); onNodeAction(node.nodeId, "copy-responsive"); }}
            >
              <SwapOutlined />
            </button>
            <button type="button" aria-label="下移一层" title="下移一层" onClick={(event) => { event.stopPropagation(); onNodeAction(node.nodeId, "backward"); }}><VerticalAlignBottomOutlined /></button>
            <button type="button" aria-label="上移一层" title="上移一层" onClick={(event) => { event.stopPropagation(); onNodeAction(node.nodeId, "forward"); }}><VerticalAlignTopOutlined /></button>
          </> : null}
          <button
            type="button"
            disabled={node.slot?.required === true}
            aria-label={node.slot?.required ? "隐藏节点（必填槽位不可用）" : "隐藏节点"}
            title={node.slot?.required ? "必填槽位不能隐藏" : "隐藏"}
            style={node.slot?.required ? { cursor: "not-allowed", opacity: 0.42 } : undefined}
            onClick={(event) => { event.stopPropagation(); onNodeAction(node.nodeId, "hide"); }}
          >
            <EyeInvisibleOutlined />
          </button>
          <button
            type="button"
            disabled={node.slot?.required === true}
            aria-label={node.slot?.required ? "删除节点（必填槽位不可用）" : "删除节点"}
            title={node.slot?.required ? "必填槽位不能删除" : "删除"}
            style={node.slot?.required ? { cursor: "not-allowed", opacity: 0.42 } : undefined}
            onClick={(event) => { event.stopPropagation(); onNodeAction(node.nodeId, "delete"); }}
          >
            <DeleteOutlined />
          </button>
        </div>
      ) : null}
      {freePlacementEditable ? (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((handle) => {
        const positions: Record<FreePlacementResizeHandle, CSSProperties> = {
          nw: { left: -5, top: -5, cursor: "nwse-resize" },
          n: { left: "50%", top: -5, transform: "translateX(-50%)", cursor: "ns-resize" },
          ne: { right: -5, top: -5, cursor: "nesw-resize" },
          e: { right: -5, top: "50%", transform: "translateY(-50%)", cursor: "ew-resize" },
          se: { right: -5, bottom: -5, cursor: "nwse-resize" },
          s: { left: "50%", bottom: -5, transform: "translateX(-50%)", cursor: "ns-resize" },
          sw: { left: -5, bottom: -5, cursor: "nesw-resize" },
          w: { left: -5, top: "50%", transform: "translateY(-50%)", cursor: "ew-resize" },
        };
        return (
          <span
            key={handle}
            aria-hidden="true"
            data-template-free-resize-handle={handle}
            style={{
              position: "absolute",
              zIndex: 30,
              width: 10,
              height: 10,
              border: "1px solid #335F7D",
              background: "#FFFFFF",
              boxSizing: "border-box",
              ...positions[handle],
            }}
          />
        );
      }) : null}
      {layoutEditable && node.instanceEditPolicy?.size ? (
        <button
          type="button"
          aria-label={`调整${node.name}大小`}
          data-template-resize-handle
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            zIndex: 20,
            width: 14,
            height: 14,
            padding: 0,
            border: "1px solid #335F7D",
            background: "#FFFFFF",
            cursor: "nwse-resize",
          }}
        />
      ) : null}
    </Element>
  );
}

export default function DynamicTemplateRenderer({
  definition,
  device,
  contentBySlotId,
  hiddenSlotIds,
  layoutOverridesByNodeId,
  mode = "public",
  editorSurface,
  templateEditorSessionId,
  selectedNodeId,
  selectedContractRole,
  onSelectNode,
  onSelectContractRole,
  onNodeAction,
  primaryHeadingLevel = 2,
  layoutEditMode = false,
  onLayoutOverrideCommit,
  onTemplatePlacementCommit,
}: DynamicTemplateRendererProps) {
  const allowsNodeInteraction = mode === "editor" && editorSurface === "template-definition";
  const result = compileDynamicTemplateRenderPlan(definition, {
    device,
    contentBySlotId,
    hiddenSlotIds,
    layoutOverridesByNodeId,
    showEmptySlots: mode !== "public",
  });
  if (!result.ok) {
    if (mode === "public") return null;
    return (
      <section className="hc-dynamic-template__invalid" role="alert">
        <strong>模板定义无法渲染</strong>
        <span>{result.issues.find((issue) => issue.level === "error")?.message}</span>
      </section>
    );
  }
  const findPrimaryHeadingSlotId = (
    node: DynamicTemplateRenderPlanNode,
  ): string | undefined => {
    if (node.hidden) return undefined;
    if (
      (node.slot?.type === "heading"
        || (node.slot?.type === "heroTemplate"
          && node.content
          && typeof node.content === "object"
          && !Array.isArray(node.content)
          && typeof (node.content as Record<string, unknown>).title === "string"
          && Boolean((node.content as Record<string, unknown>).title as string)))
      && node.slotId
      && (node.slot?.type === "heroTemplate"
        || (typeof node.content === "string" && node.content.trim()))
    ) return node.slotId;
    return node.children.reduce<string | undefined>(
      (found, child) => found ?? findPrimaryHeadingSlotId(child),
      undefined,
    );
  };
  const primaryHeadingSlotId = primaryHeadingLevel === 1
    ? findPrimaryHeadingSlotId(result.plan.root)
    : undefined;
  return (
    <div
      className="hc-dynamic-template"
      data-dynamic-template-id={result.plan.templateId}
      data-dynamic-template-schema-version={result.plan.schemaVersion}
      data-dynamic-template-device={device}
      data-dynamic-template-mode={mode}
      data-dynamic-template-editor-surface={mode === "editor" ? editorSurface ?? "none" : undefined}
      data-template-default-background-token={result.plan.metadata.defaultBackgroundToken}
      style={{
        background: result.plan.metadata.defaultBackgroundToken
          ? DYNAMIC_TEMPLATE_BACKGROUND_TOKENS[result.plan.metadata.defaultBackgroundToken]
          : undefined,
      }}
    >
      <RenderNode
        node={result.plan.root}
        mode={mode}
        selectedNodeId={allowsNodeInteraction ? selectedNodeId : null}
        selectedContractRole={allowsNodeInteraction ? selectedContractRole : null}
        onSelectNode={allowsNodeInteraction ? onSelectNode : undefined}
        onSelectContractRole={allowsNodeInteraction ? onSelectContractRole : undefined}
        onNodeAction={allowsNodeInteraction ? onNodeAction : undefined}
        primaryHeadingSlotId={primaryHeadingSlotId}
        primaryHeadingLevel={primaryHeadingLevel}
        device={device}
        layoutEditMode={allowsNodeInteraction && layoutEditMode}
        onLayoutOverrideCommit={allowsNodeInteraction ? onLayoutOverrideCommit : undefined}
        onTemplatePlacementCommit={allowsNodeInteraction ? onTemplatePlacementCommit : undefined}
        templateEditorSessionId={allowsNodeInteraction ? templateEditorSessionId : undefined}
      />
    </div>
  );
}
