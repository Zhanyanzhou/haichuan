import {
  duplicateDynamicTemplateNode,
  DynamicTemplateRenderer,
  removeDynamicTemplateNode,
  setDynamicTemplateNodeHidden,
} from "../template-definition";
import type { TemplateDefinitionV2 } from "../template-definition";
import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import { isMatureContentTemplateSlotType } from "../template-definition/validateTemplateDefinition";
import type { DynamicTemplatePreviewScenario } from "./types";
import { useTemplateEditorSession } from "./templateEditorSession";
import TemplateViewportFrame from "./TemplateViewportFrame";

function parseRatio(value: string): number {
  const match = /^(\d+):(\d+)$/.exec(value);
  if (!match) return 1.6;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : 1.6;
}

function createPreviewContent(
  definition: TemplateDefinitionV2,
  scenario: DynamicTemplatePreviewScenario,
): Record<string, unknown> | undefined {
  const configuredPreview = {
    ...definition.defaultContent,
    ...(definition.previewContent ?? {}),
  };
  if (scenario === "default") return configuredPreview;
  const content: Record<string, unknown> = {};
  for (const slot of Object.values(definition.slots)) {
    const complexTypes = [
      "video", "carousel", "hotspot", "beforeAfter", "appointment",
      "productCard", "productCollection", "categoryCollection",
    ];
    if (complexTypes.includes(slot.type) || isMatureContentTemplateSlotType(slot.type)) {
      const source = configuredPreview[slot.slotId];
      const base = source && typeof source === "object" && !Array.isArray(source)
        ? structuredClone(source) as Record<string, unknown>
        : {};
      if (scenario === "missing-image") {
        if (isMatureContentTemplateSlotType(slot.type)) {
          for (const key of Object.keys(base)) {
            if (/(?:image|poster|cover)$/i.test(key) && typeof base[key] === "string") base[key] = "";
          }
        }
        if (slot.type === "video") base.posterUrl = "";
        if (slot.type === "carousel") {
          base.images = Array.isArray(base.images)
            ? base.images.map((item) => item && typeof item === "object" ? { ...item, url: "", mobileUrl: "" } : item)
            : [];
        }
        if (slot.type === "hotspot") {
          base.image = "";
          base.mobileImage = "";
        }
        if (slot.type === "beforeAfter") {
          base.beforeImage = "";
          base.afterImage = "";
        }
        if (slot.type === "appointment") base.backgroundImage = "";
        if (slot.type === "productCard") base.productCode = "";
        if (slot.type === "productCollection") base.productCodes = [];
        if (slot.type === "categoryCollection") base.categorySlugs = [];
        content[slot.slotId] = base;
      } else if (scenario === "long-text") {
        const longHeading = "这是用于验证复杂组件超长标题换行、截断与布局稳定性的示例文字";
        const longBody = "这是一段用于验证复杂组件长文案、无障碍说明和行动区域稳定性的预览内容。".repeat(5);
        for (const key of ["title", "beforeLabel", "afterLabel", "buttonText", "actionText"]) {
          if (key in base) base[key] = longHeading;
        }
        for (const key of ["subtitle", "summary", "videoDescription", "altText", "beforeAltText", "afterAltText"]) {
          if (key in base) base[key] = longBody;
        }
        content[slot.slotId] = base;
      } else {
        content[slot.slotId] = isMatureContentTemplateSlotType(slot.type)
          ? {}
          : slot.type === "carousel"
          ? { images: [] }
          : slot.type === "hotspot"
            ? { image: "", mobileImage: "", altText: "", hotspots: [], mobileHotspots: [] }
            : slot.type === "beforeAfter"
              ? { title: "", subtitle: "", beforeImage: "", afterImage: "", beforeLabel: "", afterLabel: "", actionText: "" }
              : slot.type === "appointment"
                ? { backgroundImage: "", title: "", subtitle: "", buttonText: "", altText: "" }
                : slot.type === "productCard"
                  ? { productCode: "", title: "", summary: "" }
                  : slot.type === "productCollection"
                    ? { productCodes: [], title: "", subtitle: "" }
                    : slot.type === "categoryCollection"
                      ? { categorySlugs: [], title: "", subtitle: "" }
                      : { videoUrl: "", posterUrl: "", videoDescription: "", title: "", subtitle: "", actionText: "" };
      }
      continue;
    }
    if (scenario === "missing-image" && slot.type !== "image") continue;
    if (scenario === "long-text") {
      if (["heading", "text", "richText", "badge", "icon"].includes(slot.type)) {
        content[slot.slotId] = slot.type === "heading"
          ? "这是用于验证超长标题在桌面端与移动端换行、截断和布局稳定性的示例文本"
          : "这是一段用于验证超长内容、换行规则、最大行数和溢出处理的预览文字。".repeat(5);
      } else if (slot.type === "button" || slot.type === "link") {
        content[slot.slotId] = { label: "用于验证超长行动文案的预览按钮" };
      }
      continue;
    }
    if (slot.type === "button" || slot.type === "link") content[slot.slotId] = { label: "" };
    else if (slot.type === "collection") content[slot.slotId] = [];
    else content[slot.slotId] = "";
  }
  return content;
}

