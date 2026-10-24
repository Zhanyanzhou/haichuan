import {
  DynamicTemplateOperationError,
  getDynamicTemplateStructureLockOwnerId,
  removeDynamicTemplateNode,
} from "../template-definition";
import {
  findContentTemplateEditableObject,
  getContentTemplateContract,
} from "../generated/contentTemplates.generated";
import { getContentTemplateModuleTypeForSlotType } from "../template-definition/validateTemplateDefinition";
import { setVisualOverridePath } from "../runtime/visualLayout";
import { describeDynamicTemplateRemoval, findDynamicTemplateParentId } from "./dynamicTemplateEditorUtils";
import { useTemplateEditorSession } from "./templateEditorSession";

export interface TemplateDeletionConfirmOptions {
  title: string;
  content: string;
  okText: string;
  cancelText: string;
  danger?: boolean;
  onOk: () => void;
}

export interface TemplateDeletionUi {
  confirm: (options: TemplateDeletionConfirmOptions) => void;
  notifyError: (content: string) => void;
}

function focusInspectorField(selector: string) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    const field = document.querySelector<HTMLElement>(selector);
    field?.scrollIntoView({ block: "nearest" });
    field?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }));
}

function locateStructureLock(lockOwnerId: string) {
  const session = useTemplateEditorSession.getState();
  session.selectObject(lockOwnerId);
  session.setInspectorTask("design");
  session.setInspectorView("context");
  focusInspectorField('[data-template-inspector-field="authoring.structureLocked"]');
}

function explainLockedDeletion(
  ui: TemplateDeletionUi,
  name: string,
  message: string,
  lockOwnerId: string | null,
) {
  ui.confirm({
    title: `无法删除“${name}”`,
    content: `${message} 请先解除该对象或上级的结构锁定，再删除。`,
    okText: lockOwnerId ? "定位锁定来源" : "知道了",
    cancelText: "继续保留",
    danger: false,
    onOk: () => {
      if (lockOwnerId) locateStructureLock(lockOwnerId);
    },
  });
}

function findRequiredSlotInSubtree(definition: ReturnType<typeof currentDefinition>, nodeId: string) {
  if (!definition) return null;
  const pending = [nodeId];
  while (pending.length) {
    const currentId = pending.shift()!;
    const node = definition.nodes[currentId];
    if (!node) continue;
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    if (slot?.required) return { nodeId: currentId, slot };
    pending.unshift(...node.childIds);
  }
  return null;
}

function currentDefinition() {
  return useTemplateEditorSession.getState().draft?.definition ?? null;
}

function reportCommandFailure(ui: TemplateDeletionUi, message: string, code?: string) {
  ui.notifyError(code === "STRUCTURE_LOCKED"
    ? `${message} 请先解除提示中对象或其上级对象的结构锁定后重试。`
    : `${message} 请检查当前模板结构后重试。`);
}

