import { App as AntdApp, Alert, Button, Input, Modal, Spin } from "antd";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./TemplateWorkspace.css";
import DynamicTemplateCanvas from "./DynamicTemplateCanvas";
import DynamicTemplateInspectorPanel from "./DynamicTemplateInspectorPanel";
import DynamicTemplateStructurePanel from "./DynamicTemplateStructurePanel";
import TemplateEditorToolbar from "./TemplateEditorToolbar";
import {
  exportDynamicTemplateDraftJson,
  importDynamicTemplateDraftJson,
} from "./dynamicTemplateDraftRepository";
import WorkspacePanelHeader from "../workspace/WorkspacePanelHeader";
import WorkspacePanelCollapseButton from "../workspace/WorkspacePanelCollapseButton";
import useCompactWorkspaceOverlay from "../workspace/useCompactWorkspaceOverlay";
import { BlockOutlined, ControlOutlined } from "@ant-design/icons";
import TemplateEditorLibrary, {
  type TemplateEditorLibraryTarget,
} from "./TemplateEditorLibrary";
import { hasDynamicTemplateCompatibilityState } from "./dynamicTemplateEditorUtils";
import type { TemplateWorkspaceController } from "./TemplateWorkspaceController";
import type { TemplateInspectorIssueTarget } from "./templateInspectorCapabilities";
import { DynamicTemplateRenderer, validateDynamicTemplateDefinition } from "../template-definition";
import {
  type DynamicTemplateResource,
  type DynamicTemplateVersionSummaryResource,
  type DynamicTemplateVersionResource,
} from "@/services/clients/dynamicTemplateClient";
import { summarizeTemplateHistoryDiff } from "./templateHistoryDiff";

