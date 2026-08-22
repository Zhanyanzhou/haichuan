/**
 * SchemaInspectorPanel.tsx — 由模块 Schema 驱动的统一编辑面板。
 *
 * 结构：TopBar（当前实例）→
 *       当前模块发布问题 → 连续任务分区（按内容/业务对象任务调整顺序，全部直接展示）→
 *       FooterBar（手动保存整页草稿）。
 * 与 InspectorPanel 的三级分派配合：仅在 registry 命中时渲染。
 */
import { DesktopOutlined, MobileOutlined } from "@ant-design/icons";
import { message, Modal } from "antd";
import { useEffect, useRef, useState } from "react";
import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import { useHomepagePuck } from "../../pages/admin/HomepageConfig/editor-store";
import {
  getModuleDisplayName,
} from "../../pages/admin/HomepageConfig/editor-utils";
import InspectorTopBar from "./InspectorTopBar";
import InspectorFooterBar from "./InspectorFooterBar";
import FieldRenderer, { isFieldVisible } from "./FieldRenderer";
import InstanceOverridesPanel from "./InstanceOverridesPanel";
import VisualEditorToolbar from "../visual-editor/VisualEditorToolbar";
import { useVisualEditorSession } from "../visual-editor/visualEditorSession";
import { useInspectorModuleEditor } from "./useInspectorModuleEditor";
import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import {
  type FieldDef,
  type InspectorContext,
  type InspectorLayer,
  type ModuleInspectorSchema,
} from "./schema/types";

