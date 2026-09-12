import {
  addDynamicTemplateNode,
  canNestDynamicTemplateNode,
  getDynamicTemplateNodeRegistryEntry,
  type DynamicTemplateNodeType,
  type TemplateDefinitionV2,
} from "../template-definition";
import { findDynamicTemplateInsertionParentId } from "./dynamicTemplateEditorUtils";
import { placeInsertedTemplateNode } from "./templateInsertionPlacement";
import { useTemplateEditorSession } from "./templateEditorSession";

export interface TemplateAuthoringInsertRequest {
  source: "capability-library" | "empty-canvas" | "inline-region";
  nodeType: DynamicTemplateNodeType;
  parentNodeId?: string | null;
  insertionIndex?: number;
}

export type TemplateAuthoringInsertResult =
  | {
      ok: true;
      changed: true;
      nodeId: string;
      parentNodeId: string;
      autoCreatedRegionId?: string;
      focusTarget: "inspector";
    }
  | {
      ok: false;
      changed: false;
      code: string;
      message: string;
    };

type TemplateEditorSession = ReturnType<typeof useTemplateEditorSession.getState>;

function resolveInsertionParent(
  definition: TemplateDefinitionV2,
  selectedNodeId: string | null,
  nodeType: DynamicTemplateNodeType,
) {
  return findDynamicTemplateInsertionParentId(definition, selectedNodeId, nodeType);
}

export function insertTemplateAuthoringNode(
  request: TemplateAuthoringInsertRequest,
  session: TemplateEditorSession = useTemplateEditorSession.getState(),
): TemplateAuthoringInsertResult {
  const draft = session.draft;
  if (!draft) {
    return {
      ok: false,
      changed: false,
      code: "NO_ACTIVE_DRAFT",
      message: "当前没有可编辑的模板草稿。",
    };
  }

  try {
    let definition = draft.definition;
    let autoCreatedRegionId: string | undefined;
    let parentNodeId = request.parentNodeId === undefined
      ? resolveInsertionParent(definition, session.selectedObjectId, request.nodeType)
      : request.parentNodeId;

    if (!parentNodeId) {
      const root = definition.nodes[definition.rootNodeId];
      if (
        !root
        || !canNestDynamicTemplateNode(root.type, "Container")
        || !canNestDynamicTemplateNode("Container", request.nodeType)
      ) {
        return {
          ok: false,
          changed: false,
          code: "NO_INSERTION_PARENT",
          message: `${getDynamicTemplateNodeRegistryEntry(request.nodeType).label}没有可用的插入位置。`,
        };
      }
      const region = addDynamicTemplateNode(
        definition,
        definition.rootNodeId,
        "Container",
      );
      definition = region.definition;
      parentNodeId = region.nodeId;
      autoCreatedRegionId = region.nodeId;
    }

    const inserted = addDynamicTemplateNode(
      definition,
      parentNodeId,
      request.nodeType,
      request.insertionIndex,
    );
    placeInsertedTemplateNode(inserted.definition, parentNodeId, inserted.nodeId);
    const applied = session.executeCommand({
      type: "replace-definition",
      label: `添加${getDynamicTemplateNodeRegistryEntry(request.nodeType).label}`,
      definition: inserted.definition,
    });
    if (!applied.ok || !applied.changed) {
      return {
        ok: false,
        changed: false,
        code: applied.code,
        message: applied.message,
      };
    }

    session.selectObject(inserted.nodeId);
    return {
      ok: true,
      changed: true,
      nodeId: inserted.nodeId,
      parentNodeId,
      ...(autoCreatedRegionId ? { autoCreatedRegionId } : {}),
      focusTarget: "inspector",
    };
  } catch (error) {
    return {
      ok: false,
      changed: false,
      code: "INSERT_FAILED",
      message: error instanceof Error ? error.message : "添加模板节点失败。",
    };
  }
}
