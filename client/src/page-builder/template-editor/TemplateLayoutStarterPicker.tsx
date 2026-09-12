import { App as AntdApp, Button, Popover } from "antd";
import { useEffect, useRef, useState } from "react";
import { getDynamicTemplateStructureLockOwnerId, type TemplateDefinitionV2 } from "../template-definition";
import { useTemplateEditorSession } from "./templateEditorSession";
import { addTemplateLayoutStarter, getTemplateLayoutStarterUnavailableReason, TEMPLATE_LAYOUT_STARTERS, type TemplateLayoutStarter } from "./templateLayoutStarters";

export default function TemplateLayoutStarterPicker({ parentId, index, disabled = false, onAdded }: {
  parentId: string;
  index?: number;
  disabled?: boolean;
  onAdded?: (firstTargetId: string) => void;
}) {
  const { message } = AntdApp.useApp();
  const sessionId = useTemplateEditorSession((state) => state.sessionId);
  const draft = useTemplateEditorSession((state) => state.draft);
  const previewMode = useTemplateEditorSession((state) => state.previewMode);
  const activeInteraction = useTemplateEditorSession((state) => state.activeInteraction);
  const [open, setOpen] = useState(false);
  const ownerRef = useRef<{ sessionId: string | null; definition: TemplateDefinitionV2 | undefined } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const parent = draft?.definition.nodes[parentId];
  const locked = draft ? Boolean(getDynamicTemplateStructureLockOwnerId(draft.definition, parentId)) : true;
  const unavailable = disabled || !parent || locked || previewMode || Boolean(activeInteraction);
  const close = () => { setOpen(false); queueMicrotask(() => triggerRef.current?.focus()); };
  useEffect(() => { setOpen(false); }, [sessionId, parentId, index]);
  const add = (kind: TemplateLayoutStarter) => {
    const state = useTemplateEditorSession.getState();
    if (!state.draft || state.sessionId !== ownerRef.current?.sessionId
      || state.draft.definition !== ownerRef.current.definition || state.previewMode || unavailable) {
      message.warning("当前添加目标已变化，请重新选择布局。");
      return;
    }
    let firstTargetId = "";
    const result = state.executeCommand({
      type: "transform-definition",
      label: `添加${TEMPLATE_LAYOUT_STARTERS.find((item) => item.id === kind)!.label}`,
      transform: (current) => {
        const added = addTemplateLayoutStarter(current, parentId, kind, index);
        firstTargetId = added.firstTargetId;
        return added.definition;
      },
    });
    if (!result.ok) { message.error(result.message); return; }
    if (result.changed) {
      useTemplateEditorSession.getState().selectObject(firstTargetId);
      onAdded?.(firstTargetId);
      close();
    }
  };
  return <Popover open={open && !unavailable} trigger="click" placement="bottom" afterOpenChange={(visible) => {
    if (visible) panelRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }} onOpenChange={(nextOpen) => {
    ownerRef.current = { sessionId, definition: draft?.definition };
    setOpen(nextOpen);
  }} content={<section ref={panelRef} className="template-editor__layout-starters" role="dialog" aria-label="选择常用布局" onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <strong>添加到：{parent?.name ?? "目标已失效"}{index !== undefined ? ` · 第 ${index + 1} 项` : " · 末尾"}</strong>
    <p>选择后建立以下分组；内容槽位同步生成页面字段，可一起撤销。</p>
    {TEMPLATE_LAYOUT_STARTERS.map((item) => {
      const reason = draft ? getTemplateLayoutStarterUnavailableReason(draft.definition, parentId, item.id) : "请重新选择目标。";
      return <button type="button" key={item.id} disabled={Boolean(reason)} title={reason ?? undefined} onClick={() => add(item.id)}>
        <strong>{item.label}</strong><span>{reason ?? item.description}</span>
      </button>;
    })}
    <Button aria-label="取消选择布局" onClick={close}>取消</Button>
  </section>}><Button ref={triggerRef} disabled={unavailable}>选择常用布局</Button></Popover>;
}
