import { useMemo } from "react";
import {
  canNestDynamicTemplateNode,
  DynamicTemplateRenderer,
  type TemplateDefinitionV2,
} from "@/page-builder/template-definition";
import { createTemplatePreviewContentBySlotId } from "@/page-builder/template-editor/templatePreviewModel";
import type { TemplateAuthoringInsertRequest } from "./templateAuthoringAdapter";

export default function TemplateBlueprintCanvas({
  definition,
  device,
  selectedNodeId,
  selectedContractRole,
  sessionId,
  onInsert,
  onSelectNode,
  onSelectContractRole,
  onCreateBlank,
  canCreate,
}: {
  definition: TemplateDefinitionV2 | null;
  device: "desktop" | "mobile";
  selectedNodeId: string | null;
  selectedContractRole: { nodeId: string; roleId: string } | null;
  sessionId: string | null;
  onInsert: (request: TemplateAuthoringInsertRequest) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectContractRole: (nodeId: string, roleId: string) => void;
  onCreateBlank: () => void;
  canCreate: boolean;
}) {
  const previewContent = useMemo(
    () => definition ? createTemplatePreviewContentBySlotId(definition) : {},
    [definition],
  );

  if (!definition) {
    return (
      <section className="template-design-workspace__canvas-empty" aria-label="尚未打开模板">
        <strong>从真正空模板开始</strong>
        <p>只建立模板身份和根节点，不自动加入图片、标题或正文。</p>
        <button type="button" disabled={!canCreate} onClick={onCreateBlank}>新建空白模板</button>
      </section>
    );
  }

  const root = definition.nodes[definition.rootNodeId];
  const empty = root.childIds.length === 0;

  return (
    <div className="template-design-workspace__canvas" data-template-canvas-device={device}>
      {empty ? (
        <section className="template-design-workspace__canvas-empty" aria-label="空模板首内容">
          <strong>这是一个真正空模板</strong>
          <p>先添加区域，或直接添加首个槽位；两者都可以一步撤销。</p>
          <div>
            <button
              type="button"
              data-template-insert-source="empty-canvas"
              onClick={() => onInsert({
                source: "empty-canvas",
                nodeType: "Container",
              })}
            >
              添加内容区域
            </button>
            <button
              type="button"
              data-template-insert-source="empty-canvas"
              onClick={() => onInsert({
                source: "empty-canvas",
                nodeType: "HeadingSlot",
              })}
            >
              添加标题槽位
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="template-design-workspace__renderer-stage">
            <DynamicTemplateRenderer
              definition={definition}
              device={device}
              contentBySlotId={previewContent}
              mode="editor"
              editorSurface="template-definition"
              interactionOwner="renderer"
              templateEditorSessionId={sessionId ?? undefined}
              selectedNodeId={selectedNodeId}
              selectedContractRole={selectedContractRole}
              onSelectNode={onSelectNode}
              onSelectContractRole={onSelectContractRole}
            />
          </div>
          <div className="template-design-workspace__inline-inserts" aria-label="区域内联添加入口">
            {root.childIds.map((nodeId) => {
              const node = definition.nodes[nodeId];
              if (!node || !canNestDynamicTemplateNode(node.type, "TextSlot")) return null;
              return (
                <button
                  key={nodeId}
                  type="button"
                  data-template-insert-source="inline-region"
                  onClick={() => onInsert({
                    source: "inline-region",
                    nodeType: "TextSlot",
                    parentNodeId: nodeId,
                  })}
                >
                  在“{node.name}”中添加正文槽位
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
