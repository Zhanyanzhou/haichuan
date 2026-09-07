import { App as AntdApp, Popover } from "antd";
import { AlignLeftOutlined, BlockOutlined, FontSizeOutlined, LinkOutlined, PictureOutlined, PlusOutlined, ShoppingOutlined } from "@ant-design/icons";
import { useEffect, useRef } from "react";
import { addDynamicTemplateNode, getDynamicTemplateStructureLockOwnerId } from "../template-definition";
import { findDynamicTemplateInsertionParentId } from "./dynamicTemplateEditorUtils";
import { useTemplateEditorSession } from "./templateEditorSession";

const SLOT_TOOLS = [
  { type: "ImageSlot", label: "图片槽位", hint: "放置一张图片", icon: <PictureOutlined /> },
  { type: "HeadingSlot", label: "标题槽位", hint: "放置标题文字", icon: <FontSizeOutlined /> },
  { type: "TextSlot", label: "正文槽位", hint: "放置一段文字", icon: <AlignLeftOutlined /> },
  { type: "ButtonSlot", label: "按钮槽位", hint: "放置跳转按钮", icon: <LinkOutlined /> },
  { type: "ProductSlot", label: "商品槽位", hint: "选择一件真实商品", icon: <ShoppingOutlined /> },
] as const;

const TYPOGRAPHY_SLOT_TYPES = new Set(["HeadingSlot", "TextSlot", "ButtonSlot"]);

/** 添加常用槽位时自动建立内容区域，不要求使用者理解容器层级。 */
export function DynamicTemplateNodePalette({ open, onOpenChange }: {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { message } = AntdApp.useApp();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const draft = useTemplateEditorSession((state) => state.draft);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, onOpenChange]);
  if (!draft) return null;
  const locked = Boolean(getDynamicTemplateStructureLockOwnerId(draft.definition, selectedNodeId ?? draft.definition.rootNodeId));
  const addRegion = () => {
    const session = useTemplateEditorSession.getState();
    if (!session.draft || locked) return;
    try {
      const result = addDynamicTemplateNode(
        session.draft.definition,
        session.draft.definition.rootNodeId,
        "Container",
      );
      const next = structuredClone(result.definition);
      const count = next.nodes[next.rootNodeId].childIds.length;
      next.nodes[result.nodeId].name = `内容区域 ${count}`;
      const applied = session.setDynamicDefinition(next);
      if (!applied.ok) { message.warning(applied.message); return; }
      session.selectObject(result.nodeId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "添加区域失败");
    }
  };
  const addSlot = (tool: typeof SLOT_TOOLS[number]) => {
    const session = useTemplateEditorSession.getState();
    if (!session.draft || locked) return;
    try {
      let definition = session.draft.definition;
      let parentId = findDynamicTemplateInsertionParentId(definition, session.selectedObjectId, tool.type);
      if (!parentId) {
        // 点击空白画布后仍优先复用已有区域，避免每次添加都产生新容器。
        parentId = definition.nodes[definition.rootNodeId].childIds
          .map((id) => findDynamicTemplateInsertionParentId(definition, id, tool.type))
          .find((id) => id !== null) ?? null;
      }
      if (!parentId) {
        const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
        definition = structuredClone(region.definition);
        for (const device of ["desktop", "mobile"] as const) {
          const rules = definition.nodes[region.nodeId].responsive[device];
          rules.gap = { value: 24, unit: "px" };
          const side = { value: device === "desktop" ? 32 : 16, unit: "px" as const };
          rules.padding = { top: side, right: side, bottom: side, left: side };
        }
        parentId = region.nodeId;
      }
      const result = addDynamicTemplateNode(definition, parentId, tool.type);
      const next = structuredClone(result.definition);
      const slot = next.slots[result.slotId!];
      const count = Object.values(next.slots).filter((item) => item.type === slot.type).length;
      const label = `${tool.label}${count > 1 ? ` ${count}` : ""}`;
      next.nodes[result.nodeId].name = label;
      slot.label = label;
      if (TYPOGRAPHY_SLOT_TYPES.has(tool.type)) {
        slot.desktopRules.fontWeight = slot.mobileRules.fontWeight = tool.type === "HeadingSlot" ? 600 : 400;
        slot.desktopRules.fontSize = { value: tool.type === "HeadingSlot" ? 48 : tool.type === "TextSlot" ? 28 : 24, unit: "px" };
        slot.mobileRules.fontSize = { value: tool.type === "HeadingSlot" ? 28 : 16, unit: "px" };
      }
      if (tool.type === "TextSlot") {
        let index = 1;
        const keys = new Set(Object.values(next.slots).filter((item) => item.slotId !== slot.slotId).map((item) => item.key));
        while (keys.has(index === 1 ? "description" : `description${index}`)) index += 1;
        slot.key = index === 1 ? "description" : `description${index}`;
      }
      const applied = session.setDynamicDefinition(next);
      if (!applied.ok) { message.warning(applied.message); return; }
      session.selectObject(result.nodeId);
      // 弹层保持打开以支持连续添加；Esc 与点击外部仍按 Popover 默认关闭。
    } catch (error) {
      message.error(error instanceof Error ? error.message : "添加槽位失败");
    }
  };
  return <div className="template-editor__dynamic-node-palette" aria-label="模板结构工具">
    <button
      type="button"
      className="template-editor__add-trigger"
      aria-label="添加区域"
      data-template-inspector-field="structure.create.region"
      disabled={locked}
      onClick={addRegion}
    >
      <BlockOutlined /><span>添加区域</span>
    </button>
    <Popover open={open} onOpenChange={onOpenChange} placement="rightBottom" trigger="click"
      overlayClassName="template-editor__add-popover-overlay"
      content={<div className="template-editor__add-popover template-editor__simple-palette" role="dialog" aria-label="添加槽位">
        <h3>添加槽位</h3>
        <p>可重复添加，图片、文字和商品在页面装修中填写。</p>
        <div
          className="template-editor__node-tools template-editor__node-tools--core"
          role="region"
          aria-label="常用内容槽位"
          tabIndex={-1}
          data-template-inspector-field="structure.create.slot"
        >
          {SLOT_TOOLS.map((tool) => <button key={tool.type} type="button" disabled={locked} aria-label={`添加${tool.label}`} onClick={() => addSlot(tool)}>
            <span aria-hidden="true">{tool.icon}</span><strong>{tool.label}</strong><small>{tool.hint}</small>
          </button>)}
        </div>
        {locked ? <p role="status">当前区域已锁定，请先在槽位列表中解锁。</p> : null}
      </div>}>
      <button ref={triggerRef} type="button" className="template-editor__add-trigger" aria-label="添加槽位" aria-expanded={open}>
        <PlusOutlined /><span>添加槽位</span>
      </button>
    </Popover>
  </div>;
}
