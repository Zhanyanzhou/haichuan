/**
 * DoublePosterInspector.tsx — 「双图文」专用对象化属性面板（实验）。
 *
 * 与通用 SchemaInspectorPanel 的差异：
 * - 选中谁就只显示谁的属性：模块级 / 主图 / 细节图 / 文案 四个对象各自成组；
 * - 顶部面包屑（双图文 › 当前对象）+ 直出对象切换 chips；
 * - 视觉属性（比例/裁切/焦点/缩放/构图/排版）以图形卡片、九宫格、滑杆呈现；
 * - 写回只走 useInspectorModuleEditor.update（模块字段）与
 *   setVisualOverridePath(__instanceOverrides)（视觉覆盖），不新增数据源。
 *
 * 契约红线：比例选项一律由轴① getContractRoleRatioPresets 白名单派生（D.13），
 * 写 props 冒号格式；视觉覆盖稀疏写入、恢复默认只清对应路径（D.17）。
 */
import { useEffect, useRef, useState } from "react";
import { message, Modal } from "antd";
import InspectorTopBar from "../InspectorTopBar";
import InspectorFooterBar from "../InspectorFooterBar";
import FieldRenderer from "../FieldRenderer";
import { useInspectorModuleEditor } from "../useInspectorModuleEditor";
import { doublePosterSchema } from "../schema/modules/doublePoster";
import {
  bgColorPresetField,
  ADVANCED_BG_COLOR_FIELD,
} from "../schema/shared";
import type { FieldDef, InspectorContext } from "../schema/types";
import VisualEditorToolbar from "../../visual-editor/VisualEditorToolbar";
import { useVisualEditorSession } from "../../visual-editor/visualEditorSession";
import {
  resolveVisualNode,
  setVisualOverridePath,
  isVisualRecord,
  type VisualViewport,
} from "../../runtime/visualLayout";
import {
  createContentTemplateMarker,
  getContentTemplateContract,
} from "../../generated/contentTemplates.generated";
import {
  getContractRoleRatioPresets,
  RESPONSIVE_CANVAS,
} from "../../config/blockContracts";
import { useHomepagePuck } from "../../../pages/admin/HomepageConfig/editor-store";
import { getModuleDisplayName } from "../../../pages/admin/HomepageConfig/editor-utils";

type PanelMode = "content" | "design";
type ObjectId = "mainImage" | "detailImage" | "copy";

interface DoublePosterInspectorProps {
  hasUnsavedChanges: boolean;
  saving: boolean;
  onSaveDraft: () => void;
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
};

const OBJECT_ORDER: Array<{ id: ObjectId; kind: "media" | "text" }> = [
  { id: "mainImage", kind: "media" },
  { id: "detailImage", kind: "media" },
  { id: "copy", kind: "text" },
];

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