export function requestDeleteTemplateNode(nodeId: string, ui: TemplateDeletionUi) {
  const definition = currentDefinition();
  const node = definition?.nodes[nodeId];
  if (!definition || !node) return;
  if (nodeId === definition.rootNodeId) {
    window.dispatchEvent(new Event("template-editor:archive-current"));
    return;
  }

  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  const lockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, nodeId);
  if (lockOwnerId) {
    const ownerName = definition.nodes[lockOwnerId]?.name ?? "上级对象";
    explainLockedDeletion(
      ui,
      node.name,
      lockOwnerId === nodeId ? `“${node.name}”已锁定。` : `“${node.name}”位于已锁定的“${ownerName}”内。`,
      lockOwnerId,
    );
    return;
  }

  const parentId = findDynamicTemplateParentId(definition, nodeId);
  const selectParent = () => {
    useTemplateEditorSession.getState().selectObject(parentId ?? definition.rootNodeId);
  };

  if (slot?.required) {
    ui.confirm({
      title: `删除必填槽位“${slot.label}”？`,
      content: "该动作会先取消页面必填要求，再删除当前槽位；两步作为一次操作，可一次撤销恢复。",
      okText: "取消必填并删除",
      cancelText: "继续保留",
      danger: true,
      onOk: () => {
        const result = useTemplateEditorSession.getState().executeCommand({
          type: "transform-definition",
          label: "取消必填并删除槽位",
          transform: (current) => {
            const next = structuredClone(current);
            const currentSlotId = next.nodes[nodeId]?.slotId;
            if (!currentSlotId || !next.slots[currentSlotId]) return current;
            next.slots[currentSlotId].required = false;
            return removeDynamicTemplateNode(next, nodeId);
          },
        });
        if (!result.ok) {
          reportCommandFailure(ui, result.message, result.code);
          return;
        }
        selectParent();
      },
    });
    return;
  }

  try {
    removeDynamicTemplateNode(definition, nodeId);
  } catch (error) {
    if (
      error instanceof DynamicTemplateOperationError
      && error.code === "REQUIRED_SLOT_CANNOT_DELETE"
    ) {
      const requiredDescendant = findRequiredSlotInSubtree(definition, nodeId);
      const descendantLockOwnerId = requiredDescendant
        ? getDynamicTemplateStructureLockOwnerId(definition, requiredDescendant.nodeId)
        : null;
      ui.confirm({
        title: `无法删除“${node.name}”`,
        content: error.message,
        okText: descendantLockOwnerId ? "定位锁定来源" : "定位并取消必填",
        cancelText: "继续保留",
        danger: false,
        onOk: () => {
          if (!requiredDescendant) return;
          const session = useTemplateEditorSession.getState();
          session.selectObject(descendantLockOwnerId ?? requiredDescendant.nodeId);
          session.setInspectorTask(descendantLockOwnerId ? "design" : "page-scope");
          session.setInspectorView("context");
          focusInspectorField(descendantLockOwnerId
            ? '[data-template-inspector-field="authoring.structureLocked"]'
            : '[data-template-inspector-field="slot.required"]');
        },
      });
      return;
    }
    if (error instanceof DynamicTemplateOperationError && error.code === "STRUCTURE_LOCKED") {
      explainLockedDeletion(ui, node.name, error.message, lockOwnerId);
      return;
    }
    ui.notifyError(`${error instanceof Error ? error.message : "结构操作失败"} 请检查当前层级和锁定状态后重试。`);
    return;
  }

  ui.confirm({
    title: slot ? `删除“${node.name}”？` : `删除“${node.name}”及其内容？`,
    content: slot
      ? "该槽位将从当前草稿移除，可以撤销。已保存的模板版本保持原样。"
      : describeDynamicTemplateRemoval(definition, nodeId),
    okText: "删除节点",
    cancelText: "取消",
    danger: true,
    onOk: () => {
      const result = useTemplateEditorSession.getState().executeCommand({
        type: "transform-definition",
        label: "删除节点",
        transform: (current) => removeDynamicTemplateNode(current, nodeId),
      });
      if (!result.ok) {
        reportCommandFailure(ui, result.message, result.code);
        return;
      }
      selectParent();
    },
  });
}

export function requestRemoveContractRole(
  nodeId: string,
  roleId: string,
  label: string,
  ui: TemplateDeletionUi,
) {
  const definition = currentDefinition();
  const node = definition?.nodes[nodeId];
  if (!definition || !node) return;
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
  const contract = moduleType ? getContentTemplateContract(moduleType) : undefined;
  const editable = contract ? findContentTemplateEditableObject(contract, roleId) : undefined;
  const role = contract?.roles.find((item) => item.id === roleId);
  const lockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, nodeId);
  if (lockOwnerId) {
    explainLockedDeletion(
      ui,
      label,
      `“${label}”所在结构已锁定。`,
      lockOwnerId,
    );
    return;
  }
  if (!editable || role?.required || !editable.constraints.allowHide || !editable.capabilities.includes("visibility")) {
    ui.notifyError(role?.required
      ? `“${label}”是母模板合同必填内容，不能移出。请保留该内容，并在合同允许的范围内调整布局或样式。`
      : `“${label}”的母模板合同不允许移出。请保留该内容，并在合同允许的范围内调整布局或样式。`);
    return;
  }
  ui.confirm({
    title: `将“${label}”移出模板？`,
    content: "移出后当前草稿的画布不再显示该内容，可以撤销恢复。母模板合同和已保存版本不变。",
    okText: "移出",
    cancelText: "取消",
    danger: true,
    onOk: () => {
      const result = useTemplateEditorSession.getState().executeCommand({
        type: "transform-definition",
        label: "移出内容",
        transform: (current) => {
          const next = structuredClone(current);
          const target = next.nodes[nodeId];
          if (!target) return current;
          const layoutData = setVisualOverridePath(
            target.props.contentTemplateLayoutData,
            ["nodes", roleId, "enabled"],
            false,
          );
          if (layoutData) target.props.contentTemplateLayoutData = layoutData;
          else delete target.props.contentTemplateLayoutData;
          return next;
        },
      });
      if (!result.ok) reportCommandFailure(ui, result.message, result.code);
    },
  });
}
