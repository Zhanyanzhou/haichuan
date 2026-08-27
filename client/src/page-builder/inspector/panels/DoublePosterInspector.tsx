/**
 * DoublePosterInspector.tsx — 「双图文」专用对象化属性面板（实验）。
 *
 * 与通用 SchemaInspectorPanel 的差异：
 * - 选中谁就只显示谁的属性：模块级 / 主图 / 细节图 / 文案 四个对象各自成组；
 * - 顶部使用统一的模块级 / 对象级切换器；
 * - 视觉属性（比例/裁切/焦点/缩放/构图/排版）以图形卡片、九宫格、滑杆呈现；
 * - 写回只走 useInspectorModuleEditor.update（模块字段）与
 *   setVisualOverridePath(__instanceOverrides)（视觉覆盖），不新增数据源。
 *
 * 契约红线：比例选项一律由轴① getContractRoleRatioPresets 白名单派生（D.13），
 * 写 props 冒号格式；视觉覆盖稀疏写入、恢复默认只清对应路径（D.17）。
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { App as AntdApp } from "antd";
import InspectorTopBar from "../InspectorTopBar";
import InspectorDisclosure from "../InspectorDisclosure";
import InstanceOverridesPanel from "../InstanceOverridesPanel";
import InspectorPrimaryTabs, {
  type InspectorPrimaryMode,
} from "../InspectorPrimaryTabs";
import FieldRenderer from "../FieldRenderer";
import { useInspectorModuleEditor } from "../useInspectorModuleEditor";
import { doublePosterSchema } from "../schema/modules/doublePoster";
import {
  bgColorPresetField,
  ADVANCED_BG_COLOR_FIELD,
} from "../schema/shared";
import type { FieldDef, InspectorContext } from "../schema/types";
import type { PuckProps } from "../../types";
import { useVisualEditorSession } from "../../visual-editor/visualEditorSession";
import {
  resolveVisualNode,
  setVisualOverridePath,
  isVisualRecord,
  type VisualRect,
  type VisualViewport,
} from "../../runtime/visualLayout";
import {
  createContentTemplateMarker,
  extractContentTemplateLayoutData,
  getContentTemplateContract,
  getContentTemplateEditableFieldKeys,
  getContentTemplateEditableObject,
} from "../../generated/contentTemplates.generated";
import {
  applySharedTemplateDesignPatch,
  getSharedTemplateDesignSignatures,
} from "../../visual-editor/sharedTemplateDesign";
import {
  getContractRoleRatio,
  getContractRoleRatioPresets,
} from "../../config/blockContracts";
import {
  ROOT_ZONE,
  useHomepagePuck,
} from "../../../pages/admin/HomepageConfig/editor-store";
import { getModuleDisplayName } from "../../../pages/admin/HomepageConfig/editor-utils";
import DoublePosterMiniCanvas, {
  type DoublePosterObjectId,
} from "./DoublePosterMiniCanvas";

type PanelMode = InspectorPrimaryMode;
type ObjectId = DoublePosterObjectId;

interface DoublePosterInspectorProps {
  hasUnsavedChanges: boolean;
  saving: boolean;
  onSaveDraft: () => void;
  onSaveAsTemplate: (type: string, props: PuckProps) => void;
  publishIssues: Array<{
    blockId?: string;
    message: string;
    severity: "error" | "warning" | "info";
    path?: string;
  }>;
  validationState: "checking" | "current" | "stale" | "error";
}

/** 本面板专用对象命名（全局 VISUAL_NODE_LABELS 的「主海报/细节海报」不动） */
const OBJECT_LABELS: Record<ObjectId, string> = {
  mainImage: "主图",
  detailImage: "细节图",
  copy: "文案",
  action: "行动入口",
};

const isObjectId = (value: string): value is ObjectId =>
  Object.prototype.hasOwnProperty.call(OBJECT_LABELS, value);

const ISSUE_FIELD_TO_OBJECT: Record<string, ObjectId> = {
  mainImage: "mainImage",
  mainAltText: "mainImage",
  detailImage: "detailImage",
  detailAltText: "detailImage",
  number: "copy",
  label: "copy",
  title: "copy",
  description: "copy",
  actionText: "action",
  targetType: "action",
  linkUrl: "action",
  productId: "action",
};

function getIssueObjectId(issue: DoublePosterInspectorProps["publishIssues"][number]) {
  const source = `${issue.path ?? ""} ${issue.message}`;
  return Object.entries(ISSUE_FIELD_TO_OBJECT).find(([field]) =>
    new RegExp(`(^|[^a-zA-Z])${field}([^a-zA-Z]|$)`, "i").test(source),
  )?.[1];
}

function supportsCapabilityOnViewport(
  object: ReturnType<typeof getContentTemplateEditableObject>,
  capability: "layout" | "layer",
  viewport: VisualViewport,
) {
  if (!object?.capabilities.includes(capability)) return false;
  const allowedViewports = object.capabilityViewports?.[capability];
  return !allowedViewports || allowedViewports.includes(viewport);
}

const DOUBLE_POSTER_DESIGN_CAPABILITIES = new Set([
  "layout",
  "layer",
  "ratio",
  "size",
  "position",
  "fit",
  "zoom",
  "focus",
  "typography",
  "visibility",
]);

/** 比例形状短名（本地定义，保持面板自包含；与 shared.ts RATIO_SHAPE_LABELS 对齐） */
const RATIO_SHAPE_LABELS: Record<string, string> = {
  "1:1": "方形",
  "4:5": "竖版",
  "3:2": "横版",
  "4:3": "经典横版",
  "16:9": "宽屏",
  "21:9": "电影宽幕",
  "9:16": "竖屏",
  "3:4": "竖版",
};

const FIT_OPTIONS = [
  { value: "cover", label: "填满裁切" },
  { value: "contain", label: "完整显示" },
] as const;

