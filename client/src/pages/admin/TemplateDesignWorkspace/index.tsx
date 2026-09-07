import { App as AntdApp, Button } from "antd";
import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";

import FourZoneWorkspaceShell, {
  type FourZoneWorkspaceZone,
} from "@/page-builder/workspace/FourZoneWorkspaceShell";
import "@/page-builder/template-editor/TemplateWorkspace.css";
import { useTemplateEditorSession } from "@/page-builder/template-editor/templateEditorSession";
import type { TemplateWorkspaceController } from "@/page-builder/template-editor/TemplateWorkspaceController";
import TemplateBlueprintCanvas from "./TemplateBlueprintCanvas";
import TemplateCapabilityLibrary from "./TemplateCapabilityLibrary";
import TemplateConstraintInspector from "./TemplateConstraintInspector";
import TemplateDesignDirectory from "./TemplateDesignDirectory";
import TemplateStructureTree from "./TemplateStructureTree";
import {
  createTemplateDraftFromExisting,
  createTrulyBlankTemplateDraft,
  insertTemplateAuthoringNode,
  openTemplateAuthoringDraft,
  type TemplateAuthoringInsertRequest,
} from "./templateAuthoringAdapter";
import "./TemplateDesignWorkspace.css";

export interface TemplateDesignWorkspaceProps {
  controller: TemplateWorkspaceController;
}

const COMPACT_REGIONS: readonly FourZoneWorkspaceZone[] = [
  "canvas",
  "library",
  "tree",
  "inspector",
];

