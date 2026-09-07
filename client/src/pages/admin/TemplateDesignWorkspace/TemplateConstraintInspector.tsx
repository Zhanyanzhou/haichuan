import DynamicTemplateInspectorPanel from "@/page-builder/template-editor/DynamicTemplateInspectorPanel";
import type { TemplateEditorDraft } from "@/page-builder/template-editor/types";

export default function TemplateConstraintInspector({
  draft,
  selectedNodeId,
  localOnly,
}: {
  draft: TemplateEditorDraft | null;
  selectedNodeId: string | null;
  localOnly: boolean;
}) {
  const selectedNode = draft && selectedNodeId
    ? draft.definition.nodes[selectedNodeId]
    : null;
  const selectedSlot = selectedNode?.slotId
    ? draft?.definition.slots[selectedNode.slotId]
    : null;
  const allowedOverrides = selectedNode?.instanceEditPolicy
    ? Object.entries(selectedNode.instanceEditPolicy)
        .filter(([, value]) => value === true)
        .map(([key]) => key)
    : [];

  if (!draft) {
    return <p className="template-design-workspace__empty-note">打开模板后可编辑默认值、约束和允许编辑范围。</p>;
  }

  return (
    <div className="template-design-workspace__inspector" data-inspector-focus-target tabIndex={-1}>
      <section className="template-design-workspace__constraint-summary" aria-label="当前允许编辑范围">
        <strong>{selectedNode?.name ?? "模板根节点"}</strong>
        {selectedSlot ? (
          <dl>
            <div><dt>必填</dt><dd>{selectedSlot.required ? "是" : "否"}</dd></div>
            <div><dt>页面可编辑</dt><dd>{selectedSlot.editable ? "是" : "否"}</dd></div>
            <div><dt>页面可隐藏</dt><dd>{selectedSlot.hideable ? "是" : "否"}</dd></div>
            <div>
              <dt>Allowed overrides</dt>
              <dd>{allowedOverrides.length > 0 ? allowedOverrides.join("、") : "未开放"}</dd>
            </div>
          </dl>
        ) : (
          <p>选择槽位后查看默认值、约束和页面允许覆盖范围。</p>
        )}
      </section>
      <DynamicTemplateInspectorPanel localOnly={localOnly} />
    </div>
  );
}