export default function TemplateWorkspace({
  controller,
}: {
  controller: TemplateWorkspaceController;
}) {
  const { message, modal } = AntdApp.useApp();
  const {
    localOnly,
    publishing,
    publishReview,
    lifecycleBusy,
    draft,
    selectedObjectLabel,
    dirty,
    hasBaseline,
    device,
    previewMode,
    previewScenario,
    saveStatus,
    setPreviewMode,
  } = controller;
  const [structureCollapsed, setStructureCollapsed] = useState(() => {
    try {
      if (window.matchMedia("(min-width: 1200px)").matches) return false;
      const stored = sessionStorage.getItem("template-editor-structure-collapsed");
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch {
      /* 工作区偏好不可用时使用当前视口默认值 */
    }
    return typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches;
  });
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => {
    try {
      if (window.matchMedia("(min-width: 1200px)").matches) return false;
      return sessionStorage.getItem("template-editor-inspector-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const updateStructureCollapsed = useCallback((collapsed: boolean) => {
    setStructureCollapsed(collapsed);
    try {
      sessionStorage.setItem("template-editor-structure-collapsed", collapsed ? "1" : "0");
    } catch {
      /* 工作区偏好不可用时不影响当前收放 */
    }
  }, []);
  const updateInspectorCollapsed = useCallback((collapsed: boolean) => {
    setInspectorCollapsed(collapsed);
    try {
      sessionStorage.setItem("template-editor-inspector-collapsed", collapsed ? "1" : "0");
    } catch {
      /* 工作区偏好不可用时不影响当前收放 */
    }
  }, []);
  const inspectorOverlay = useCompactWorkspaceOverlay({
    open: !inspectorCollapsed,
    onOpen: () => updateInspectorCollapsed(false),
    onClose: () => updateInspectorCollapsed(true),
  });
  const openedReviewRequest = useRef<number | null>(null);
  const [inspectorTopInset, setInspectorTopInset] = useState(0);
  useLayoutEffect(() => {
    if (!inspectorOverlay.compact || inspectorCollapsed) return;
    const panel = inspectorOverlay.panelRef.current;
    const body = panel?.parentElement;
    if (!panel || !body) return;
    // 手机端身份与状态悬浮在画布上方，属性面板始终避开它们，保留关闭按钮命中。
    const controls = Array.from(document.querySelectorAll<HTMLElement>(
      ".template-editor__toolbar .template-editor__workspace-subject, .template-editor__toolbar .homepage-editor__workspace-status",
    ));
    const measure = () => {
      const bodyTop = body.getBoundingClientRect().top;
      setInspectorTopInset(Math.max(0, ...controls.map((control) => (
        getComputedStyle(control).position === "fixed" ? control.getBoundingClientRect().bottom - bodyTop : 0
      ))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    [body, ...controls].forEach((element) => observer.observe(element));
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [inspectorOverlay.compact, inspectorOverlay.panelRef, inspectorCollapsed]);
  useEffect(() => {
    if (!publishReview || openedReviewRequest.current === publishReview.requestId) return;
    openedReviewRequest.current = publishReview.requestId;
    setPreviewMode(false);
    inspectorOverlay.requestOpen();
  }, [publishReview, inspectorOverlay, setPreviewMode]);
  const prepareIssueTarget = (target: TemplateInspectorIssueTarget) => {
    if (target.destination === "structure-region" || target.destination === "structure-slot") {
      updateStructureCollapsed(false);
      if (inspectorOverlay.compact) inspectorOverlay.requestClose();
    }
  };

  useEffect(() => {
    if (inspectorOverlay.compact) {
      updateInspectorCollapsed(true);
      return;
    }
    updateStructureCollapsed(false);
    updateInspectorCollapsed(false);
  }, [inspectorOverlay.compact, updateInspectorCollapsed, updateStructureCollapsed]);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "template-editor-structure-collapsed",
        structureCollapsed ? "1" : "0",
      );
    } catch {
      /* 工作区偏好不可用时不影响模板会话 */
    }
  }, [structureCollapsed]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "template-editor-inspector-collapsed",
        inspectorCollapsed ? "1" : "0",
      );
    } catch {
      /* 工作区偏好不可用时不影响模板会话 */
    }
  }, [inspectorCollapsed]);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyName, setCopyName] = useState("");
  const [modalSaving, setModalSaving] = useState(false);
  const [recoveryDetailsOpen, setRecoveryDetailsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [versions, setVersions] = useState<DynamicTemplateVersionSummaryResource[]>([]);
  const [versionsNextBefore, setVersionsNextBefore] = useState<number | null>(null);
  const [versionsLoadingMore, setVersionsLoadingMore] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [selectedVersionDetail, setSelectedVersionDetail] = useState<DynamicTemplateVersionResource | null>(null);
  const [versionDetailLoading, setVersionDetailLoading] = useState(false);
  const [versionDetailError, setVersionDetailError] = useState<string | null>(null);
  const [currentPublishedDetail, setCurrentPublishedDetail] = useState<DynamicTemplateVersionResource | null>(null);
  const versionRequestIdRef = useRef(0);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const openTemplateTarget = useCallback((target: TemplateEditorLibraryTarget) => {
    controller.openTarget(target);
  }, [controller]);

  const moveTemplateToTrash = (template: Pick<DynamicTemplateResource, "templateId" | "name">) => {
    if (localOnly || lifecycleBusy) return;
    let archiveDialog: { destroy: () => void } | null = null;
    archiveDialog = modal.confirm({
      title: `将模板“${template.name}”移入回收站？`,
      content: "移入回收站后，模板将从组件库隐藏，页面装修不能再新增；已有页面和已发布版本保持不变，可在模板回收站恢复。",
      okText: "移入回收站",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        const archived = await controller.archive(template);
        if (archived) {
          archiveDialog?.destroy();
        }
      },
    });
  };

  const discardCurrentDraft = () => {
    if (!draft || !dirty || !hasBaseline) return;
    modal.confirm({
      title: `放弃“${draft.definition.name}”的未保存修改？`,
      content: "当前编辑会恢复到最近一次已保存草稿；正式版本和页面实例不会改变。",
      okText: "放弃未保存修改",
      okButtonProps: { danger: true },
      cancelText: "继续编辑",
      onOk: () => {
        controller.discardChanges();
        message.success("未保存的模板修改已放弃");
      },
    });
  };

  const permanentlyDeleteTemplate = (template: Pick<DynamicTemplateResource, "templateId" | "name">) => {
    if (localOnly || lifecycleBusy) return;
    modal.confirm({
      title: `永久删除模板“${template.name}”？`,
      content: "永久删除后无法恢复。仅从未发布、没有版本历史且未被页面引用的自定义模板可以永久删除。",
      okText: "永久删除模板",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await controller.deleteDraft(template);
      },
    });
  };

  const restoreTemplate = (template: import("@/services/clients/dynamicTemplateClient").DynamicTemplateResource) => {
    if (localOnly || lifecycleBusy) return;
    modal.confirm({
      title: `恢复模板“${template.name}”？`,
      content: "恢复后模板会重新进入可设计状态；若已有正式版本，也会重新进入页面装修目录。已有页面实例不会被修改。",
      okText: "恢复模板",
      cancelText: "取消",
      onOk: async () => {
        await controller.restore(template);
      },
    });
  };

  const saveCurrentTemplate = async () => {
    if (!draft) return;
    if (draft.compatibilityRecovery) {
      if (draft.compatibilityRecovery.status === "source-invalid") {
        message.warning("请先返回修复方案，再明确保存或另存为新模板");
        return;
      }
      modal.confirm({
        title: `保存“${draft.definition.name}”的修复草稿？`,
        content: (
          <div className="template-editor__transition-confirm">
            <p className="template-editor__transition-summary">
              这会覆盖模板 ID“{draft.definition.templateId}”当前保存的草稿定义。
            </p>
            <p className="template-editor__transition-note">
              原草稿将被修复方案替换；不会发布模板、升级页面实例或修改任何页面草稿。保存失败或发生 409 冲突时，当前修复内容仍完整保留。
            </p>
          </div>
        ),
        okText: "保存修复草稿",
        okButtonProps: { danger: true },
        cancelText: "继续检查",
        autoFocusButton: "cancel",
        onOk: async () => {
          await controller.persist({
            overwriteCurrent: true,
            compatibilityRecoveryDecision: "overwrite",
          });
        },
      });
      return;
    }
    if (localOnly) {
      modal.confirm({
        title: "保存本机测试草稿",
        content: "只写入当前浏览器本机存储，不创建服务端模板。",
        okText: "更新本机测试草稿",
        cancelText: "取消",
        onOk: async () => {
          const saved = await controller.persist({ overwriteCurrent: true });
          if (!saved) throw new Error("本机测试草稿保存失败");
        },
      });
      return;
    }
    await controller.persist({ overwriteCurrent: true });
  };

  const openSaveCopy = () => {
    if (!draft) return;
    setCopyName(`${draft.definition.name} 副本`);
    setCopyOpen(true);
  };

  const saveTemplateCopy = async () => {
    if (!draft) return;
    const name = copyName.trim();
    if (!name) {
      message.warning("请填写副本名称");
      return;
    }
    setModalSaving(true);
    const saved = await controller.persist({
      asCopy: true,
      name,
      ...(draft.compatibilityRecovery
        ? { compatibilityRecoveryDecision: "copy" as const }
        : {}),
    });
    setModalSaving(false);
    if (saved) setCopyOpen(false);
  };

  const confirmCancelCompatibilityRecovery = () => {
    if (!draft?.compatibilityRecovery || lifecycleBusy) return;
    modal.confirm({
      title: "取消本次修复？",
      content: "系统会先校验原草稿；可渲染时恢复原定义，不可渲染时保留原始数据并显示错误。不会发起任何服务端写入。此操作可通过撤销恢复。",
      okText: "取消本次修复",
      cancelText: "继续检查",
      onOk: () => {
        controller.cancelCompatibilityRecovery();
        setRecoveryDetailsOpen(false);
      },
    });
  };

  const selectHistoricalVersion = async (version: number) => {
    const requestId = ++versionRequestIdRef.current;
    setSelectedVersion(version);
    setSelectedVersionDetail(null);
    setVersionDetailLoading(true);
    setVersionDetailError(null);
    try {
      const detail = await controller.getVersion(version);
      if (requestId !== versionRequestIdRef.current) return;
      setSelectedVersionDetail(detail);
    } catch {
      if (requestId !== versionRequestIdRef.current) return;
      setVersionDetailError("该版本详情读取或完整性校验失败，当前模板草稿未改变");
    } finally {
      if (requestId === versionRequestIdRef.current) setVersionDetailLoading(false);
    }
  };

  const openVersionHistory = async () => {
    if (!draft) return;
    setVersionsOpen(true);
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      if (draft.sourceType !== "persisted") {
        setVersionsOpen(false);
        return;
      }
      const page = await controller.listVersions({ limit: 20 });
      setVersions(page.items);
      setVersionsNextBefore(page.nextBeforeVersion);
      const firstVersion = page.items[0]?.version ?? null;
      setSelectedVersion(firstVersion);
      setSelectedVersionDetail(null);
      setCurrentPublishedDetail(null);
      if (draft.remote?.publishedVersion) {
        void controller.getVersion(draft.remote.publishedVersion)
          .then(setCurrentPublishedDetail)
          .catch(() => setCurrentPublishedDetail(null));
      }
      if (firstVersion) void selectHistoricalVersion(firstVersion);
    } catch {
      setVersionsError("版本历史读取失败，当前模板草稿未改变");
    } finally {
      setVersionsLoading(false);
    }
  };

  const loadOlderVersions = async () => {
    if (!versionsNextBefore || versionsLoadingMore) return;
    setVersionsLoadingMore(true);
    try {
      const page = await controller.listVersions({ beforeVersion: versionsNextBefore, limit: 20 });
      setVersions((current) => [...current, ...page.items]);
      setVersionsNextBefore(page.nextBeforeVersion);
    } catch {
      message.error("更早版本读取失败，已加载的版本仍可查看");
    } finally {
      setVersionsLoadingMore(false);
    }
  };

  const confirmStageHistoricalVersion = (target: "current" | "new") => {
    if (!selectedVersionDetail || !draft) return;
    const version = selectedVersionDetail;
    modal.confirm({
      title: target === "current"
        ? `将 v${version.version} 载入当前草稿？`
        : `从 v${version.version} 新建草稿？`,
      content: target === "current"
        ? "只替换当前内存草稿，并形成一个可撤销步骤；不会自动保存、发布或修改任何页面。当前历史内容保持只读。"
        : "将创建新的内存草稿和新 templateId；不会自动保存、发布或修改来源模板与任何页面。当前未保存修改将离开当前会话。",
      okText: target === "current" ? "载入当前草稿" : "新建内存草稿",
      cancelText: "取消",
      onOk: () => {
        if (controller.stageVersion(version, target)) setVersionsOpen(false);
      },
    });
  };

  const exportDynamicDraft = () => {
    if (!draft) return;
    try {
      const source = exportDynamicTemplateDraftJson(draft);
      const blob = new Blob([source], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${draft.definition.name.replace(/[\\/:*?"<>|]+/g, "-") || "dynamic-template"}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      message.success("已导出通过校验的模板定义文件");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "模板导出失败");
    }
  };

  const importDynamicDraft = async (file: File) => {
    try {
      const imported = importDynamicTemplateDraftJson(await file.text());
      const replaceDraft = () => {
        controller.openImportedDraft(imported);
        message.success("已导入模板结构；真实内容值未导入，请在页面装修中配置");
      };
      if (!draft || !dirty) {
        replaceDraft();
        return;
      }
      modal.confirm({
        title: "用导入文件替换当前未保存编辑？",
        content: "当前模板修改将从编辑会话中移除；页面草稿和已保存的本机模板不受影响。",
        okText: "导入为新草稿",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: replaceDraft,
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "模板导入失败");
    }
  };

  return (
    <>
      <TemplateEditorToolbar
        onSave={() => { void saveCurrentTemplate(); }}
        onOpenSaveCopy={openSaveCopy}
        onPublish={draft && !localOnly ? () => { void controller.publish(); } : undefined}
        localOnly={localOnly}
        publishing={publishing}
        publishReview={publishReview}
        onOpenPublishReview={controller.openPublishReview}
        onOpenRecovery={() => setRecoveryDetailsOpen(true)}
        onExport={draft ? exportDynamicDraft : undefined}
        onImport={draft ? () => importFileInputRef.current?.click() : undefined}
        onOpenVersionHistory={draft?.sourceType === "persisted"
          ? () => { void openVersionHistory(); }
          : undefined}
        onArchive={draft?.sourceType === "persisted" && !localOnly
          ? () => moveTemplateToTrash({
              templateId: draft.definition.templateId,
              name: draft.definition.name,
            })
          : undefined}
        onDiscard={draft && dirty && hasBaseline && !draft.compatibilityRecovery
          ? discardCurrentDraft
          : undefined}
        onCloseSession={draft ? controller.closeSession : undefined}
        lifecycleBusy={lifecycleBusy}
        onRequestReturn={controller.returnToPage}
      />
      {draft ? (
        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importDynamicDraft(file);
          }}
        />
      ) : null}
      <div
        className={`homepage-editor__body template-editor__body${previewMode ? " is-previewing" : ""}`}
      >
        {draft?.compatibilityRecovery ? (
          <section
            className={`template-editor__recovery-banner${draft.compatibilityRecovery.status === "source-invalid" ? " is-error" : ""}`}
            role="alert"
            aria-label="修复方案尚未保存"
          >
            <div className="template-editor__recovery-copy">
              <strong>{draft.compatibilityRecovery.status === "source-invalid"
                ? "原草稿无法安全恢复"
                : "修复方案尚未保存，原草稿未覆盖"}</strong>
              <span>{draft.compatibilityRecovery.status === "source-invalid"
                ? "原始数据仍保留在当前会话中；返回修复方案后可继续检查、另存或明确保存。"
                : "当前画布显示系统修复方案；保存、另存或取消前，服务端原草稿保持不变。"}</span>
            </div>
            <div className="template-editor__recovery-actions">
              <Button size="small" onClick={() => setRecoveryDetailsOpen(true)}>查看变化</Button>
              {draft.compatibilityRecovery.status === "source-invalid" ? (
                <Button
                  size="small"
                  type="primary"
                  disabled={lifecycleBusy}
                  onClick={controller.resumeCompatibilityRecovery}
                >
                  返回修复方案
                </Button>
              ) : (
                <>
                  <Button size="small" disabled={lifecycleBusy} onClick={confirmCancelCompatibilityRecovery}>
                    取消本次修复
                  </Button>
                  <Button size="small" disabled={lifecycleBusy} onClick={openSaveCopy}>
                    另存为新模板
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    danger
                    disabled={lifecycleBusy}
                    onClick={() => { void saveCurrentTemplate(); }}
                  >
                    保存修复草稿
                  </Button>
                </>
              )}
            </div>
          </section>
        ) : null}
        <TemplateEditorLibrary
          onArchive={moveTemplateToTrash}
          onDelete={permanentlyDeleteTemplate}
          onOpen={openTemplateTarget}
          onRestore={restoreTemplate}
          localOnly={localOnly}
        />
        {structureCollapsed ? (
          <aside
            className="homepage-editor__structure-workspace template-editor__structure is-collapsed"
            aria-label="模板结构（已收起）"
          >
            <WorkspacePanelCollapseButton
              action="expand"
              panel="structure"
              panelLabel="模板结构面板"
              onClick={() => updateStructureCollapsed(false)}
            />
          </aside>
        ) : draft ? (
          <DynamicTemplateStructurePanel
            onCollapse={inspectorOverlay.compact ? () => updateStructureCollapsed(true) : undefined}
          />
        ) : (
          <aside className="homepage-editor__structure-workspace template-editor__structure template-editor__empty-panel" aria-label="模板结构">
            <WorkspacePanelHeader
              icon={<BlockOutlined />}
              title="模板结构"
              actions={inspectorOverlay.compact ? (
                <WorkspacePanelCollapseButton
                  action="collapse"
                  panel="structure"
                  panelLabel="模板结构面板"
                  onClick={() => updateStructureCollapsed(true)}
                />
              ) : undefined}
            />
            <p>从左侧选择母模板后，这里会显示模板整体、图片槽位、文字槽位和行动对象。</p>
          </aside>
        )}
        {draft ? <DynamicTemplateCanvas /> : (
          <section className="homepage-editor__stage template-editor__stage template-editor__empty-stage" aria-label="空模板画布">
            <div className="template-editor__empty-stage-card">
              <strong>从左侧选择模板进行设计</strong>
              <span>点击模板卡片打开设计，或新建空白模板。拖拽模板只发生在页面装修，不会在这里创建页面模块。</span>
            </div>
          </section>
        )}
        <aside
          ref={inspectorOverlay.panelRef}
          style={inspectorOverlay.compact && !inspectorCollapsed ? { top: inspectorTopInset } : undefined}
          className={`homepage-editor__right-workspace template-editor__right-workspace${inspectorCollapsed ? " is-inspector-collapsed" : ""}`}
          aria-label={inspectorCollapsed ? "模板属性工作区（已收起）" : "模板属性工作区"}
          role={inspectorOverlay.compact && !inspectorCollapsed ? "dialog" : undefined}
          aria-modal={inspectorOverlay.compact && !inspectorCollapsed ? "true" : undefined}
          tabIndex={inspectorOverlay.compact && !inspectorCollapsed ? -1 : undefined}
          data-compact-overlay={inspectorOverlay.compact ? "inspector" : undefined}
          data-compact-overlay-open={!inspectorCollapsed || undefined}
          onKeyDown={inspectorOverlay.onPanelKeyDown}
        >
          {inspectorCollapsed && draft ? (
            <WorkspacePanelCollapseButton
              ref={inspectorOverlay.openButtonRef}
              action="expand"
              panel="inspector"
              panelLabel="模板属性面板"
              compactLabel={selectedObjectLabel ? `属性 · ${selectedObjectLabel}` : "属性"}
              onClick={inspectorOverlay.requestOpen}
            />
          ) : (
            <div className="homepage-editor__inspector-holder">
              <WorkspacePanelHeader
                icon={<ControlOutlined />}
                title="模板属性"
                actions={inspectorOverlay.compact ? (
                  <WorkspacePanelCollapseButton
                    ref={inspectorOverlay.closeButtonRef}
                    action="collapse"
                    panel="inspector"
                    panelLabel="模板属性面板"
                    compactLabel="关闭"
                    onClick={inspectorOverlay.requestClose}
                  />
                ) : undefined}
              />
              {draft && previewMode ? (
                <div
                  className="homepage-editor__inspector template-editor__inspector template-editor__empty-panel"
                  aria-label="模板预览说明"
                >
                  <Alert
                    type="info"
                    showIcon
                    message="预览期间不可编辑"
                    description="预览只验证公共 Renderer 的构图和内容边界，不会修改模板草稿。"
                  />
                  <p>当前场景：{{
                    default: "正常模拟内容",
                    empty: "全部空内容",
                    "long-text": "超长文字",
                    "missing-image": "缺失图片／商品",
                  }[previewScenario]}</p>
                  <p>如需修改尺寸、结构、样式或页面装修权限，请先退出预览。</p>
                  <Button onClick={() => setPreviewMode(false)}>退出预览并继续编辑</Button>
                </div>
              ) : draft ? <DynamicTemplateInspectorPanel
                localOnly={localOnly}
                publishReview={publishReview}
                onSelectPublishIssue={controller.selectPublishIssue}
                onPrepareIssueTarget={prepareIssueTarget}
              /> : (
                <div className="homepage-editor__inspector template-editor__inspector template-editor__empty-panel" aria-label="模板属性">
                  <p>选择模板后，可在这里调整整体比例、设备规则以及当前槽位的精确位置和大小。</p>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <Modal
        title={localOnly ? "另存为本机测试草稿" : "另存为模板"}
        open={copyOpen}
        confirmLoading={modalSaving}
        okText={localOnly ? "另存为本机测试草稿" : "另存为模板"}
        cancelText="取消"
        onOk={() => { void saveTemplateCopy(); }}
        onCancel={() => setCopyOpen(false)}
      >
        <label className="template-editor__modal-field" htmlFor="template-editor-copy-name">
          <span>新模板名称</span>
          <Input
            id="template-editor-copy-name"
            value={copyName}
            maxLength={80}
            autoFocus
            onChange={(event) => setCopyName(event.target.value)}
            onPressEnter={() => { void saveTemplateCopy(); }}
          />
        </label>
        <p className="homepage-editor__properties-hint">
          将创建新的模板草稿；当前模板和页面内容保持不变。
        </p>
        {draft && hasDynamicTemplateCompatibilityState(draft.definition) ? (
          <Alert
            type="warning"
            showIcon
            message="副本不会包含历史默认内容或兼容规则"
            description="系统只复制当前结构、构图、样式和槽位规则；旧模板中的内容与仅供历史读取的空值规则仍保留在来源记录中。"
          />
        ) : null}
      </Modal>

      <Modal
        title="系统修复方案变化"
        open={recoveryDetailsOpen && Boolean(draft?.compatibilityRecovery)}
        footer={draft?.compatibilityRecovery ? (
          <div className="template-editor__recovery-modal-actions">
            <Button onClick={() => setRecoveryDetailsOpen(false)}>关闭</Button>
            {draft.compatibilityRecovery.status === "source-invalid" ? (
              <Button type="primary" onClick={() => {
                controller.resumeCompatibilityRecovery();
                setRecoveryDetailsOpen(false);
              }}>
                返回修复方案
              </Button>
            ) : (
              <>
                <Button onClick={confirmCancelCompatibilityRecovery}>
                  取消本次修复
                </Button>
                <Button onClick={() => {
                  setRecoveryDetailsOpen(false);
                  openSaveCopy();
                }}>
                  另存为新模板
                </Button>
                <Button type="primary" danger onClick={() => {
                  setRecoveryDetailsOpen(false);
                  void saveCurrentTemplate();
                }}>
                  保存修复草稿
                </Button>
              </>
            )}
          </div>
        ) : <Button onClick={() => setRecoveryDetailsOpen(false)}>关闭</Button>}
        onCancel={() => setRecoveryDetailsOpen(false)}
      >
        {draft?.compatibilityRecovery ? (() => {
          const validation = validateDynamicTemplateDefinition(
            draft.compatibilityRecovery.originalDefinition,
          );
          if (!validation.valid || !validation.definition) {
            return (
              <div className="template-editor__recovery-details">
                <Alert
                  type="error"
                  showIcon
                  message="原草稿未通过当前结构校验"
                  description="原始数据仍只保留在当前编辑会话中，没有写入或覆盖服务端。"
                />
                <ul>
                  {validation.issues.slice(0, 6).map((issue) => (
                    <li key={`${issue.code}:${issue.path}`}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            );
          }
          const diff = summarizeTemplateHistoryDiff(
            validation.definition,
            draft.definition,
          );
          return (
            <div className="template-editor__recovery-details">
              <p>
                比较基线：服务端草稿 revision {draft.compatibilityRecovery.sourceRevision}；校验摘要 {draft.compatibilityRecovery.sourceChecksum.slice(0, 16)}。
              </p>
              <dl>
                <div><dt>节点</dt><dd>新增 {diff.nodesAdded}，移除 {diff.nodesRemoved}，修改 {diff.nodesChanged}</dd></div>
                <div><dt>槽位</dt><dd>新增 {diff.slotsAdded}，移除 {diff.slotsRemoved}，修改 {diff.slotsChanged}</dd></div>
                <div><dt>响应式</dt><dd>{diff.responsiveRulesChanged} 处变化</dd></div>
                <div><dt>样式</dt><dd>{diff.styleRulesChanged} 处变化</dd></div>
                <div><dt>根节点</dt><dd>{diff.rootChanged ? "已变化" : "未变化"}</dd></div>
                <div><dt>元数据</dt><dd>{diff.metadataChanged ? "已变化" : "未变化"}</dd></div>
              </dl>
              <p>查看变化不会保存、发布或修改任何页面。</p>
            </div>
          );
        })() : null}
      </Modal>

      <Modal
        title="模板版本历史"
        open={versionsOpen}
        width={900}
        footer={<Button onClick={() => setVersionsOpen(false)}>关闭</Button>}
        onCancel={() => {
          versionRequestIdRef.current += 1;
          setVersionsOpen(false);
        }}
      >
        <Alert
          type="info"
          showIcon
          message="历史读取与载入都不会自动写入"
          description="页面实例继续锁定原版本。只有随后明确点击保存或发布，当前模板才会进入既有持久化流程。"
        />
        {versionsLoading ? <div role="status"><Spin /> 正在读取版本历史…</div> : null}
        {versionsError ? (
          <Alert
            type="error"
            showIcon
            message={versionsError}
            action={<Button onClick={() => { void openVersionHistory(); }}>重试</Button>}
          />
        ) : null}
        {!versionsLoading && !versionsError && draft ? (
          <div className="template-editor__history-layout">
            <div className="template-editor__history-list" role="list" aria-label="模板正式版本">
              {versions.map((version) => (
                <Button
                  key={version.version}
                  type={selectedVersion === version.version ? "primary" : "text"}
                  block
                  style={{ height: "auto", justifyContent: "flex-start", marginBottom: 6 }}
                  onClick={() => { void selectHistoricalVersion(version.version); }}
                >
                  v{version.version} · {new Date(version.publishedAt).toLocaleString("zh-CN")}
                </Button>
              ))}
              {versionsNextBefore ? (
                <Button block loading={versionsLoadingMore} onClick={() => { void loadOlderVersions(); }}>
                  加载更早版本
                </Button>
              ) : null}
              {versions.length === 0 ? <span className="homepage-editor__properties-hint">尚未发布正式版本</span> : null}
            </div>
            <section className="template-editor__history-detail" aria-label={selectedVersion ? `正式版本 ${selectedVersion} 预览` : "正式版本详情"}>
              {versionDetailLoading ? <div role="status"><Spin /> 正在校验版本详情…</div> : null}
              {versionDetailError ? (
                <Alert
                  type="error"
                  showIcon
                  message={versionDetailError}
                  action={selectedVersion ? (
                    <Button onClick={() => { void selectHistoricalVersion(selectedVersion); }}>重试</Button>
                  ) : undefined}
                />
              ) : null}
              {selectedVersionDetail ? (() => {
                const version = selectedVersionDetail;
                const draftDiff = summarizeTemplateHistoryDiff(version.definition, draft.definition);
                const publishedDiff = currentPublishedDetail
                  ? summarizeTemplateHistoryDiff(version.definition, currentPublishedDetail.definition)
                  : null;
                const renderDiff = (label: string, diff: ReturnType<typeof summarizeTemplateHistoryDiff>) => (
                  <div>
                    <strong>{label}</strong>
                    <p>节点 +{diff.nodesAdded} / -{diff.nodesRemoved} / 改 {diff.nodesChanged}；槽位 +{diff.slotsAdded} / -{diff.slotsRemoved} / 改 {diff.slotsChanged}</p>
                    <p>响应式 {diff.responsiveRulesChanged} 处；样式 {diff.styleRulesChanged} 处；根节点 {diff.rootChanged ? "已变" : "未变"}；元数据 {diff.metadataChanged ? "已变" : "未变"}</p>
                  </div>
                );
                return (
                  <>
                    <strong>v{version.version}</strong>
                    <p>{version.versionNote || "未填写版本说明"}</p>
                    <code>{version.definitionChecksum.slice(0, 16)}</code>
                    <div className="template-editor__history-preview">
                      <DynamicTemplateRenderer definition={version.definition} device={device} mode="thumbnail" />
                    </div>
                    {renderDiff("与当前草稿比较", draftDiff)}
                    {publishedDiff ? renderDiff("与当前正式版本比较", publishedDiff) : (
                      <p className="homepage-editor__properties-hint">当前正式版本详情暂不可用，不影响所选版本查看。</p>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <Button type="primary" onClick={() => confirmStageHistoricalVersion("current")}>载入当前草稿</Button>
                      <Button onClick={() => confirmStageHistoricalVersion("new")}>从此版本新建草稿</Button>
                    </div>
                  </>
                );
              })() : null}
            </section>
          </div>
        ) : null}
      </Modal>

      <span className="sr-only" role="status" aria-live="polite">
        {saveStatus === "saving"
          ? "正在保存模板"
          : saveStatus === "error"
            ? "模板保存失败，修改仍在"
            : saveStatus === "permission-error"
              ? "模板保存权限不足，修改仍在，可显式重试"
            : saveStatus === "conflict"
              ? "模板保存冲突，修改仍在，请另存为新模板"
            : saveStatus === "publish-error"
              ? "模板发布失败，草稿仍在"
              : saveStatus === "publish-success"
                ? "模板新版本已发布，已有页面保持原版本"
                : ""}
      </span>
    </>
  );
}