const COMPOSITION_OPTIONS = [
  { value: "balanced", label: "均衡" },
  { value: "main-led", label: "主图优先" },
  { value: "detail-led", label: "细节图优先" },
] as const;

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
  saving,
  onSaveDraft,
  publishIssues,
  validationState,
}: DoublePosterInspectorProps) {
  const editor = useInspectorModuleEditor();
  const [activePanelMode, setActivePanelMode] = useState<PanelMode>("content");
  const inspectorScrollRef = useRef<HTMLDivElement>(null);
  const panelScrollPositionsRef = useRef<Record<PanelMode, number>>({
    content: 0,
    design: 0,
  });
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const appData = useHomepagePuck((state) => state.appState.data);
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);
  const visualSelection = useVisualEditorSession((state) => state.selection);
  const selectVisualNode = useVisualEditorSession((state) => state.selectNode);
  const clearVisualNode = useVisualEditorSession((state) => state.clearNode);
  const setVisualEditorMode = useVisualEditorSession((state) => state.setMode);
  const setVisualPanelMode = useVisualEditorSession((state) => state.setPanelMode);
  const editorBlockId = editor?.props.id;

  // 切换模块时重置 tab 与滚动位置（与 SchemaInspectorPanel 同模式）
  useEffect(() => {
    panelScrollPositionsRef.current = { content: 0, design: 0 };
    setActivePanelMode("content");
    setVisualPanelMode("content");
    window.requestAnimationFrame(() => {
      inspectorScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [editor?.moduleType, editorBlockId, setVisualPanelMode]);

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
  const copyRole = layoutOverrides?.textRoles?.find(
    (role) => role.roleId === "copy",
  );
  const mainSlot = layoutOverrides?.slots?.find(
    (slot) => slot.roleId === "mainImage",
  );
  const detailSlot = layoutOverrides?.slots?.find(
    (slot) => slot.roleId === "detailImage",
  );

  const currentSelection =
    visualSelection &&
    visualSelection.blockId === props.id &&
    OBJECT_ORDER.some((item) => item.id === visualSelection.nodeId)
      ? (visualSelection.nodeId as ObjectId)
      : null;

  const currentPublishIssues = publishIssues.filter(
    (issue) => issue.severity === "error" && issue.blockId === props.id,
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
          onRequestVisualEdit={(nodeId) => {
            selectVisualNode({
              blockId: String(props.id ?? ""),
              moduleType: editor.moduleType,
              nodeId,
              kind: "media",
            });
            activatePanelMode("design", "adjust-media");
          }}
        />
      </div>
    );
  };

  /** 视觉覆盖稀疏写入：undefined/"" 删键（D.17），写回即时同步画布 */
  const applyVisual = (path: string[], value: unknown) => {
    editor.update({
      __instanceOverrides: setVisualOverridePath(
        props.__instanceOverrides,
        path,
        value,
      ),
      ...(props.__contentTemplate
        ? {}
        : { __contentTemplate: createContentTemplateMarker(editor.moduleType) }),
    });
  };

  const applyVisualPaths = (entries: Array<{ path: string[]; value: unknown }>) => {
    let overrides = props.__instanceOverrides;
    for (const entry of entries) {
      overrides = setVisualOverridePath(overrides, entry.path, entry.value);
    }
    editor.update({
      __instanceOverrides: overrides,
      ...(props.__contentTemplate
        ? {}
        : { __contentTemplate: createContentTemplateMarker(editor.moduleType) }),
    });
  };

  const frameOverrides = isVisualRecord(props.__instanceOverrides) &&
    isVisualRecord(props.__instanceOverrides.frame)
      ? props.__instanceOverrides.frame
      : {};
  const compositionPreset =
    typeof frameOverrides.compositionPreset === "string"
      ? frameOverrides.compositionPreset
      : "balanced";

  const hasAnyOverride = Boolean(props.__instanceOverrides);

  const activatePanelMode = (
    panelMode: PanelMode,
    requestedMode?: "adjust-layout" | "adjust-media",
  ) => {
    const targetScrollTop = panelScrollPositionsRef.current[panelMode];
    if (panelMode !== activePanelMode && inspectorScrollRef.current) {
      panelScrollPositionsRef.current[activePanelMode] =
        inspectorScrollRef.current.scrollTop;
    }
    setActivePanelMode(panelMode);
    setVisualPanelMode(panelMode);
    if (panelMode === "design" && requestedMode) {
      setVisualEditorMode(requestedMode);
    }
    if (panelMode !== activePanelMode) {
      window.requestAnimationFrame(() => {
        inspectorScrollRef.current?.scrollTo({
          top: targetScrollTop,
          behavior: "auto",
        });
      });
    }
  };

  const selectObject = (objectId: ObjectId | null) => {
    if (!objectId) {
      clearVisualNode(String(props.id ?? ""));
      return;
    }
    const meta = OBJECT_ORDER.find((item) => item.id === objectId);
    selectVisualNode({
      blockId: String(props.id ?? ""),
      moduleType: editor.moduleType,
      nodeId: objectId,
      kind: meta?.kind ?? "media",
    });
  };

  const setInspectorDevice = (device: "desktop" | "mobile") => {
    const preset = RESPONSIVE_CANVAS[device];
    dispatch({
      type: "setUi",
      ui: {
        viewports: {
          ...viewports,
          current: { width: preset.width, height: preset.height },
        },
      },
    });
  };

  const removeModule = () => {
    const content = appData.content as Array<{
      type: string;
      props: Record<string, any>;
    }>;
    const index = content.findIndex((item) => item.props?.id === props.id);
    if (index < 0) return;
    if (content[index].props?.locked) {
      message.info("此模块已锁定，不能删除");
      return;
    }
    Modal.confirm({
      title: `删除“${getModuleDisplayName(editor.moduleType, props)}”？`,
      content: "删除后可通过顶部撤销恢复；保存草稿前不会影响前台页面。",
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        dispatch({
          type: "setData",
          data: {
            ...appData,
            content: content.filter((_, i) => i !== index),
          },
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
    const currentRatio = String(props[ratioPropKey] ?? "");
    const currentFit = visualNode.fit ?? "cover";
    const currentFocus = visualNode.focus ?? {
      x: Number(props[focusKeyX]) || 50,
      y: Number(props[focusKeyY]) || 50,
    };
    const zoomSpec = slot?.zoom ?? { min: 1, max: 1.5, step: 0.05 };
    const currentZoom = visualNode.zoom ?? 1;

    return (
      <>
        <div className="homepage-editor__visual-preset-group" role="group" aria-label="画面比例">
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
                  onClick={() => editor.update({ [ratioPropKey]: colonValue })}
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

        <div className="homepage-editor__visual-preset-group" role="group" aria-label="裁切方式">
          <span>裁切方式</span>
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

        <div className="homepage-editor__visual-preset-group" role="group" aria-label="画面位置">
          <span>
            画面位置{viewport === "mobile" ? "（移动端独立）" : ""}
          </span>
          <div className="homepage-editor__focus-grid">
            {[0, 50, 100].map((y) =>
              [0, 50, 100].map((x) => (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  aria-label={`焦点 横向${x}% 纵向${y}%`}
                  className={
                    currentFocus.x === x && currentFocus.y === y ? "is-active" : ""
                  }
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

        <label className="homepage-editor__instance-field">
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

        <details className="homepage-editor__progressive-settings">
          <summary>更多设置</summary>
          <div>
            {slot?.positionPresets?.length ? (
              <div className="homepage-editor__visual-preset-group" role="group" aria-label="槽位位置">
                <span>槽位位置</span>
                <div className="homepage-editor__choice-cards is-slot-position">
                  <button
                    type="button"
                    className={!visualNode.rect ? "is-active" : ""}
                    aria-pressed={!visualNode.rect}
                    onClick={() =>
                      applyVisual(["nodes", roleId, "rectByViewport", viewport], undefined)
                    }
                  >
                    <i data-choice="default" aria-hidden="true"><b /></i>
                    <em>默认</em>
                  </button>
                  {slot.positionPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        setVisualEditorMode("adjust-layout")
                      }
                    >
                      <i data-choice={preset} aria-hidden="true"><b /></i>
                      <em>{{ start: "起始侧", center: "居中", end: "末端侧" }[preset] ?? preset}</em>
                    </button>
                  ))}
                </div>
                <p className="homepage-editor__inspector-hint">
                  精细位置请在画布中拖动调整（调整区域模式）。
                </p>
              </div>
            ) : null}
            <button
              type="button"
              className="homepage-editor__field-reset"
              disabled={!isVisualRecord(props.__instanceOverrides) ||
                !isVisualRecord(props.__instanceOverrides.nodes) ||
                !isVisualRecord(props.__instanceOverrides.nodes[roleId])}
              onClick={() =>
                applyVisual(["nodes", roleId], undefined)
              }
            >
              恢复{OBJECT_LABELS[roleId]}设计默认
            </button>
          </div>
        </details>
      </>
    );
  };

  /* ---------------- 文案级设计控件 ---------------- */

  const renderCopyDesign = () => {
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

        <details className="homepage-editor__progressive-settings">
          <summary>更多设置</summary>
          <div>
            <button
              type="button"
              className="homepage-editor__field-reset"
              disabled={!isVisualRecord(props.__instanceOverrides) ||
                !isVisualRecord(props.__instanceOverrides.nodes) ||
                !isVisualRecord(props.__instanceOverrides.nodes.copy)}
              onClick={() => applyVisual(["nodes", "copy"], undefined)}
            >
              恢复文案设计默认
            </button>
          </div>
        </details>
      </>
    );
  };

  /* ---------------- 模块级设计控件 ---------------- */

  const renderModuleDesign = () => (
    <>
      <div className="homepage-editor__visual-preset-group" role="group" aria-label="双图构图">
        <span>双图构图</span>
        <div className="homepage-editor__choice-cards is-composition">
          {COMPOSITION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={compositionPreset === option.value ? "is-active" : ""}
              aria-pressed={compositionPreset === option.value}
              onClick={() =>
                applyVisual(
                  ["frame", "compositionPreset"],
                  option.value === "balanced" ? undefined : option.value,
                )
              }
            >
              <i data-choice={option.value} aria-hidden="true"><b /></i>
              <em>{option.label}</em>
            </button>
          ))}
        </div>
      </div>

      <FieldRenderer
        def={bgColorPresetField()}
        ctx={ctx}
        update={editor.update}
        moduleType={editor.moduleType}
      />

      <details className="homepage-editor__progressive-settings">
        <summary>更多设置</summary>
        <div>
          <FieldRenderer
            def={ADVANCED_BG_COLOR_FIELD}
            ctx={ctx}
            update={editor.update}
            moduleType={editor.moduleType}
          />
          <button
            type="button"
            className="homepage-editor__field-reset"
            disabled={!hasAnyOverride}
            onClick={() =>
              applyVisualPaths([
                { path: ["frame"], value: undefined },
                { path: ["nodes"], value: undefined },
              ])
            }
          >
            恢复全部设计默认
          </button>
        </div>
      </details>
    </>
  );

  /* ---------------- 内容页字段集 ---------------- */

  const renderContentFields = () => {
    if (currentSelection === "mainImage" || currentSelection === "detailImage") {
      const roleId = currentSelection;
      const altKey = roleId === "mainImage" ? "mainAltText" : "detailAltText";
      return (
        <>
          {renderSchemaField(roleId)}
          {renderSchemaField(altKey)}
        </>
      );
    }
    if (currentSelection === "copy") {
      return (
        <>
          {renderSchemaField("title")}
          {renderSchemaField("description")}
          {renderSchemaField("number")}
          {renderSchemaField("label")}
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
    return renderModuleDesign();
  };

  return (
    <section
      className="homepage-editor__inspector homepage-editor__dp-panel"
      data-active-device={editor.device}
      data-module-type={editor.moduleType}
      aria-label="属性面板"
    >
      <InspectorTopBar
        displayName="双图文"
        moduleName={
          typeof props.moduleName === "string" ? props.moduleName : ""
        }
        deviceLabel="双端通用"
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

      {/* 面包屑 + 对象切换（高频直出，不做折叠） */}
      <nav
        className="homepage-editor__dp-breadcrumb"
        aria-label="当前编辑对象"
      >
        <button
          type="button"
          className={!currentSelection ? "is-current" : ""}
          onClick={() => selectObject(null)}
        >
          双图文
        </button>
        {currentSelection ? (
          <>
            <span aria-hidden="true">›</span>
            <strong>{OBJECT_LABELS[currentSelection]}</strong>
          </>
        ) : null}
      </nav>
      <div
        className="homepage-editor__dp-object-chips"
        role="group"
        aria-label="切换编辑对象"
      >
        <button
          type="button"
          className={!currentSelection ? "is-active" : ""}
          aria-pressed={!currentSelection}
          onClick={() => selectObject(null)}
        >
          整个模块
        </button>
        {OBJECT_ORDER.map((item) => (
          <button
            key={item.id}
            type="button"
            className={currentSelection === item.id ? "is-active" : ""}
            aria-pressed={currentSelection === item.id}
            onClick={() => selectObject(item.id)}
          >
            {OBJECT_LABELS[item.id]}
          </button>
        ))}
      </div>

      <nav className="homepage-editor__panel-mode-tabs" aria-label="编辑类型">
        <div role="tablist" aria-label="编辑类型">
          <button
            id="inspector-panel-tab-content"
            type="button"
            role="tab"
            aria-selected={activePanelMode === "content"}
            aria-controls="inspector-panel-content"
            className={activePanelMode === "content" ? "is-active" : ""}
            onClick={() => activatePanelMode("content")}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "End") return;
              event.preventDefault();
              activatePanelMode("design");
              window.requestAnimationFrame(() =>
                document.getElementById("inspector-panel-tab-design")?.focus(),
              );
            }}
          >
            内容
          </button>
          <button
            id="inspector-panel-tab-design"
            type="button"
            role="tab"
            aria-selected={activePanelMode === "design"}
            aria-controls="inspector-panel-design"
            className={activePanelMode === "design" ? "is-active" : ""}
            onClick={() => activatePanelMode("design")}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "Home") return;
              event.preventDefault();
              activatePanelMode("content");
              window.requestAnimationFrame(() =>
                document.getElementById("inspector-panel-tab-content")?.focus(),
              );
            }}
          >
            设计
          </button>
        </div>
      </nav>

      <div ref={inspectorScrollRef} className="homepage-editor__inspector-scroll">
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
            <strong>发布前待完善 · {currentPublishIssues.length} 项</strong>
            <div>
              {currentPublishIssues.map((issue, index) => (
                <p key={`${issue.path ?? ""}-${issue.message}-${index}`}>
                  {issue.message}
                </p>
              ))}
            </div>
          </section>
        ) : null}
        <VisualEditorToolbar
          blockId={String(props.id ?? "")}
          moduleType={editor.moduleType}
          panelMode={activePanelMode}
          onRequestDesign={(mode) => activatePanelMode("design", mode)}
        />
        <div
          id={`inspector-panel-${activePanelMode}`}
          className="homepage-editor__panel-mode-content"
          role="tabpanel"
          aria-labelledby={`inspector-panel-tab-${activePanelMode}`}
        >
          <section className="homepage-editor__task-group">
            <header className="homepage-editor__task-panel-header">
              <h3>
                {currentSelection
                  ? OBJECT_LABELS[currentSelection]
                  : "整个模块"}
                {activePanelMode === "design" ? " · 设计" : ""}
              </h3>
            </header>
            <div className="homepage-editor__task-panel-body">
              {activePanelMode === "content"
                ? renderContentFields()
                : renderDesignFields()}
            </div>
          </section>
        </div>
      </div>

      <InspectorFooterBar
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        onSaveDraft={onSaveDraft}
      />
    </section>
  );
}
