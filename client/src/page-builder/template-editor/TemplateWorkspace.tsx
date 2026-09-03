import { App as AntdApp, Alert, Button, Input, Modal, Spin } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { BlockOutlined, ControlOutlined } from "@ant-design/icons";
import TemplateEditorLibrary, {
  type TemplateEditorLibraryTarget,
} from "./TemplateEditorLibrary";
import { hasDynamicTemplateCompatibilityState } from "./dynamicTemplateEditorUtils";
import type { TemplateWorkspaceController } from "./TemplateWorkspaceController";
import { DynamicTemplateRenderer } from "../template-definition";
import {
  type DynamicTemplateResource,
  type DynamicTemplateVersionResource,
} from "@/services/clients/dynamicTemplateClient";

type TemplateTransitionDestination = "page" | "template";

export default function TemplateWorkspace({
  controller,
}: {
  controller: TemplateWorkspaceController;
}) {
  const { message, modal } = AntdApp.useApp();
  const {
    localOnly,
    publishing,
    lifecycleBusy,
    draft,
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
  const transitionInFlightRef = useRef(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const openTemplateTarget = useCallback((target: TemplateEditorLibraryTarget) => {
    controller.openTarget(target);
  }, [controller]);

  const requestTransition = useCallback((
    next: () => void,
    destination: TemplateTransitionDestination,
  ) => {
    if (transitionInFlightRef.current) return;
    if (saveStatus === "saving" || publishing || lifecycleBusy) {
      message.info(
        publishing
          ? "正在发布模板，请等待完成后再切换"
          : lifecycleBusy
            ? "正在更新模板状态，请等待完成后再切换"
            : "正在保存模板，请等待完成后再切换",
      );
      return;
    }
    if (!draft || !dirty) {
      next();
      return;
    }
    transitionInFlightRef.current = true;
    const currentTemplateName = draft.definition.name.trim()
      || "当前模板";
    const transitionCopy = destination === "page"
      ? {
          title: "返回页面装修？",
          discardText: "放弃修改并返回",
          saveText: "保存草稿并返回",
        }
      : {
          title: "切换模板？",
          discardText: "放弃修改并切换",
          saveText: "保存草稿并切换",
        };
    let dialog: { destroy: () => void } | null = null;
    const finish = (action: "discard" | "cancel") => {
      dialog?.destroy();
      transitionInFlightRef.current = false;
      if (action === "discard") next();
    };
    dialog = modal.confirm({
      className: "template-editor__transition-modal",
      width: 520,
      style: { maxWidth: "calc(100vw - 32px)" },
      title: transitionCopy.title,
      content: (
        <div className="template-editor__transition-confirm">
          <p className="template-editor__transition-summary">
            模板“{currentTemplateName}”还有未保存修改。
          </p>
          <p className="template-editor__transition-note">
            保存后将作为模板草稿；已发布模板和页面草稿不会受到影响。
          </p>
        </div>
      ),
      okText: transitionCopy.saveText,
      cancelText: "继续编辑模板",
      autoFocusButton: "cancel",
      footer: (_, { OkBtn, CancelBtn }) => (
        <div className="template-editor__transition-footer">
          <Button danger onClick={() => finish("discard")}>
            {transitionCopy.discardText}
          </Button>
          <div className="template-editor__transition-footer-actions">
            <CancelBtn />
            <OkBtn />
          </div>
        </div>
      ),
      onOk: async () => {
        const saved = await controller.persist({ overwriteCurrent: true });
        transitionInFlightRef.current = false;
        if (saved) next();
      },
      onCancel: () => finish("cancel"),
      afterClose: () => {
        transitionInFlightRef.current = false;
      },
    });
  }, [controller, dirty, draft, lifecycleBusy, message, modal, publishing, saveStatus]);

  const requestOpenTemplateTarget = useCallback((target: TemplateEditorLibraryTarget) => {
    requestTransition(() => openTemplateTarget(target), "template");
  }, [openTemplateTarget, requestTransition]);

  const requestReturn = () => {
    requestTransition(controller.returnToPage, "page");
  };

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
    if (!draft || !dirty) return;
    modal.confirm({
      title: `放弃“${draft.definition.name}”的未保存修改？`,
      content: hasBaseline
        ? "当前编辑会恢复到最近一次已保存草稿；正式版本和页面实例不会改变。"
        : "这是尚未保存的新模板，放弃后只会清除当前本地编辑会话。",
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
    const saved = await controller.persist({ asCopy: true, name });
    setModalSaving(false);
    if (saved) setCopyOpen(false);
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
      const list = await controller.listVersions();
      setVersions(list);
      setSelectedVersion(list[0]?.version ?? null);
    } catch {
      setVersionsError("版本历史读取失败，当前模板草稿未改变");
    } finally {
      setVersionsLoading(false);
    }
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
        onDiscard={draft && dirty
          ? discardCurrentDraft
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
        className={`homepage-editor__body template-editor__body${previewMode ? " is-previewing" : ""}`}
      >
        <TemplateEditorLibrary
          onArchive={moveTemplateToTrash}
          onDelete={permanentlyDeleteTemplate}
          onOpen={requestOpenTemplateTarget}
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
                  onClick={() => updateStructureCollapsed(true)}
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
              <span>点击模板卡片打开设计，或新建空白模板。拖拽模板只发生在页面装修，不会在这里创建页面模块。</span>
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
              onClick={() => updateInspectorCollapsed(false)}
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
                    onClick={() => updateInspectorCollapsed(true)}
                  />
                )}
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
              ) : draft ? <DynamicTemplateInspectorPanel localOnly={localOnly} /> : (
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
        {saveStatus === "saving"
          ? "正在保存模板"
          : saveStatus === "error"
            ? "模板保存失败，修改仍在"
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