export default function TemplateDesignWorkspace({
  controller,
}: TemplateDesignWorkspaceProps) {
  const titleId = useId();
  const panelIdPrefix = useId();
  const { message } = AntdApp.useApp();
  const rootRef = useRef<HTMLElement>(null);
  const [compactActiveRegion, setCompactActiveRegion] = useState<FourZoneWorkspaceZone>("canvas");
  const draft = useTemplateEditorSession((state) => state.draft);
  const sessionId = useTemplateEditorSession((state) => state.sessionId);
  const selectedObjectId = useTemplateEditorSession((state) => state.selectedObjectId);
  const selectedContractRole = useTemplateEditorSession((state) => state.selectedContractRole);
  const historyPastCount = useTemplateEditorSession((state) => state.historyPast.length);
  const historyFutureCount = useTemplateEditorSession((state) => state.historyFuture.length);
  const templateName = draft?.definition.name ?? "未打开模板";
  const persistenceAvailable = controller.canManageTemplates && !controller.localOnly;

  const focusRegion = useCallback((region: FourZoneWorkspaceZone) => {
    window.requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-zone="${region}"]`)
        ?.focus({ preventScroll: true });
    });
  }, []);

  const activateCompactRegion = useCallback((region: FourZoneWorkspaceZone) => {
    setCompactActiveRegion(region);
    focusRegion(region);
  }, [focusRegion]);

  const handleCompactTabKeyDown = useCallback((
    event: KeyboardEvent<HTMLButtonElement>,
    currentRegion: FourZoneWorkspaceZone,
  ) => {
    const currentIndex = COMPACT_REGIONS.indexOf(currentRegion);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % COMPACT_REGIONS.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + COMPACT_REGIONS.length) % COMPACT_REGIONS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = COMPACT_REGIONS.length - 1;
    else return;
    event.preventDefault();
    const nextRegion = COMPACT_REGIONS[nextIndex];
    setCompactActiveRegion(nextRegion);
    rootRef.current
      ?.querySelector<HTMLButtonElement>(`[data-compact-tab="${nextRegion}"]`)
      ?.focus();
  }, []);

  const startDraft = useCallback((nextDraft: ReturnType<typeof createTrulyBlankTemplateDraft>) => {
    if (!controller.canManageTemplates) {
      message.warning("当前账号没有模板管理权限。");
      return;
    }
    if (useTemplateEditorSession.getState().dirty) {
      message.warning("当前模板还有未保存修改。请先保存草稿或撤销修改，再切换模板。");
      return;
    }
    openTemplateAuthoringDraft(nextDraft);
    setCompactActiveRegion("canvas");
    focusRegion("canvas");
  }, [controller.canManageTemplates, focusRegion, message]);

  const createBlank = useCallback(() => {
    startDraft(createTrulyBlankTemplateDraft());
  }, [startDraft]);

  const insertNode = useCallback((request: TemplateAuthoringInsertRequest) => {
    const result = insertTemplateAuthoringNode(request);
    if (!result.ok) {
      // 适配器失败文案是随稳定 code 预先编写的界面提示，不是服务端异常正文；
      // 后台文案规范只禁止透传异常原文，这里解构后原样使用不建立第二文案源。
      const { message: insertFailureCopy } = result;
      message.error(`${insertFailureCopy} 当前草稿未改变。`);
      return;
    }
    if (window.matchMedia("(max-width: 1199px)").matches) {
      setCompactActiveRegion("inspector");
    }
    focusRegion(result.focusTarget);
  }, [focusRegion, message]);

  const saveDraft = useCallback(async () => {
    if (!persistenceAvailable) {
      message.warning("服务端模板草稿仓储尚未接通；当前不会改用本机存储代替保存。");
      return;
    }
    await controller.persist({ overwriteCurrent: true });
  }, [controller, message, persistenceAvailable]);

  const sectionPatternSlotLibrary = (
    <>
      <TemplateDesignDirectory
        enabled={controller.active}
        canManageTemplates={controller.canManageTemplates}
        activeTemplateId={draft?.definition.templateId ?? null}
        onCreateBlank={createBlank}
        onCreateFrom={(definition) => startDraft(createTemplateDraftFromExisting(definition))}
        onOpenDraft={(template) => controller.openTarget({
          kind: "dynamic-persisted",
          template,
        })}
      />
      <TemplateCapabilityLibrary
        disabled={!draft || !controller.canManageTemplates}
        onInsert={insertNode}
      />
    </>
  );
  const templateStructureTree = (
    <TemplateStructureTree
      definition={draft?.definition ?? null}
      selectedNodeId={selectedObjectId}
      onSelect={(nodeId) => useTemplateEditorSession.getState().selectObject(nodeId)}
    />
  );
  const templateBlueprintCanvas = (
    <TemplateBlueprintCanvas
      definition={draft?.definition ?? null}
      device={controller.device}
      selectedNodeId={selectedObjectId}
      selectedContractRole={selectedContractRole}
      sessionId={sessionId}
      onInsert={insertNode}
      onSelectNode={(nodeId) => useTemplateEditorSession.getState().selectObject(nodeId)}
      onSelectContractRole={(nodeId, roleId) => (
        useTemplateEditorSession.getState().selectContractRole(nodeId, roleId)
      )}
      onCreateBlank={createBlank}
      canCreate={controller.canManageTemplates}
    />
  );
  const templateConstraintInspector = (
    <TemplateConstraintInspector
      draft={draft}
      selectedNodeId={selectedObjectId}
      localOnly={controller.localOnly}
    />
  );

  return (
    <section
      ref={rootRef}
      className="template-design-workspace"
      aria-labelledby={titleId}
      data-workspace-root="template-design"
      data-mobile-strategy="canvas-first-exclusive-tabs"
      data-mobile-reference-viewport="390x844"
    >
      <header className="template-design-workspace__header">
        <div className="template-design-workspace__identity">
          <span>母模板设计</span>
          <h1 id={titleId}>{templateName}</h1>
        </div>
        <div className="template-design-workspace__toolbar" aria-label="模板草稿操作">
          <span data-template-save-status={controller.saveStatus}>
            {!draft ? "未打开模板" : controller.dirty ? "有未保存修改" : "草稿已同步"}
          </span>
          <Button
            disabled={historyPastCount === 0}
            onClick={() => useTemplateEditorSession.getState().undo()}
          >
            撤销
          </Button>
          <Button
            disabled={historyFutureCount === 0}
            onClick={() => useTemplateEditorSession.getState().redo()}
          >
            重做
          </Button>
          <Button
            aria-pressed={controller.device === "desktop"}
            onClick={() => useTemplateEditorSession.getState().setDevice("desktop")}
          >
            桌面预览
          </Button>
          <Button
            aria-pressed={controller.device === "mobile"}
            onClick={() => useTemplateEditorSession.getState().setDevice("mobile")}
          >
            手机预览
          </Button>
          <Button
            disabled={!draft || !controller.dirty || controller.saveStatus === "saving" || !persistenceAvailable}
            loading={controller.saveStatus === "saving"}
            type="primary"
            onClick={() => void saveDraft()}
          >
            保存模板草稿
          </Button>
        </div>
      </header>
      {!persistenceAvailable ? (
        <p className="template-design-workspace__persistence-blocked" role="status">
          服务端模板草稿仓储当前不可用；保存已关闭，不会写入本机存储或伪造成功。
        </p>
      ) : null}
      <div className="template-design-workspace__compact-tabs" role="tablist" aria-label="模板设计面板">
        {([
          ["canvas", "画布"],
          ["library", "能力库"],
          ["tree", "结构"],
          ["inspector", "属性"],
        ] as const).map(([region, label]) => (
          <button
            key={region}
            type="button"
            role="tab"
            id={`${panelIdPrefix}-${region}-tab`}
            aria-controls={`${panelIdPrefix}-${region}-panel`}
            aria-selected={compactActiveRegion === region}
            tabIndex={compactActiveRegion === region ? 0 : -1}
            data-compact-tab={region}
            onClick={() => activateCompactRegion(region)}
            onKeyDown={(event) => handleCompactTabKeyDown(event, region)}
          >
            {label}
          </button>
        ))}
      </div>
      <FourZoneWorkspaceShell
        ariaLabel={`${templateName}母模板设计工作区`}
        className="template-design-workspace__body"
        library={{
          id: `${panelIdPrefix}-library-panel`,
          label: "Section、Pattern 与 Slot 库",
          content: sectionPatternSlotLibrary,
        }}
        tree={{
          id: `${panelIdPrefix}-tree-panel`,
          label: "模板结构树",
          content: templateStructureTree,
          collapsedSummary: "模板结构树已收起",
        }}
        canvas={{
          id: `${panelIdPrefix}-canvas-panel`,
          label: "模板蓝图与响应式预览画布",
          content: templateBlueprintCanvas,
        }}
        inspector={{
          id: `${panelIdPrefix}-inspector-panel`,
          label: "默认值、约束与允许编辑范围",
          content: templateConstraintInspector,
          collapsedSummary: "模板约束已收起",
        }}
        collapsibleRegions={[]}
        compactActiveRegion={compactActiveRegion}
      />
    </section>
  );
}
