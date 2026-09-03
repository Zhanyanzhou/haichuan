import type { PuckAction } from "@puckeditor/core";
import type { PuckProps } from "@/page-builder/types";
import { ROOT_ZONE } from "../editor-store";

export interface PageModuleData {
  type: string;
  props: PuckProps & { id: string };
}

function createCopyId(prefix: string) {
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
}

export function duplicatePageModule(
  dispatch: (action: PuckAction) => void,
  source: PageModuleData,
  sourceIndex: number,
  options: { preventDuplicate?: boolean } = {},
) {
  if (source.type === "首屏主视觉" || options.preventDuplicate) return sourceIndex;
  const duplicatedId = createCopyId("homepage-block");
  const duplicated = structuredClone(source);
  duplicated.props = {
    ...duplicated.props,
    id: duplicatedId,
    ...(typeof duplicated.props.instanceId === "string"
      ? { instanceId: createCopyId("instance") }
      : {}),
  };
  const destinationIndex = sourceIndex + 1;
  dispatch({
    type: "insert",
    componentType: duplicated.type,
    destinationIndex,
    destinationZone: ROOT_ZONE,
    id: duplicatedId,
    recordHistory: false,
  });
  dispatch({
    type: "replace",
    destinationIndex,
    destinationZone: ROOT_ZONE,
    data: duplicated,
    recordHistory: true,
  });
  dispatch({
    type: "setUi",
    ui: { itemSelector: { index: destinationIndex, zone: ROOT_ZONE } },
  });
  return destinationIndex;
}