function createEditingContent(
  definition: TemplateDefinitionV2,
): Record<string, unknown> {
  return {
    ...structuredClone(definition.defaultContent),
    ...structuredClone(definition.previewContent ?? {}),
  };
}

export default function DynamicTemplateCanvas() {
  const draft = useTemplateEditorSession((state) => state.draft);
  const device = useTemplateEditorSession((state) => state.device);
  const previewMode = useTemplateEditorSession((state) => state.previewMode);
  const previewScenario = useTemplateEditorSession((state) => state.previewScenario);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  const selectedContractRole = useTemplateEditorSession((state) => state.selectedContractRole);
  const selectObject = useTemplateEditorSession((state) => state.selectObject);
  const selectContractRole = useTemplateEditorSession((state) => state.selectContractRole);
  const setPreviewScenario = useTemplateEditorSession((state) => state.setPreviewScenario);
  const setDynamicDefinition = useTemplateEditorSession((state) => state.setDynamicDefinition);
  const dynamicDraft = draft;
  const sourceWidth = device === "mobile"
    ? dynamicDraft?.definition.metadata.previewMobileWidth ?? RESPONSIVE_CANVAS.mobile.width
    : dynamicDraft?.definition.metadata.previewDesktopWidth ?? RESPONSIVE_CANVAS.desktop.width;
  const ratio = parseRatio(
    device === "mobile"
      ? dynamicDraft?.definition.metadata.mobileRatio ?? "auto"
      : dynamicDraft?.definition.metadata.desktopRatio ?? "auto",
  );

  if (!dynamicDraft) return null;
  const previewContent = previewMode
    ? createPreviewContent(dynamicDraft.definition, previewScenario)
    : createEditingContent(dynamicDraft.definition);

  const commitSlotContent = (slotId: string, content: unknown) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft || !currentDraft.definition.slots[slotId]) return;
    const next = structuredClone(currentDraft.definition);
    next.previewContent ??= {};
    next.previewContent[slotId] = content;
    setDynamicDefinition(next);
  };

  const commitPlacement = (
    nodeId: string,
    targetDevice: "desktop" | "mobile",
    placement: NonNullable<TemplateDefinitionV2["nodes"][string]["responsive"]["desktop"]["placement"]>,
  ) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    const node = currentDraft?.definition.nodes[nodeId];
    if (!currentDraft || !node) return;
    const next = structuredClone(currentDraft.definition);
    next.nodes[nodeId].responsive[targetDevice].placement = placement;
    setDynamicDefinition(next);
  };
  const handleNodeAction = (
    nodeId: string,
    action: "duplicate" | "hide" | "delete" | "forward" | "backward",
  ) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    if (action === "duplicate") {
      const result = duplicateDynamicTemplateNode(currentDraft.definition, nodeId);
      setDynamicDefinition(result.definition);
      selectObject(result.nodeId);
      return;
    }
    if (action === "delete") {
      if (!window.confirm("删除当前节点及其子节点？可使用撤销恢复。")) return;
      setDynamicDefinition(removeDynamicTemplateNode(currentDraft.definition, nodeId));
      selectObject(currentDraft.definition.rootNodeId);
      return;
    }
    if (action === "hide") {
      setDynamicDefinition(setDynamicTemplateNodeHidden(currentDraft.definition, nodeId, true));
      selectObject(currentDraft.definition.rootNodeId);
      return;
    }
    const placement = currentDraft.definition.nodes[nodeId]?.responsive[device].placement;
    if (!placement) return;
    const next = structuredClone(currentDraft.definition);
    next.nodes[nodeId].responsive[device].placement = {
      ...placement,
      zIndex: Math.max(-10, Math.min(10, placement.zIndex + (action === "forward" ? 1 : -1))),
    };
    setDynamicDefinition(next);
  };

  const requestMediaReplace = () => {
    window.requestAnimationFrame(() => {
      const picker = document.querySelector<HTMLElement>('[data-media-field="dynamic-slot-default-content"]');
      const buttons = picker ? [...picker.querySelectorAll<HTMLButtonElement>("button")] : [];
      const directAction = picker?.querySelector<HTMLButtonElement>('[aria-label="点击更换当前图片"]')
        ?? buttons.find((button) => /替换图片|更换图片|本页素材/.test(button.textContent ?? ""));
      (directAction ?? buttons[0])?.focus();
      directAction?.click();
      picker?.scrollIntoView({ block: "nearest" });
    });
  };

  return (
    <section className="homepage-editor__stage template-editor__stage" aria-label={`${dynamicDraft.definition.name}模板设计画布`}>
      {previewMode ? (
        <div className="template-editor__canvas-edit-bar" aria-label="模板画布编辑状态">
          <strong>只读预览</strong>
          <label>
            <span>内容场景</span>
            <select
              aria-label="预览内容场景"
              value={previewScenario}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "default" || value === "empty" || value === "long-text" || value === "missing-image") {
                  setPreviewScenario(value);
                }
              }}
            >
              <option value="default">配置的预览示例</option>
              <option value="empty">全部空内容</option>
              <option value="long-text">超长文字</option>
              <option value="missing-image">图片缺失</option>
            </select>
          </label>
        </div>
      ) : null}
      <TemplateViewportFrame
        sourceWidth={sourceWidth}
        fallbackHeight={sourceWidth / Math.max(0.25, ratio)}
        title={`${dynamicDraft.definition.name}${device === "desktop" ? "桌面" : "移动"}模板隔离画布`}
      >
        <div
          className="template-editor__canvas-renderer template-editor__dynamic-canvas-renderer"
          data-preview-mode={previewMode || undefined}
          data-preview-scenario={previewMode ? previewScenario : undefined}
          style={{ width: sourceWidth }}
        >
          <DynamicTemplateRenderer
            definition={dynamicDraft.definition}
            device={device}
            contentBySlotId={previewContent}
            mode={previewMode ? "preview" : "editor"}
            editorSurface={previewMode ? undefined : "template-definition"}
            editorContentLayer={previewMode ? undefined : "preview"}
            selectedNodeId={selectedNodeId}
            selectedContractRole={selectedContractRole}
            onSelectNode={previewMode ? undefined : selectObject}
            onSelectContractRole={previewMode ? undefined : selectContractRole}
            onSlotContentCommit={previewMode ? undefined : commitSlotContent}
            onTemplatePlacementCommit={previewMode ? undefined : commitPlacement}
            onNodeAction={previewMode ? undefined : handleNodeAction}
            onRequestMediaReplace={previewMode ? undefined : requestMediaReplace}
          />
        </div>
      </TemplateViewportFrame>
    </section>
  );
}