const ALIGN_OPTIONS = [
  { value: "left", label: "左对齐" },
  { value: "center", label: "居中对齐" },
] as const;

const TEXT_SIZE_OPTIONS = [
  { value: "sm", label: "小字号" },
  { value: "md", label: "标准字号" },
  { value: "lg", label: "大字号" },
] as const;

/** 契约 sizePresets → typography.sizeLevel 档位 */
const SIZE_PRESET_TO_LEVEL: Record<string, "sm" | "md" | "lg"> = {
  small: "sm",
  standard: "md",
  large: "lg",
};

const TEXT_COLORS: Record<string, string> = {
  ink: "#181A1B",
  mineral: "#5F6568",
  ivory: "#FFFFFF",
};

const TEXT_COLOR_LABELS: Record<string, string> = {
  ink: "石墨黑",
  mineral: "矿物灰",
  ivory: "象牙白",
};

/** 斜杠比例预设（契约轴①）→ props 冒号格式 */
const slashToColon = (preset: string) =>
  preset.split("/").map((part) => part.trim()).join(":");

export default function DoublePosterInspector({
  hasUnsavedChanges,
  publishIssues,
  validationState,
  onSaveAsTemplate,
}: DoublePosterInspectorProps) {
  const { message, modal } = AntdApp.useApp();
  const editor = useInspectorModuleEditor();
  const [activePanelMode, setActivePanelMode] = useState<PanelMode>("content");
  const inspectorScrollRef = useRef<HTMLDivElement>(null);
  const pendingContentActionRef = useRef<ObjectId | null | undefined>(undefined);
  const [contentActionRevision, setContentActionRevision] = useState(0);
  const panelScrollPositionsRef = useRef<Record<PanelMode, number>>({
    content: 0,
    design: 0,
  });
  const pendingPanelScrollRef = useRef<{ mode: PanelMode; top: number } | null>(null);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const appData = useHomepagePuck((state) => state.appState.data);
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);
  const visualSelection = useVisualEditorSession((state) => state.selection);
  const contentActionRequest = useVisualEditorSession((state) => state.contentActionRequest);
  const selectVisualNode = useVisualEditorSession((state) => state.selectNode);
  const clearVisualNode = useVisualEditorSession((state) => state.clearNode);
  const setVisualPanelMode = useVisualEditorSession((state) => state.setPanelMode);
  const visualPanelMode = useVisualEditorSession((state) => state.panelMode);
  const editorBlockId = editor?.props.id;
  const activeCanvasGeometry = useVisualEditorSession((state) =>
    state.canvasGeometryByBlock[String(editorBlockId ?? "")]?.[editor?.device ?? "desktop"],
  );

  // 切换模块时重置 tab 与滚动位置（与 SchemaInspectorPanel 同模式）
  useEffect(() => {
    panelScrollPositionsRef.current = { content: 0, design: 0 };
    setActivePanelMode("content");
    setVisualPanelMode("content");
    window.requestAnimationFrame(() => {
      inspectorScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [editor?.moduleType, editorBlockId, setVisualPanelMode]);

  useEffect(() => {
    if (visualPanelMode !== activePanelMode) setActivePanelMode(visualPanelMode);
  }, [activePanelMode, visualPanelMode]);

  useLayoutEffect(() => {
    const pending = pendingPanelScrollRef.current;
    if (!pending || pending.mode !== activePanelMode) return;
    inspectorScrollRef.current?.scrollTo({ top: pending.top, behavior: "auto" });
    pendingPanelScrollRef.current = null;
  }, [activePanelMode]);

  useLayoutEffect(() => {
    if (!editor || pendingContentActionRef.current === undefined) return;
    const objectId = pendingContentActionRef.current;
    pendingContentActionRef.current = undefined;
    const fieldKey = objectId === "mainImage" || objectId === "detailImage"
      ? objectId
      : objectId === "action"
        ? "actionText"
        : "title";
    const focusField = () => {
      const field = inspectorScrollRef.current?.querySelector<HTMLElement>(
        `[data-inspector-field="${fieldKey}"]`,
      );
      if (!field) return;
      field.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (objectId === "mainImage" || objectId === "detailImage") {
        const replaceButton = Array.from(field.querySelectorAll<HTMLButtonElement>("button"))
          .find((button) => button.textContent?.includes("替换图片"));
        replaceButton?.click();
        window.requestAnimationFrame(() => {
          field.querySelector<HTMLElement>("[data-media-field], .ant-upload")?.focus();
        });
        return;
      }
      field.querySelector<HTMLElement>("input, textarea, button, [tabindex]")?.focus();
    };
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(focusField));
    return () => window.cancelAnimationFrame(frame);
  }, [contentActionRevision, editor]);

  useEffect(() => {
    if (!contentActionRequest || contentActionRequest.blockId !== editorBlockId ||
      !isObjectId(contentActionRequest.nodeId) || activePanelMode !== "content") return;
    pendingContentActionRef.current = contentActionRequest.nodeId;
    setContentActionRevision((revision) => revision + 1);
  }, [activePanelMode, contentActionRequest, editorBlockId]);

  useEffect(() => {
    if (!visualSelection || visualSelection.blockId !== editorBlockId ||
      !isObjectId(visualSelection.nodeId) || activePanelMode !== "content" ||
      (visualSelection.kind !== "text" && visualSelection.kind !== "action")) return;
    pendingContentActionRef.current = visualSelection.nodeId;
    setContentActionRevision((revision) => revision + 1);
  }, [activePanelMode, editorBlockId, visualSelection]);

  useEffect(() => {
    if (activePanelMode !== "design" || !editorBlockId || !visualSelection ||
      visualSelection.blockId !== editorBlockId) return;
    const editableObject = getContentTemplateEditableObject(
      editor?.moduleType ?? "",
      visualSelection.nodeId,
    );
    if (editableObject && !editableObject.capabilities.some((capability) =>
      DOUBLE_POSTER_DESIGN_CAPABILITIES.has(capability),
    )) {
      setActivePanelMode("content");
      setVisualPanelMode("content");
    }
  }, [activePanelMode, editor?.moduleType, editorBlockId, setVisualPanelMode, visualSelection]);

  if (!editor) return null;

  const props = editor.props;
  const viewport: VisualViewport = editor.device;
  const ctx: InspectorContext = {
    props,
    device: editor.device,
    viewportWidth: viewports.current.width,
  };

  const contract = getContentTemplateContract(editor.moduleType);
  const layoutOverrides = contract?.editorCapabilities.layoutOverrides;
  const editableObjects = contract?.editorCapabilities.editableObjects ?? [];
  const inspectorObjects = editableObjects.filter((object) => isObjectId(object.roleId));
  const copyRole = layoutOverrides?.textRoles?.find(
    (role) => role.roleId === "copy",
  );
  const mainSlot = layoutOverrides?.slots?.find(
    (slot) => slot.roleId === "mainImage",
  );
  const detailSlot = layoutOverrides?.slots?.find(
    (slot) => slot.roleId === "detailImage",
  );

  const currentEditableObject = visualSelection && visualSelection.blockId === props.id
    ? getContentTemplateEditableObject(editor.moduleType, visualSelection.nodeId)
    : undefined;
  const currentSelection = currentEditableObject && isObjectId(currentEditableObject.roleId)
    ? currentEditableObject.roleId
    : null;
  const currentPublishIssues = publishIssues.filter(
    (issue) => issue.severity !== "info" && issue.blockId === props.id,
  );
  const issueObjectIds = new Set(
    currentPublishIssues.map(getIssueObjectId).filter((objectId): objectId is ObjectId => Boolean(objectId)),
  );

  const fieldByKey = (key: string): FieldDef | undefined =>
    doublePosterSchema.sections
      .flatMap((section) => section.fields)
      .find((field) => field.key === key);

  const renderSchemaField = (key: string) => {
    const def = fieldByKey(key);
    if (!def) return null;
    return (
      <div
        key={key}
        className="homepage-editor__task-field"
        data-inspector-field={key}
      >
        <FieldRenderer
          def={def}
          ctx={ctx}
          update={editor.update}
          moduleType={editor.moduleType}
        />
      </div>
    );
  };

  /** 视觉覆盖稀疏写入：undefined/"" 删键（D.17），写回即时同步画布 */
  const applyVisual = (path: string[], value: unknown) => {
    editor.updateFromCurrent((currentProps) => ({
      __instanceOverrides: setVisualOverridePath(
        currentProps.__instanceOverrides,
        path,
        value,
      ),
      ...(currentProps.__contentTemplate
        ? {}
        : { __contentTemplate: createContentTemplateMarker(editor.moduleType) }),
    }));
  };

  const designDefaults: PuckProps = {
    ...(doublePosterSchema.defaults ?? {}),
    mainImageRatio: slashToColon(
      getContractRoleRatio("doublePoster", "mainImage", "desktop"),
    ),
    detailImageRatio: slashToColon(
      getContractRoleRatio("doublePoster", "detailImage", "desktop"),
    ),
  };
  const hasAnyOverride = Boolean(props.__instanceOverrides);
  const hasAnyDesignChange = hasAnyOverride ||
    ["bgColor", "mainImageRatio", "detailImageRatio"].some(
      (key) => Object.prototype.hasOwnProperty.call(designDefaults, key) &&
        (props[key] ?? designDefaults[key]) !== designDefaults[key],
    );
  const resetAllDesign = () => {
    editor.updateHistoryTransaction((currentProps) => {
      let overrides = setVisualOverridePath(
        currentProps.__instanceOverrides,
        ["frame"],
        undefined,
      );
      overrides = setVisualOverridePath(overrides, ["nodes"], undefined);
      return {
        __instanceOverrides: overrides,
        ...Object.fromEntries(
          ["bgColor", "mainImageRatio", "detailImageRatio"]
            .filter((key) => Object.prototype.hasOwnProperty.call(designDefaults, key))
            .map((key) => [key, structuredClone(designDefaults[key])]),
        ),
      };
    });
  };

  const commitPanelMode = (panelMode: PanelMode) => {
    const targetScrollTop = panelScrollPositionsRef.current[panelMode];
    if (panelMode !== activePanelMode && inspectorScrollRef.current) {
      panelScrollPositionsRef.current[activePanelMode] =
        inspectorScrollRef.current.scrollTop;
      pendingPanelScrollRef.current = { mode: panelMode, top: targetScrollTop };
    }
    setActivePanelMode(panelMode);
    setVisualPanelMode(panelMode);
  };

  const activatePanelMode = (panelMode: PanelMode) => {
    if (panelMode !== "design" || activePanelMode === "design") {
      commitPanelMode(panelMode);
      return;
    }
    const content = appData.content as Array<{
      type: string;
      props: PuckProps & { id: string };
    }>;
    if (getSharedTemplateDesignSignatures(content, editor.moduleType).size <= 1) {
      commitPanelMode("design");
      return;
    }
    modal.confirm({
      title: "统一本页同类模板设计？",
      content: "本页双图海报存在不同设计。进入模板编辑会以当前选中模块为基准统一全部双图海报，各自内容保持不变。",
      okText: "统一并进入",
      cancelText: "取消",
      onOk: () => {
        dispatch({
          type: "setData",
          data: {
            ...appData,
            content: applySharedTemplateDesignPatch(content, editor.moduleType, {
              __instanceOverrides: extractContentTemplateLayoutData(
                editor.moduleType,
                editor.props,
              ),
            }),
          },
          recordHistory: true,
        });
        commitPanelMode("design");
      },
      onCancel: () => commitPanelMode("content"),
    });
  };

  const selectObject = (objectId: ObjectId | null) => {
    if (!objectId) {
      clearVisualNode(String(props.id ?? ""));
      return;
    }
    const editableObject = getContentTemplateEditableObject(editor.moduleType, objectId);
    if (!editableObject) return;
    const kind = editableObject.kind === "video"
      ? "media"
      : editableObject.kind === "collection"
        ? "structured"
        : editableObject.kind;
    selectVisualNode({
      blockId: String(props.id ?? ""),
      moduleType: editor.moduleType,
      nodeId: objectId,
      kind,
    });
    if (activePanelMode === "design" && objectId === "action") {
      activatePanelMode("content");
    }
  };

  const updateImageRatio = (
    objectId: "mainImage" | "detailImage",
    colonValue: string,
    sourceRect = activeCanvasGeometry?.nodes[objectId],
    frameAspectRatio = activeCanvasGeometry?.frameAspectRatio,
  ) => {
    const ratio = Number(colonValue.split(":")[0]) / Number(colonValue.split(":")[1]);
    const ratioPropKey = objectId === "mainImage" ? "mainImageRatio" : "detailImageRatio";
    const editableObject = getContentTemplateEditableObject(editor.moduleType, objectId);
    const nextHeight = sourceRect && frameAspectRatio && Number.isFinite(ratio) && ratio > 0
      ? Math.min(
          1 - sourceRect.y,
          Math.max(
            editableObject?.constraints.minSize.height ?? 0.08,
            Math.min(
              editableObject?.constraints.maxSize.height ?? 1,
              sourceRect.width * frameAspectRatio / ratio,
            ),
          ),
        )
      : undefined;
    editor.updateFromCurrent((currentProps) => {
      const nextOverrides = nextHeight === undefined || !sourceRect
        ? currentProps.__instanceOverrides
        : setVisualOverridePath(
            currentProps.__instanceOverrides,
            ["nodes", objectId, "rectByViewport", viewport],
            { ...sourceRect, height: nextHeight },
          );
      return {
        [ratioPropKey]: colonValue,
        __instanceOverrides: nextOverrides,
        ...(currentProps.__contentTemplate
          ? {}
          : { __contentTemplate: createContentTemplateMarker(editor.moduleType) }),
      };
    });
  };

  const renderLayerOrder = (roleId: ObjectId) => {
    const editableObject = getContentTemplateEditableObject(editor.moduleType, roleId);
    if (!supportsCapabilityOnViewport(editableObject, "layer", viewport)) return null;
    const overrides = isVisualRecord(props.__instanceOverrides)
      ? props.__instanceOverrides
      : {};
    const nodes = isVisualRecord(overrides.nodes) ? overrides.nodes : {};
    const node = isVisualRecord(nodes[roleId]) ? nodes[roleId] : {};
    const zIndexByViewport = isVisualRecord(node.zIndexByViewport)
      ? node.zIndexByViewport
      : {};
    const inherited = viewport === "mobile"
      ? zIndexByViewport.mobile ?? zIndexByViewport.desktop
      : zIndexByViewport.desktop;
    const current = Number.isInteger(Number(inherited)) ? Number(inherited) : 2;
    const deviceLabel = viewport === "mobile" ? "移动端" : "桌面端";
    const setLayer = (next: number) => applyVisual(
      ["nodes", roleId, "zIndexByViewport", viewport],
      next,
    );
    return (
      <div
        className="homepage-editor__visual-preset-group"
        role="group"
        data-inspector-control="layer"
        aria-label={`图层顺序（${deviceLabel}）`}
      >
        <span>图层顺序 · 当前层级 {current}</span>
        <div className="homepage-editor__choice-cards is-layer-order">
          <button type="button" onClick={() => setLayer(0)} disabled={current <= 0}>
            <em>置于底层</em>
          </button>
          <button type="button" onClick={() => setLayer(Math.max(0, current - 1))} disabled={current <= 0}>
            <em>下移一层</em>
          </button>
          <button type="button" onClick={() => setLayer(Math.min(20, current + 1))} disabled={current >= 20}>
            <em>上移一层</em>
          </button>
          <button type="button" onClick={() => setLayer(20)} disabled={current >= 20}>
            <em>置于顶层</em>
          </button>
        </div>
      </div>
    );
  };

  const renderObjectGeometry = (roleId: ObjectId) => {
    const editableObject = getContentTemplateEditableObject(editor.moduleType, roleId);
    if (!supportsCapabilityOnViewport(editableObject, "layout", viewport)) return null;
    const contractRect = contract?.defaultGeometryByViewport[viewport].zones.find(
      (zone) => zone.roleId === roleId,
    )?.rect;
    const rect = resolveVisualNode(props, roleId, viewport).rect ??
      activeCanvasGeometry?.nodes[roleId] ?? contractRect;
    if (!rect) return null;
    const minSize = editableObject?.constraints.minSize ?? { width: 0.08, height: 0.08 };
    const maxSize = editableObject?.constraints.maxSize ?? { width: 1, height: 1 };
    const applyRect = (next: VisualRect) => applyVisual(
      ["nodes", roleId, "rectByViewport", viewport],
      {
        x: Math.max(0, Math.min(1 - next.width, next.x)),
        y: Math.max(0, Math.min(1 - next.height, next.y)),
        width: Math.max(minSize.width, Math.min(maxSize.width, 1 - next.x, next.width)),
        height: Math.max(minSize.height, Math.min(maxSize.height, 1 - next.y, next.height)),
      },
    );
    const updateRect = (key: keyof VisualRect, percent: number) => {
      const value = percent / 100;
      if (key === "x") applyRect({ ...rect, x: Math.min(1 - rect.width, value) });
      else if (key === "y") applyRect({ ...rect, y: Math.min(1 - rect.height, value) });
      else if (key === "width") applyRect({ ...rect, width: value });
      else applyRect({ ...rect, height: value });
    };
    const moveTo = (x: number, y: number) => {
      const nextX = x === 0 ? 0 : x === 100 ? 1 - rect.width : (1 - rect.width) / 2;
      const nextY = y === 0 ? 0 : y === 100 ? 1 - rect.height : (1 - rect.height) / 2;
      applyRect({ ...rect, x: nextX, y: nextY });
    };
    return (
      <>
        <div
          className="homepage-editor__visual-preset-group"
          role="group"
          aria-label={`${OBJECT_LABELS[roleId]}快速定位（${viewport === "mobile" ? "移动端" : "桌面端"}）`}
          data-inspector-control="position"
        >
          <span>位置与尺寸</span>
          <div className="homepage-editor__geometry-visual-row">
            <div className="homepage-editor__nine-point-grid" aria-label="快速定位">
              {[0, 50, 100].flatMap((y) => [0, 50, 100].map((x) => {
                const targetX = x === 0 ? 0 : x === 100 ? 1 - rect.width : (1 - rect.width) / 2;
                const targetY = y === 0 ? 0 : y === 100 ? 1 - rect.height : (1 - rect.height) / 2;
                const active = Math.abs(rect.x - targetX) < 0.02 && Math.abs(rect.y - targetY) < 0.02;
                return (
                  <button
                    key={`${x}-${y}`}
                    type="button"
                    aria-label={`位置：${y === 0 ? x === 0 ? "左上" : x === 50 ? "顶部居中" : "右上" : y === 50 ? x === 0 ? "左侧居中" : x === 50 ? "居中" : "右侧居中" : x === 0 ? "左下" : x === 50 ? "底部居中" : "右下"}`}
                    aria-pressed={active}
                    className={active ? "is-active" : undefined}
                    onClick={() => moveTo(x, y)}
                  />
                );
              }))}
            </div>
            <dl className="homepage-editor__geometry-readout" aria-label="当前位置与尺寸">
              <div><dt>X</dt><dd>{Math.round(rect.x * 100)}%</dd></div>
              <div><dt>Y</dt><dd>{Math.round(rect.y * 100)}%</dd></div>
              <div><dt>W</dt><dd>{Math.round(rect.width * 100)}%</dd></div>
              <div><dt>H</dt><dd>{Math.round(rect.height * 100)}%</dd></div>
            </dl>
          </div>
        </div>
        <InspectorDisclosure label="精确位置与尺寸">
          <div className="homepage-editor__geometry-fields">
            {([
              ["x", "横向位置", 0, 1 - rect.width],
              ["y", "纵向位置", 0, 1 - rect.height],
              ["width", "宽度", minSize.width, Math.min(maxSize.width, 1 - rect.x)],
              ["height", "高度", minSize.height, Math.min(maxSize.height, 1 - rect.y)],
            ] as const).map(([key, label, min, max]) => (
              <label key={key} className="homepage-editor__instance-field">
                <span>{label} · {Math.round(rect[key] * 100)}%</span>
                <input
                  type="range"
                  aria-label={`${label}（${viewport === "mobile" ? "移动端" : "桌面端"}）`}
                  min={Math.round(min * 100)}
                  max={Math.round(max * 100)}
                  step={1}
                  value={Math.round(rect[key] * 100)}
                  onChange={(event) => updateRect(key, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
        </InspectorDisclosure>
      </>
    );
  };

  const removeModule = () => {
    const content = appData.content as Array<{
      type: string;
      props: PuckProps;
    }>;
    const index = content.findIndex((item) => item.props?.id === props.id);
    if (index < 0) return;
    if (content[index].props?.locked) {
      message.info("此模块已锁定，不能删除");
      return;
    }
    modal.confirm({
      title: `删除“${getModuleDisplayName(editor.moduleType, props)}”？`,
      content: "删除后可通过顶部撤销恢复；保存草稿前不会影响前台页面。",
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        dispatch({
          type: "remove",
          index,
          zone: ROOT_ZONE,
        });
        dispatch({ type: "setUi", ui: { itemSelector: null } });
      },
    });
  };

  const toggleVisibility = () => {
    editor.update({ isVisible: props.isVisible === false });
  };

  /* ---------------- 图片级设计控件 ---------------- */

  const renderImageDesign = (roleId: "mainImage" | "detailImage") => {
    const slot = roleId === "mainImage" ? mainSlot : detailSlot;
    const ratioPropKey = roleId === "mainImage" ? "mainImageRatio" : "detailImageRatio";
    const focusKeyX = roleId === "mainImage" ? "mainFocusX" : "detailFocusX";
    const focusKeyY = roleId === "mainImage" ? "mainFocusY" : "detailFocusY";
    const visualNode = resolveVisualNode(props, roleId, viewport);
    const ratioPresets = getContractRoleRatioPresets(
      "doublePoster",
      roleId,
      viewport,
    );
    const currentRatio = String(props[ratioPropKey] ?? designDefaults[ratioPropKey] ?? "");
    const currentFit = visualNode.fit ?? "cover";
    const currentFocus = visualNode.focus ?? {
      x: Number(props[focusKeyX]) || 50,
      y: Number(props[focusKeyY]) || 50,
    };
    const zoomSpec = slot?.zoom ?? { min: 1, max: 1.5, step: 0.05 };
    const currentZoom = visualNode.zoom ?? 1;
    const defaultRatio = designDefaults[ratioPropKey];
    const roleHasDesignOverride = isVisualRecord(props.__instanceOverrides) &&
      isVisualRecord(props.__instanceOverrides.nodes) &&
      isVisualRecord(props.__instanceOverrides.nodes[roleId]);
    const ratioChanged = defaultRatio !== undefined && props[ratioPropKey] !== defaultRatio;
    const resetImageDesign = () => {
      editor.updateHistoryTransaction((currentProps) => ({
        __instanceOverrides: setVisualOverridePath(
          currentProps.__instanceOverrides,
          ["nodes", roleId],
          undefined,
        ),
        ...(defaultRatio === undefined ? {} : { [ratioPropKey]: defaultRatio }),
      }));
    };

    return (
      <>
        <div className="homepage-editor__visual-preset-group" role="group" aria-label="画面比例" data-inspector-control="ratio">
          <span>画面比例</span>
          <div className="homepage-editor__ratio-cards">
            {ratioPresets.map((preset) => {
              const colonValue = slashToColon(preset);
              return (
                <button
                  key={preset}
                  type="button"
                  className={currentRatio === colonValue ? "is-active" : ""}
                  aria-pressed={currentRatio === colonValue}
                  onClick={() => updateImageRatio(roleId, colonValue)}
                >
                  <i style={{ aspectRatio: preset }} aria-hidden="true" />
                  <em>
                    {RATIO_SHAPE_LABELS[colonValue]
                      ? `${RATIO_SHAPE_LABELS[colonValue]} ${colonValue}`
                      : colonValue}
                  </em>
                </button>
              );
            })}
          </div>
        </div>

        <div className="homepage-editor__visual-preset-group" role="group" aria-label="填充方式" data-inspector-control="fit">
          <span>填充方式</span>
          <div className="homepage-editor__choice-cards is-fit">
            {FIT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={currentFit === option.value ? "is-active" : ""}
                aria-pressed={currentFit === option.value}
                onClick={() =>
                  applyVisual(["nodes", roleId, "mediaView", "fit"], option.value)
                }
              >
                <i data-choice={option.value} aria-hidden="true"><b /></i>
                <em>{option.label}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="homepage-editor__visual-preset-group" role="group" aria-label={`${OBJECT_LABELS[roleId]}画面焦点（${viewport === "mobile" ? "移动端" : "桌面端"}）`} data-inspector-control="focus">
          <span>画面焦点</span>
          <div className="homepage-editor__nine-point-grid">
            {[0, 50, 100].map((y) =>
              [0, 50, 100].map((x) => (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  aria-label={`焦点：${y === 0 ? x === 0 ? "左上" : x === 50 ? "顶部居中" : "右上" : y === 50 ? x === 0 ? "左侧居中" : x === 50 ? "居中" : "右侧居中" : x === 0 ? "左下" : x === 50 ? "底部居中" : "右下"}`}
                  aria-pressed={currentFocus.x === x && currentFocus.y === y}
                  className={
                    currentFocus.x === x && currentFocus.y === y ? "is-active" : ""
                  }
                  data-focus-x={x}
                  data-focus-y={y}
                  onClick={() =>
                    applyVisual(
                      ["nodes", roleId, "mediaView", "focusByViewport", viewport],
                      { x, y },
                    )
                  }
                />
              )),
            )}
          </div>
        </div>

        <label className="homepage-editor__instance-field" data-inspector-control="zoom">
          <span>画面缩放 · {currentZoom.toFixed(2)}×</span>
          <input
            type="range"
            min={zoomSpec.min}
            max={zoomSpec.max}
            step={zoomSpec.step}
            value={currentZoom}
            onChange={(event) => {
              const next = Number(event.target.value);
              applyVisual(
                ["nodes", roleId, "mediaView", "zoom"],
                next === 1 ? undefined : next,
              );
            }}
          />
        </label>

        {renderObjectGeometry(roleId)}
        {renderLayerOrder(roleId)}
        <InspectorDisclosure label="高级设置">
          <div className="homepage-editor__advanced-settings-grid">
            <button
              type="button"
              className="homepage-editor__field-reset"
              disabled={editor.historyTransactionPending || (!roleHasDesignOverride && !ratioChanged)}
              onClick={resetImageDesign}
            >
              恢复{OBJECT_LABELS[roleId]}全部设计
            </button>
          </div>
        </InspectorDisclosure>
      </>
    );
  };

  /* ---------------- 文案级设计控件 ---------------- */

  const renderCopyDesign = () => {
    const editableObject = getContentTemplateEditableObject(editor.moduleType, "copy");
    const usesManagedFlow = !supportsCapabilityOnViewport(
      editableObject,
      "layout",
      viewport,
    );
    const overrides = isVisualRecord(props.__instanceOverrides)
      ? props.__instanceOverrides
      : {};
    const nodes = isVisualRecord(overrides.nodes) ? overrides.nodes : {};
    const copyNode = isVisualRecord(nodes.copy) ? nodes.copy : {};
    const rectByViewport = isVisualRecord(copyNode.rectByViewport)
      ? copyNode.rectByViewport
      : {};
    const zIndexByViewport = isVisualRecord(copyNode.zIndexByViewport)
      ? copyNode.zIndexByViewport
      : {};
    const hasManagedFlowPositionOverride = usesManagedFlow && (
      Object.prototype.hasOwnProperty.call(rectByViewport, viewport) ||
      Object.prototype.hasOwnProperty.call(zIndexByViewport, viewport)
    );
    const typography = resolveVisualNode(props, "copy", viewport).typography ?? {};
    const sizePresets = copyRole?.sizePresets ?? ["small", "standard", "large"];
    const alignPresets = copyRole?.align ?? ["left", "center"];
    const colorTokens = copyRole?.colorTokens ?? ["ink", "mineral", "ivory"];
    const currentSize = typography.sizeLevel ?? "md";
    const currentAlign = typography.align ?? "left";
    const currentColor = typography.color ?? TEXT_COLORS.ink;
    const currentLineHeight = typography.lineHeight ?? 1.5;
    const currentLetterSpacing = typography.letterSpacing ?? 0;
    const copyEnabled = resolveVisualNode(props, "copy", viewport).enabled ?? true;

    return (
      <>
        <label className="homepage-editor__instance-toggle">
          <input
            type="checkbox"
            checked={copyEnabled}
            onChange={(event) =>
              applyVisual(
                ["nodes", "copy", "enabled"],
                event.target.checked ? undefined : false,
              )
            }
          />
          <span>显示这段文字</span>
        </label>

        <div className="homepage-editor__visual-preset-group" role="group" aria-label="对齐方式">
          <span>对齐方式</span>
          <div className="homepage-editor__choice-cards is-align">
            {ALIGN_OPTIONS.filter((option) =>
              alignPresets.includes(option.value),
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                className={currentAlign === option.value ? "is-active" : ""}
                aria-pressed={currentAlign === option.value}
                onClick={() =>
                  applyVisual(["nodes", "copy", "typography", "align"], option.value)
                }
              >
                <i data-choice={option.value} aria-hidden="true"><b /></i>
                <em>{option.label}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="homepage-editor__visual-preset-group" role="group" aria-label="字号">
          <span>字号</span>
          <div className="homepage-editor__choice-cards is-size">
            {TEXT_SIZE_OPTIONS.filter((option) =>
              sizePresets.some(
                (preset) => SIZE_PRESET_TO_LEVEL[preset] === option.value,
              ),
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                className={currentSize === option.value ? "is-active" : ""}
                aria-pressed={currentSize === option.value}
                onClick={() =>
                  applyVisual(
                    ["nodes", "copy", "typography", "sizeLevel"],
                    option.value === "md" ? undefined : option.value,
                  )
                }
              >
                <i data-choice={option.value} aria-hidden="true"><b /></i>
                <em>{option.label}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="homepage-editor__visual-preset-group" role="group" aria-label="文字颜色">
          <span>文字颜色</span>
          <div className="homepage-editor__color-cards">
            {colorTokens.map((token) => (
              <button
                key={token}
                type="button"
                aria-label={TEXT_COLOR_LABELS[token] ?? token}
                className={currentColor === TEXT_COLORS[token] ? "is-active" : ""}
                aria-pressed={currentColor === TEXT_COLORS[token]}
                onClick={() =>
                  applyVisual(
                    ["nodes", "copy", "typography", "color"],
                    token === "ink" ? undefined : TEXT_COLORS[token],
                  )
                }
              >
                <i style={{ background: TEXT_COLORS[token] }} aria-hidden="true" />
                <em>{TEXT_COLOR_LABELS[token] ?? token}</em>
              </button>
            ))}
          </div>
        </div>

        <label className="homepage-editor__instance-field">
          <span>行距 · {currentLineHeight.toFixed(2)}</span>
          <input
            type="range"
            min={1}
            max={2.5}
            step={0.05}
            value={currentLineHeight}
            onChange={(event) => {
              const next = Number(event.target.value);
              applyVisual(
                ["nodes", "copy", "typography", "lineHeight"],
                next === 1.5 ? undefined : next,
              );
            }}
          />
        </label>

        <label className="homepage-editor__instance-field">
          <span>字间距 · {currentLetterSpacing.toFixed(2)}em</span>
          <input
            type="range"
            min={-0.05}
            max={0.5}
            step={0.01}
            value={currentLetterSpacing}
            onChange={(event) => {
              const next = Number(event.target.value);
              applyVisual(
                ["nodes", "copy", "typography", "letterSpacing"],
                next === 0 ? undefined : next,
              );
            }}
          />
        </label>

        {usesManagedFlow ? (
          <div className="homepage-editor__design-scope-note" role="note">
            <strong>位置由模板流式布局控制</strong>
            <span>保持主图、说明、细节图与行动入口的固定阅读顺序；文字显隐与排版仍可独立调整。</span>
            {hasManagedFlowPositionOverride ? (
              <button
                type="button"
                className="homepage-editor__inline-reset"
                disabled={editor.historyTransactionPending}
                onClick={() => editor.updateHistoryTransaction((currentProps) => {
                  let next = currentProps.__instanceOverrides;
                  next = setVisualOverridePath(
                    next,
                    ["nodes", "copy", "rectByViewport", viewport],
                    undefined,
                  );
                  next = setVisualOverridePath(
                    next,
                    ["nodes", "copy", "zIndexByViewport", viewport],
                    undefined,
                  );
                  return { __instanceOverrides: next };
                })}
              >
                恢复{viewport === "mobile" ? "移动端" : "桌面端"}模板布局
              </button>
            ) : null}
          </div>
        ) : null}

        {renderLayerOrder("copy")}
        <InspectorDisclosure label="高级设置">
          <div className="homepage-editor__advanced-settings-grid">
            <button
              type="button"
              className="homepage-editor__field-reset"
              disabled={editor.historyTransactionPending ||
                !isVisualRecord(props.__instanceOverrides) ||
                !isVisualRecord(props.__instanceOverrides.nodes) ||
                !isVisualRecord(props.__instanceOverrides.nodes.copy)}
              onClick={() => editor.updateHistoryTransaction((currentProps) => ({
                __instanceOverrides: setVisualOverridePath(
                  currentProps.__instanceOverrides,
                  ["nodes", "copy"],
                  undefined,
                ),
              }))}
            >
              恢复文案设计默认
            </button>
          </div>
        </InspectorDisclosure>
      </>
    );
  };

  /* ---------------- 模块级设计控件 ---------------- */

  const renderModuleDesign = () => (
    <>
      <InstanceOverridesPanel
        moduleType={editor.moduleType}
        props={props}
        update={editor.update}
        updateHistoryTransaction={editor.updateHistoryTransaction}
        historyTransactionPending={editor.historyTransactionPending}
        scopes={["layout"]}
        embedded
        viewport={viewport}
      />

      <FieldRenderer
        def={bgColorPresetField()}
        ctx={ctx}
        update={editor.update}
        moduleType={editor.moduleType}
      />

      <InspectorDisclosure label="高级设置">
        <div className="homepage-editor__advanced-settings-grid">
          <FieldRenderer
            def={ADVANCED_BG_COLOR_FIELD}
            ctx={ctx}
            update={editor.update}
            moduleType={editor.moduleType}
          />
          <button
            type="button"
            className="homepage-editor__field-reset"
            disabled={editor.historyTransactionPending || !hasAnyDesignChange}
            onClick={resetAllDesign}
          >
            恢复模块及全部对象设计
          </button>
        </div>
      </InspectorDisclosure>
    </>
  );

  /* ---------------- 内容页字段集 ---------------- */

  const renderContentFields = () => {
    if (currentSelection) {
      const fieldKeys = getContentTemplateEditableFieldKeys(
        editor.moduleType,
        currentSelection,
      );
      return (
        <>
          {fieldKeys.map(renderSchemaField)}
          {currentSelection === "mainImage" || currentSelection === "detailImage" ? (
            <button
              type="button"
              className="homepage-editor__task-bridge"
              onClick={() => activatePanelMode("design")}
            >
              继续调整{OBJECT_LABELS[currentSelection]}构图与布局
            </button>
          ) : null}
        </>
      );
    }
    return (
      <>
        {renderSchemaField("title")}
        {renderSchemaField("description")}
        {renderSchemaField("number")}
        {renderSchemaField("label")}
        {renderSchemaField("actionText")}
        {renderSchemaField("targetType")}
      </>
    );
  };

  const renderDesignFields = () => {
    if (currentSelection === "mainImage" || currentSelection === "detailImage") {
      return renderImageDesign(currentSelection);
    }
    if (currentSelection === "copy") {
      return renderCopyDesign();
    }
    if (currentSelection === "action") return null;
    return renderModuleDesign();
  };

  const currentObjectCanEditDesign = currentEditableObject
    ? currentEditableObject.capabilities.some((capability) =>
        DOUBLE_POSTER_DESIGN_CAPABILITIES.has(capability),
      )
    : true;

  return (
    <section
      className="homepage-editor__inspector homepage-editor__dp-panel"
      data-inspector-root="visual-properties"
      data-active-device={editor.device}
      data-module-type={editor.moduleType}
      aria-label="属性面板"
    >
      <InspectorTopBar
        displayName="双图文"
        moduleName={
          typeof props.moduleName === "string" ? props.moduleName : ""
        }
        deviceLabel={editor.device === "mobile" ? "移动端" : "桌面端"}
        dirty={hasUnsavedChanges}
        onClose={editor.close}
        actions={[
          ...(editor.dirty
            ? [{ key: "revert", label: "撤销本区修改", onClick: editor.revert }]
            : []),
          {
            key: "visibility",
            label: props.isVisible === false ? "取消隐藏模块" : "隐藏模块",
            onClick: toggleVisibility,
          },
          { key: "remove", label: "删除模块", danger: true, onClick: removeModule },
        ]}
      />

      <InspectorPrimaryTabs
        activeMode={activePanelMode}
        designDisabled={!currentObjectCanEditDesign}
        onChange={activatePanelMode}
      />

      <DoublePosterMiniCanvas
        props={props}
        mode={activePanelMode}
        selectedObjectId={currentSelection}
        availableObjectIds={inspectorObjects.map((object) => object.roleId as ObjectId)}
        issueObjectIds={issueObjectIds}
        activeDevice={editor.device}
        onSelect={selectObject}
      />

      <div ref={inspectorScrollRef} className="homepage-editor__inspector-scroll" data-inspector-scroll="main">
        {validationState !== "current" ? (
          <p className="homepage-editor__validation-state" role="status" aria-live="polite">
            {validationState === "checking"
              ? "正在按服务端发布规则核对当前页面…"
              : validationState === "error"
                ? "发布资格暂时无法核对；本地编辑内容已保留。"
                : "内容已变化，发布资格等待重新核对。"}
          </p>
        ) : null}
        {currentPublishIssues.length > 0 ? (
          <section
            className="homepage-editor__publish-issues homepage-editor__inspector-publish-issues"
            aria-label="当前模块发布检查问题"
            role="alert"
          >
            <strong>当前模板提示 · {currentPublishIssues.length} 项</strong>
            <div>
              {currentPublishIssues.map((issue, index) => (
                <p key={`${issue.path ?? ""}-${issue.message}-${index}`}>
                  {issue.message}
                </p>
              ))}
            </div>
          </section>
        ) : null}
        <div
          id={`inspector-panel-${activePanelMode}`}
          className="homepage-editor__panel-mode-content"
          role="tabpanel"
          aria-labelledby={`inspector-panel-tab-${activePanelMode}`}
        >
          <>
            <section className="homepage-editor__task-group">
            <header className="homepage-editor__task-panel-header">
              <h3>
                {currentSelection
                  ? `${OBJECT_LABELS[currentSelection]}${activePanelMode === "design" ? "设计" : "内容"}`
                  : activePanelMode === "design" ? "模块布局" : "模块内容"}
              </h3>
            </header>
            <div className="homepage-editor__task-panel-body">
              {activePanelMode === "content"
                ? renderContentFields()
                : renderDesignFields()}
              {activePanelMode === "design" ? (
                <button
                  type="button"
                  className="homepage-editor__task-bridge"
                  onClick={() => onSaveAsTemplate(editor.moduleType, editor.props)}
                >
                  另存到模板库
                </button>
              ) : null}
            </div>
            </section>
          </>
        </div>
      </div>
    </section>
  );
}
