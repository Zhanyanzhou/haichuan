import { App as AntdApp, Alert, Button, Input, Modal, Spin } from "antd";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import DynamicTemplateCanvas from "./DynamicTemplateCanvas";
import DynamicTemplateInspectorPanel from "./DynamicTemplateInspectorPanel";
import DynamicTemplateStructurePanel from "./DynamicTemplateStructurePanel";
import TemplateEditorToolbar from "./TemplateEditorToolbar";
import { hasUnpersistedTemplateDraft, useTemplateEditorSession } from "./templateEditorSession";
import {
  exportDynamicTemplateDraftJson,
  importDynamicTemplateDraftJson,
} from "./dynamicTemplateDraftRepository";
import WorkspacePanelHeader from "../workspace/WorkspacePanelHeader";
import WorkspacePanelCollapseButton from "../workspace/WorkspacePanelCollapseButton";
import { BlockOutlined, ControlOutlined } from "@ant-design/icons";
import TemplateEditorLibrary, {
  type TemplateEditorLibraryTarget,
} from "./TemplateEditorLibrary";
import { notifyDynamicTemplateCatalogChanged } from "./templateCatalogEvents";
import { DynamicTemplateRenderer } from "../template-definition";
import { unwrapResponse } from "@/utils/unwrap";
import {
  dynamicTemplateApi,
  type DynamicTemplateVersionResource,
} from "@/services/clients/dynamicTemplateClient";

export interface PersistTemplateOptions {
  asCopy?: boolean;
  overwriteCurrent?: boolean;
  name?: string;
}

function getTemplateLifecycleErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const detail = error.message.trim();
  return detail && !/^Request failed with status code \d+$/.test(detail) ? detail : fallback;
}