interface SchemaInspectorPanelProps {
  schema: ModuleInspectorSchema;
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

type InspectorTaskGroup =
  | "content"
  | "media"
  | "product"
  | "link"
  | "composition"
  | "style"
  | "feature";

type InspectorPanelMode = "content" | "design";

interface VisibleFieldEntry {
  sectionId: string;
  field: FieldDef;
}

const VISUAL_NODE_LABELS: Record<string, string> = {
  desktopImage: "桌面主图",
  mobileImage: "移动端主图",
  image: "主图",
  mainImage: "主海报",
  detailImage: "细节海报",
  copy: "文案",
  bgImage: "背景图",
  productCards: "商品区域",
  title: "标题",
  eyebrow: "眉题",
  subtitle: "副标题",
  description: "说明文字",
  actionText: "行动文字",
  buttonText: "主按钮",
};

const CONTENT_TASK_GROUP_ORDER: InspectorTaskGroup[] = [
  "media",
  "content",
  "product",
  "link",
  "composition",
  "style",
  "feature",
];

const BUSINESS_TASK_GROUP_ORDER: InspectorTaskGroup[] = [
  "product",
  "media",
  "content",
  "link",
  "composition",
  "style",
  "feature",
];

const TASK_GROUP_ORDER_BY_PRIMARY: Record<string, InspectorTaskGroup[]> = {
  media: CONTENT_TASK_GROUP_ORDER,
  product: BUSINESS_TASK_GROUP_ORDER,
  category: BUSINESS_TASK_GROUP_ORDER,
  structured: ["feature", "content", "media", "link", "composition", "style", "product"],
  text: ["content", "media", "link", "composition", "style", "feature", "product"],
  action: ["link", "content", "media", "composition", "style", "feature", "product"],
};

const TASK_GROUP_META: Record<
  InspectorTaskGroup,
  { label: string }
> = {
  media: {
    label: "图片",
  },
  content: {
    label: "文字",
  },
  product: {
    label: "商品",
  },
  link: {
    label: "行动",
  },
  composition: {
    label: "布局与画面",
  },
  style: {
    label: "颜色与文字",
  },
  feature: {
    label: "专属内容",
  },
};

function getPanelMode(group: InspectorTaskGroup): InspectorPanelMode {
  return group === "composition" || group === "style" ? "design" : "content";
}

function getTaskGroup(
  field: FieldDef,
  layer: InspectorLayer,
): InspectorTaskGroup {
  if (layer === "feature") {
    return "feature";
  }
  if (layer === "product") {
    return "product";
  }
  if (
    field.control === "media" ||
    layer === "media" ||
    field.key.toLowerCase().includes("alt")
  ) {
    return "media";
  }
  if (field.control === "linkTarget" || layer === "interaction") {
    return "link";
  }
  if (layer === "layout") {
    return "composition";
  }
  if (layer === "style") {
    return "style";
  }
  return "content";
}

export default function SchemaInspectorPanel({
  schema,
  hasUnsavedChanges,
  saving,
  onSaveDraft,
  publishIssues,
  validationState,
}: SchemaInspectorPanelProps) {
  const editor = useInspectorModuleEditor();
  const [activePanelMode, setActivePanelMode] =
    useState<InspectorPanelMode>("content");
  const inspectorScrollRef = useRef<HTMLDivElement>(null);
  const panelScrollPositionsRef = useRef<Record<InspectorPanelMode, number>>({
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

  useEffect(() => {
    panelScrollPositionsRef.current = { content: 0, design: 0 };
    setActivePanelMode("content");
    setVisualPanelMode("content");
    window.requestAnimationFrame(() => {
      inspectorScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [editor?.moduleType, editorBlockId, setVisualPanelMode]);

  useEffect(() => {
    if (!editorBlockId || !visualSelection || visualSelection.blockId !== editorBlockId) return;
    const nodeId = getContentTemplateContract(editor?.moduleType ?? "")
      ?.editorCapabilities.layoutOverrides?.slots?.find(
        (slot) => slot.roleId === visualSelection.nodeId,
      )?.fieldKey ?? visualSelection.nodeId;
    const targetEntry = schema.sections
      .flatMap((section) =>
        section.fields.map((field) => ({ field, layer: section.layer })),
      )
      .find(({ field }) => field.key === nodeId);
    if (!targetEntry || activePanelMode !== "content") return;
    let focusFrame = 0;
    const renderFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        const target = document.querySelector<HTMLElement>(
          `[data-inspector-field="${CSS.escape(nodeId)}"]`,
        );
        if (!target) return;
        target.scrollIntoView({ block: "nearest", behavior: "smooth" });
        target.querySelector<HTMLElement>(
          "button, input:not([type='hidden']), select, textarea, [tabindex]:not([tabindex='-1'])",
        )?.focus({ preventScroll: true });
      });
    });
    return () => {
      window.cancelAnimationFrame(renderFrame);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [activePanelMode, editor?.moduleType, editorBlockId, schema.sections, visualSelection]);

  const ctx: InspectorContext | null = editor
    ? {
        props: editor.props,
        device: editor.device,
        viewportWidth: viewports.current.width,
      }
    : null;

  if (!editor || !ctx) return null;

  const content = appData.content as Array<{
    type: string;
    props: Record<string, any>;
  }>;

  const visibleFields = schema.sections
    .filter((section) => !section.visibleWhen || section.visibleWhen(ctx))
    .flatMap((section) =>
      section.fields
        .filter(
          (field) =>
            field.key !== "moduleName" &&
            isFieldVisible(field, ctx) &&
            (!field.device ||
              field.device === "shared" ||
              field.device === editor.device),
        )
        .map((field) => ({
          sectionId: section.id,
          layer: section.layer,
          field,
        })),
    );

  // 第一操作区由机器合同的主要运营任务决定；旧合同缺失时才按字段类型兼容推断。
  const contentTemplateContract = getContentTemplateContract(editor.moduleType);
  const primaryTask = contentTemplateContract?.editorCapabilities.primaryTask;
  const taskGroupOrder = primaryTask
    ? TASK_GROUP_ORDER_BY_PRIMARY[primaryTask]
    : visibleFields.some(
          (entry) => getTaskGroup(entry.field, entry.layer) === "product",
        )
      ? BUSINESS_TASK_GROUP_ORDER
      : CONTENT_TASK_GROUP_ORDER;
  const contractLayoutOverrides =
    contentTemplateContract?.editorCapabilities.layoutOverrides;
  const currentVisualSelection =
    visualSelection?.blockId === editor.props.id ? visualSelection : null;
  const selectedSlot = contractLayoutOverrides?.slots?.find(
    (slot) => slot.roleId === currentVisualSelection?.nodeId,
  );
  const selectedContentFieldKey =
    selectedSlot?.fieldKey ?? currentVisualSelection?.nodeId;
  const hasInstanceDesignControls = Boolean(
    contractLayoutOverrides &&
      ((contractLayoutOverrides.slots?.length ?? 0) > 0 ||
        (contractLayoutOverrides.textRoles?.length ?? 0) > 0 ||
        (contractLayoutOverrides.framePresets?.length ?? 0) > 0 ||
        (contractLayoutOverrides.frameRatioPresets?.length ?? 0) > 0 ||
        (contractLayoutOverrides.compositionPresets?.length ?? 0) > 0),
  );
  const taskGroups = taskGroupOrder.map((group) => ({
    group,
    entries: visibleFields
      .filter((entry) => getTaskGroup(entry.field, entry.layer) === group)
      .map<VisibleFieldEntry>(({ layer: _layer, ...entry }) => entry),
  })).filter((item) => item.entries.length > 0);
  if (
    hasInstanceDesignControls &&
    !taskGroups.some(({ group }) => group === "composition")
  ) {
    taskGroups.push({ group: "composition", entries: [] });
  }
  const contentTaskGroups = taskGroups.filter(
    ({ group }) => getPanelMode(group) === "content",
  );
  const designTaskGroups = taskGroups.filter(
    ({ group }) => getPanelMode(group) === "design",
  );
  const selectedContentTaskGroups = currentVisualSelection && selectedContentFieldKey
    ? contentTaskGroups
        .map(({ group, entries }) => ({
          group,
          entries: entries.filter(({ field }) => {
            const fieldKey = field.key.toLowerCase();
            const selectedKey = selectedContentFieldKey.toLowerCase();
            if (field.key === selectedContentFieldKey) return true;
            if (currentVisualSelection.kind === "media") {
              const mediaBase = selectedKey.replace(/image$/, "");
              if (group === "link") return true;
              return group === "media" && (
                (fieldKey.includes("alt") && (!mediaBase || fieldKey.includes(mediaBase))) ||
                (fieldKey === "alttext" && (contractLayoutOverrides?.slots?.length ?? 0) <= 2)
              );
            }
            if (currentVisualSelection.kind === "text") {
              return group === "link" && /action|button/.test(selectedKey);
            }
            return group === "product" && currentVisualSelection.kind === "product";
          }),
        }))
        .filter(({ entries }) => entries.length > 0)
    : contentTaskGroups;
  const selectedDesignGroup = designTaskGroups.find(
    ({ group }) => group === "composition",
  );
  const moduleStyleEntries = designTaskGroups.find(
    ({ group }) => group === "style",
  )?.entries ?? [];
  const activeTaskGroups = activePanelMode === "design"
    ? selectedDesignGroup
      ? [{
          ...selectedDesignGroup,
          entries: currentVisualSelection
            ? []
            : [...selectedDesignGroup.entries, ...moduleStyleEntries],
        }]
      : []
    : selectedContentTaskGroups.length > 0
      ? selectedContentTaskGroups
      : contentTaskGroups;
  const visualObjects = [
    ...(contractLayoutOverrides?.slots ?? []).map((slot) => {
      const roleKind = contentTemplateContract?.roles.find(
        (role) => role.id === slot.roleId,
      )?.kind;
      return {
        nodeId: slot.roleId,
        kind: roleKind === "media"
          ? "media" as const
          : /product/i.test(slot.roleId)
            ? "product" as const
            : "structured" as const,
      };
    }),
    ...(contractLayoutOverrides?.textRoles ?? []).map((role) => ({
      nodeId: role.roleId,
      kind: "text" as const,
    })),
  ].filter(({ nodeId }) => {
    if (editor.device === "mobile") return nodeId !== "desktopImage";
    return nodeId !== "mobileImage";
  });
  const schemaDefaults = schema.defaults ?? {};
  const currentPublishIssues = publishIssues.filter(
    (issue) =>
      issue.severity === "error" && issue.blockId === editor.props.id,
  );

  // 递归收集 media 字段:array 条目内的媒体(轮播/分类卡/画廊/证书/流程/评价等)同样计入,
  // 否则这些模板永远不显示「桌面端/移动端」切换器,与顶层双端图模板不一致。
  const collectMediaFields = (fields: FieldDef[]): FieldDef[] =>
    fields.flatMap((field) => {
      const own = field.control === "media" ? [field] : [];
      const nested =
        field.control === "array"
          ? collectMediaFields(field.itemFields)
          : [];
      return [...own, ...nested];
    });
  const deviceMediaFields = collectMediaFields(
    schema.sections.flatMap((section) => section.fields),
  );
  const hasDesktopMedia = deviceMediaFields.some(
    (field) =>
      !field.device || field.device === "shared" || field.device === "desktop",
  );
  const hasMobileMedia = deviceMediaFields.some(
    (field) =>
      !field.device || field.device === "shared" || field.device === "mobile",
  );
  const hasDeviceMedia = deviceMediaFields.length > 0;

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

  const activatePanelMode = (
    panelMode: InspectorPanelMode,
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

  const removeModule = () => {
    const index = content.findIndex(
      (item) => item.props?.id === editor.props.id,
    );
    if (index < 0) return;
    if (content[index].props?.locked) {
      message.info("此模块已锁定，不能删除");
      return;
    }
    Modal.confirm({
      title: `删除“${getModuleDisplayName(editor.moduleType, editor.props)}”？`,
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
    editor.update({ isVisible: editor.props.isVisible === false });
  };

  const renderTaskGroup = (item: {
    group: InspectorTaskGroup;
    entries: VisibleFieldEntry[];
  }) => {
    const { group, entries } = item;
    const meta = TASK_GROUP_META[group];
    const groupTitle = schema.groupTitles?.[group] ?? meta.label;
    return (
      <section
        key={group}
        id={`inspector-task-section-${group}`}
        className="homepage-editor__task-group"
        data-task-group={group}
      >
        <header className="homepage-editor__task-panel-header">
          <h3>{groupTitle}</h3>
        </header>
        <div className="homepage-editor__task-panel-body">
          {group === "media" && hasDeviceMedia ? (
            <div
              className="homepage-editor__media-device-switcher"
              role="group"
              aria-label="切换图片编辑设备"
            >
              <button
                type="button"
                className={editor.device === "desktop" ? "is-active" : ""}
                aria-pressed={editor.device === "desktop"}
                disabled={!hasDesktopMedia}
                onClick={() => setInspectorDevice("desktop")}
              >
                <DesktopOutlined />
                <span>桌面素材</span>
              </button>
              <button
                type="button"
                className={editor.device === "mobile" ? "is-active" : ""}
                aria-pressed={editor.device === "mobile"}
                disabled={!hasMobileMedia}
                onClick={() => setInspectorDevice("mobile")}
              >
                <MobileOutlined />
                <span>移动素材</span>
              </button>
            </div>
          ) : null}
          {group === "composition" ? (
            <>
              <InstanceOverridesPanel
                moduleType={editor.moduleType}
                props={editor.props}
                update={editor.update}
                scopes={
                  selectedSlot
                    ? ["slots"]
                    : currentVisualSelection?.kind === "text"
                      ? ["text"]
                      : ["layout"]
                }
                selectedNodeId={currentVisualSelection?.nodeId}
                resetAllDesign={!currentVisualSelection}
                embedded
                viewport={editor.device}
              />
              {!currentVisualSelection && entries.length > 0 ? (
                <details className="homepage-editor__progressive-settings">
                  <summary>更多模块设置</summary>
                  <div>
                    {entries.map((entry, fieldIndex) => (
                      <div
                        key={`${entry.sectionId}-${entry.field.key}-${fieldIndex}`}
                        className="homepage-editor__task-field"
                        data-inspector-field={entry.field.key}
                      >
                        <FieldRenderer
                          def={entry.field}
                          ctx={ctx}
                          update={editor.update}
                          moduleType={editor.moduleType}
                        />
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </>
          ) : entries.map((entry, fieldIndex) => (
              <div
                key={`${entry.sectionId}-${entry.field.key}-${fieldIndex}`}
                className={`homepage-editor__task-field${currentVisualSelection?.nodeId === entry.field.key ? " is-visual-selected" : ""}`}
                data-inspector-field={entry.field.key}
              >
                <FieldRenderer
                  def={entry.field}
                  ctx={ctx}
                  update={editor.update}
                  moduleType={editor.moduleType}
                  onRequestVisualEdit={(nodeId) => {
                    selectVisualNode({
                      blockId: String(editor.props.id ?? ""),
                      moduleType: editor.moduleType,
                      nodeId,
                      kind: "media",
                    });
                    activatePanelMode("design", "adjust-media");
                  }}
                />
                {Object.prototype.hasOwnProperty.call(schemaDefaults, entry.field.key) &&
                JSON.stringify(editor.props[entry.field.key]) !==
                  JSON.stringify(schemaDefaults[entry.field.key]) ? (
                  <button
                    type="button"
                    className="homepage-editor__field-reset"
                    onClick={() =>
                      editor.update({
                        [entry.field.key]: structuredClone(schemaDefaults[entry.field.key]),
                      })
                    }
                  >
                    恢复默认
                  </button>
                ) : null}
              </div>
            ))}
        </div>
      </section>
    );
  };

  return (
    <section
      className="homepage-editor__inspector"
      data-active-device={editor.device}
      data-module-type={editor.moduleType}
      aria-label="属性面板"
    >
      <InspectorTopBar
        displayName={schema.displayName}
        moduleName={
          typeof editor.props.moduleName === "string"
            ? editor.props.moduleName
            : ""
        }
        deviceLabel={
          schema.sections.every((section) =>
            section.fields.every(
              (field) => !field.device || field.device === "shared",
            ),
          )
            ? "双端通用"
            : editor.device === "mobile"
              ? "移动素材"
              : "桌面素材"
        }
        dirty={hasUnsavedChanges}
        onClose={editor.close}
        actions={[
          ...(editor.dirty
            ? [
                {
                  key: "revert",
                  label: "撤销本区修改",
                  onClick: editor.revert,
                },
              ]
            : []),
          // 系统区块(全局设置/业务功能区)只读或仅提供管理入口,不给破坏性动作
          ...(schema.systemBlock
            ? []
            : [
                {
                  key: "visibility",
                  label:
                    editor.props.isVisible === false
                      ? "取消隐藏模块"
                      : "隐藏模块",
                  onClick: toggleVisibility,
                },
                {
                  key: "remove",
                  label: "删除模块",
                  danger: true,
                  onClick: removeModule,
                },
              ]),
        ]}
      />

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
              if (designTaskGroups.length === 0) return;
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
            aria-disabled={designTaskGroups.length === 0}
            disabled={designTaskGroups.length === 0}
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

      <div
        ref={inspectorScrollRef}
        className="homepage-editor__inspector-scroll"
      >
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
          blockId={String(editor.props.id ?? "")}
          moduleType={editor.moduleType}
          panelMode={activePanelMode}
          onRequestDesign={(mode) => activatePanelMode("design", mode)}
        />
        {visualObjects.length > 0 ? (
          <div className="homepage-editor__object-context">
            <div>
              <strong>
                {currentVisualSelection
                  ? VISUAL_NODE_LABELS[currentVisualSelection.nodeId] ?? currentVisualSelection.nodeId
                  : activePanelMode === "design"
                    ? "当前模块"
                    : "全部内容"}
              </strong>
              {currentVisualSelection ? (
                <button
                  type="button"
                  onClick={() => clearVisualNode(String(editor.props.id ?? ""))}
                >
                  返回模块级
                </button>
              ) : null}
            </div>
            <details>
              <summary>切换编辑对象</summary>
              <div role="group" aria-label="选择编辑对象">
                {visualObjects.map((item) => (
                  <button
                    key={item.nodeId}
                    type="button"
                    className={currentVisualSelection?.nodeId === item.nodeId ? "is-active" : ""}
                    aria-pressed={currentVisualSelection?.nodeId === item.nodeId}
                    onClick={() =>
                      selectVisualNode({
                        blockId: String(editor.props.id ?? ""),
                        moduleType: editor.moduleType,
                        nodeId: item.nodeId,
                        kind: item.kind,
                      })
                    }
                  >
                    {VISUAL_NODE_LABELS[item.nodeId] ?? item.nodeId}
                  </button>
                ))}
              </div>
            </details>
          </div>
        ) : null}
        <div
          id={`inspector-panel-${activePanelMode}`}
          className="homepage-editor__panel-mode-content"
          role="tabpanel"
          aria-labelledby={`inspector-panel-tab-${activePanelMode}`}
        >
          {activeTaskGroups.map(renderTaskGroup)}
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