export default function TemplateWorkspace({
  onPersist,
  onPublish,
  localOnly = false,
  publishing = false,
  onReturnPage,
  onOpenSystemTemplate,
  onOpenPersonalTemplate,
  onCreateDynamicTemplate,
  onOpenDynamicTemplate,
  onOpenPersistedDynamicTemplate,
}: {
  onPersist: (options?: PersistTemplateOptions) => Promise<boolean>;
  onPublish?: () => Promise<boolean>;
  localOnly?: boolean;
  publishing?: boolean;
  onReturnPage: () => void;
  onOpenSystemTemplate: (
    moduleType: string,
    current?: import("@/services/api").SystemContentTemplateCurrent,
  ) => void;
  onOpenPersonalTemplate: (template: import("@/services/api").PersonalContentTemplate) => void;
  onCreateDynamicTemplate: () => void;
  onOpenDynamicTemplate: (localDraftId: string) => void;
  onOpenPersistedDynamicTemplate: (template: import("@/services/clients/dynamicTemplateClient").DynamicTemplateResource) => void;
}) {
  const { message, modal } = AntdApp.useApp();
  const [structureCollapsed, setStructureCollapsed] = useState(() => {
    try {
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
      return sessionStorage.getItem("template-editor-inspector-collapsed") === "1";
    } catch {
      return false;
    }
  });
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
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [versions, setVersions] = useState<DynamicTemplateVersionResource[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [draggingTemplateTarget, setDraggingTemplateTarget] = useState<TemplateEditorLibraryTarget | null>(null);
  const transitionInFlightRef = useRef(false);
  const lifecycleInFlightRef = useRef(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const draft = useTemplateEditorSession((state) => state.draft);
  const device = useTemplateEditorSession((state) => state.device);
  const previewMode = useTemplateEditorSession((state) => state.previewMode);
  const saveStatus = useTemplateEditorSession((state) => state.saveStatus);

  const openTemplateTarget = useCallback((target: TemplateEditorLibraryTarget) => {
    if (target.kind === "system-fixed") onOpenSystemTemplate(target.moduleType, target.current);
    else if (target.kind === "personal-fixed") onOpenPersonalTemplate(target.template);
    else if (target.kind === "dynamic-persisted") onOpenPersistedDynamicTemplate(target.template);
    else if (target.kind === "dynamic-local") onOpenDynamicTemplate(target.localDraftId);
    else onCreateDynamicTemplate();
  }, [
    onCreateDynamicTemplate,
    onOpenDynamicTemplate,
    onOpenPersistedDynamicTemplate,
    onOpenPersonalTemplate,
    onOpenSystemTemplate,
  ]);

  const saveBeforeTransition = useCallback(async (next: () => void) => {
    if (transitionInFlightRef.current) return;
    if (!hasUnpersistedTemplateDraft()) {
      next();
      return;
    }
    transitionInFlightRef.current = true;
    const saved = await onPersist({ overwriteCurrent: true });
    transitionInFlightRef.current = false;
    if (saved) next();
  }, [onPersist]);

  const requestOpenTemplateTarget = useCallback((target: TemplateEditorLibraryTarget) => {
    void saveBeforeTransition(() => openTemplateTarget(target));
  }, [openTemplateTarget, saveBeforeTransition]);

  const requestReturn = () => {
    void saveBeforeTransition(onReturnPage);
  };

  const archiveCurrentTemplate = () => {
    const current = useTemplateEditorSession.getState();
    const currentDraft = current.draft;
    if (localOnly || currentDraft?.sourceType !== "persisted" || lifecycleInFlightRef.current) return;
    let archiveDialog: { destroy: () => void } | null = null;
    archiveDialog = modal.confirm({
      title: `归档模板“${currentDraft.definition.name}”？`,
      content: current.dirty
        ? "当前未保存的模板修改会被丢弃。归档不会删除已发布版本，也不会修改已经使用该模板的页面；页面装修将不能再新增此模板。"
        : "归档不会删除已发布版本，也不会修改已经使用该模板的页面；页面装修将不能再新增此模板。",
      okText: "归档模板",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        lifecycleInFlightRef.current = true;
        setLifecycleBusy(true);
        try {
          await dynamicTemplateApi.archive(currentDraft.definition.templateId);
          archiveDialog?.destroy();
          useTemplateEditorSession.getState().close();
          notifyDynamicTemplateCatalogChanged();
          message.success(`模板“${currentDraft.definition.name}”已归档；已有页面实例保持不变`);
        } catch (error) {
          message.error(getTemplateLifecycleErrorMessage(error, "模板归档失败，当前模板仍保留"));
        } finally {
          lifecycleInFlightRef.current = false;
          setLifecycleBusy(false);
        }
      },
    });
  };

  const restoreTemplate = (template: import("@/services/clients/dynamicTemplateClient").DynamicTemplateResource) => {
    if (localOnly || lifecycleInFlightRef.current) return;
    modal.confirm({
      title: `恢复模板“${template.name}”？`,
      content: "恢复后模板会重新进入可设计状态；若已有正式版本，也会重新进入页面装修目录。已有页面实例不会被修改。",
      okText: "恢复模板",
      cancelText: "取消",
      onOk: async () => {
        lifecycleInFlightRef.current = true;
        setLifecycleBusy(true);
        try {
          await dynamicTemplateApi.restore(template.templateId);
          notifyDynamicTemplateCatalogChanged();
          message.success(`模板“${template.name}”已恢复`);
        } catch (error) {
          message.error(getTemplateLifecycleErrorMessage(error, "模板恢复失败，请重试"));
        } finally {
          lifecycleInFlightRef.current = false;
          setLifecycleBusy(false);
        }
      },
    });
  };

  const saveCurrentTemplate = async () => {
    if (!draft) return;
    if (localOnly) {
      modal.confirm({
        title: "保存本机测试草稿",
        content: "只写入当前浏览器本机存储，不创建服务端模板。",
        okText: "更新本机测试草稿",
        cancelText: "取消",
        onOk: async () => {
          const saved = await onPersist({ overwriteCurrent: true });
          if (!saved) throw new Error("本机测试草稿保存失败");
        },
      });
      return;
    }
    await onPersist({ overwriteCurrent: true });
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
    const saved = await onPersist({ asCopy: true, name });
    setModalSaving(false);
    if (saved) setCopyOpen(false);
  };

  const openVersionHistory = async () => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    setVersionsOpen(true);
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      if (currentDraft.sourceType === "persisted") {
        const response = await dynamicTemplateApi.listVersions(currentDraft.definition.templateId);
        const list = unwrapResponse<DynamicTemplateVersionResource[]>(response) ?? [];
        setVersions(list);
        setSelectedVersion(list[0]?.version ?? null);
      } else {
        setVersionsOpen(false);
      }
    } catch {
      setVersionsError("版本历史读取失败，当前模板草稿未改变");
    } finally {
      setVersionsLoading(false);
    }
  };

  const exportDynamicDraft = () => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    try {
      const source = exportDynamicTemplateDraftJson(currentDraft);
      const blob = new Blob([source], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${currentDraft.definition.name.replace(/[\\/:*?"<>|]+/g, "-") || "dynamic-template"}.json`;
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
        const session = useTemplateEditorSession.getState();
        session.open(imported, { isNew: true });
        session.selectObject(imported.definition.rootNodeId);
        message.success("已导入为新的本机模板草稿，原模板未被覆盖");
      };
      if (!hasUnpersistedTemplateDraft()) {
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

  const handleTemplateDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!draggingTemplateTarget) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(".template-editor__stage")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "link";
  };
  const handleTemplateDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!draggingTemplateTarget) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(".template-editor__stage")) return;
    event.preventDefault();
    const nextTarget = draggingTemplateTarget;
    setDraggingTemplateTarget(null);
    requestOpenTemplateTarget(nextTarget);
  };

  return (
    <>
      <TemplateEditorToolbar
        onSave={() => { void saveCurrentTemplate(); }}
        onOpenSaveCopy={openSaveCopy}
        onPublish={draft && onPublish ? () => { void onPublish(); } : undefined}
        localOnly={localOnly}
        publishing={publishing}
        onExport={draft ? exportDynamicDraft : undefined}
        onImport={draft ? () => importFileInputRef.current?.click() : undefined}
        onOpenVersionHistory={draft?.sourceType === "persisted"
          ? () => { void openVersionHistory(); }
          : undefined}
        onArchive={draft?.sourceType === "persisted" && !localOnly
          ? archiveCurrentTemplate
          : undefined}
        lifecycleBusy={lifecycleBusy}
        onRequestReturn={requestReturn}
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
        className={`homepage-editor__body template-editor__body${previewMode ? " is-previewing" : ""}${draggingTemplateTarget ? " is-template-dragging" : ""}`}
        onDragOver={handleTemplateDragOver}
        onDrop={handleTemplateDrop}
      >
        <TemplateEditorLibrary
          onOpen={requestOpenTemplateTarget}
          onRestore={restoreTemplate}
          onDragTargetChange={setDraggingTemplateTarget}
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
              onClick={() => setStructureCollapsed(false)}
            />
          </aside>
        ) : draft ? (
          <DynamicTemplateStructurePanel onCollapse={() => setStructureCollapsed(true)} />
        ) : (
          <aside className="homepage-editor__structure-workspace template-editor__structure template-editor__empty-panel" aria-label="模板结构">
            <WorkspacePanelHeader
              icon={<BlockOutlined />}
              title="模板结构"
              actions={(
                <WorkspacePanelCollapseButton
                  action="collapse"
                  panel="structure"
                  panelLabel="模板结构面板"
                  onClick={() => setStructureCollapsed(true)}
                />
              )}
            />
            <p>从左侧选择母模板后，这里会显示模板整体、图片槽位、文字槽位和行动对象。</p>
          </aside>
        )}
        {draft ? <DynamicTemplateCanvas /> : (
          <section className="homepage-editor__stage template-editor__stage template-editor__empty-stage" aria-label="空模板画布">
            <div className="template-editor__empty-stage-card">
              <strong>从左侧选择模板进行设计</strong>
              <span>点击模板卡片即可打开；拖入画布是辅助操作。模板会在隔离会话中编辑，不会写入当前页面草稿。</span>
            </div>
          </section>
        )}
        <aside
          className={`homepage-editor__right-workspace template-editor__right-workspace${inspectorCollapsed ? " is-inspector-collapsed" : ""}`}
          aria-label={inspectorCollapsed ? "模板属性工作区（已收起）" : "模板属性工作区"}
        >
          {inspectorCollapsed ? (
            <WorkspacePanelCollapseButton
              action="expand"
              panel="inspector"
              panelLabel="模板属性面板"
              onClick={() => setInspectorCollapsed(false)}
            />
          ) : (
            <div className="homepage-editor__inspector-holder">
              <WorkspacePanelHeader
                icon={<ControlOutlined />}
                title="模板属性"
                actions={(
                  <WorkspacePanelCollapseButton
                    action="collapse"
                    panel="inspector"
                    panelLabel="模板属性面板"
                    onClick={() => setInspectorCollapsed(true)}
                  />
                )}
              />
              {draft ? <DynamicTemplateInspectorPanel /> : (
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
      </Modal>

      <Modal
        title="模板版本历史"
        open={versionsOpen}
        width={900}
        footer={<Button onClick={() => setVersionsOpen(false)}>关闭</Button>}
        onCancel={() => setVersionsOpen(false)}
      >
        <p>页面中已使用的模板会继续保留添加或升级时选择的版本；此处仅供查看，不会修改模板草稿、正式版本或任何页面。</p>
        {versionsLoading ? <div role="status"><Spin /> 正在读取版本历史…</div> : null}
        {versionsError ? <Alert type="error" showIcon message={versionsError} /> : null}
        {!versionsLoading && !versionsError && draft ? (
          <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: 16 }}>
            <div role="list" aria-label="模板正式版本">
              {versions.map((version) => (
                <Button
                  key={version.version}
                  type={selectedVersion === version.version ? "primary" : "text"}
                  block
                  style={{ height: "auto", justifyContent: "flex-start", marginBottom: 6 }}
                  onClick={() => setSelectedVersion(version.version)}
                >
                  v{version.version} · {new Date(version.publishedAt).toLocaleString("zh-CN")}
                </Button>
              ))}
              {versions.length === 0 ? <span className="homepage-editor__properties-hint">尚未发布正式版本</span> : null}
            </div>
            {versions.find((version) => version.version === selectedVersion) ? (() => {
              const version = versions.find((item) => item.version === selectedVersion)!;
              return (
                <section aria-label={`正式版本 ${version.version} 预览`}>
                  <strong>v{version.version}</strong>
                  <p>{version.versionNote || "未填写版本说明"}</p>
                  <code>{version.definitionChecksum.slice(0, 16)}</code>
                  <DynamicTemplateRenderer definition={version.definition} device={device} mode="thumbnail" />
                </section>
              );
            })() : null}
          </div>
        ) : null}
      </Modal>

      <span className="sr-only" role="status" aria-live="polite">
        {saveStatus === "saving" ? "正在保存模板" : saveStatus === "error" ? "模板保存失败，修改仍在" : ""}
      </span>
    </>
  );
}
