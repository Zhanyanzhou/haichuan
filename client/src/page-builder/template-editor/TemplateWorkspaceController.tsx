import { App as AntdApp } from "antd";
import { useCallback, useRef, useState } from "react";
import type { PersonalContentTemplate, SystemContentTemplateCurrent } from "@/services/api";
import {
  dynamicTemplateApi,
  type DynamicTemplatePublishResultResource,
  type DynamicTemplateResource,
  type DynamicTemplateVersionResource,
  type TemplateCatalogResource,
} from "@/services/clients/dynamicTemplateClient";
import { unwrapResponse } from "@/utils/unwrap";
import { getEditorErrorMessage, getEditorHttpStatus } from "@/page-builder/workspace/editorLifecycleErrors";
import { getContentTemplateContract } from "@/page-builder/generated/contentTemplates.generated";
import {
  createDynamicTemplateStableId,
  normalizeTemplateDimensionContract,
  validateDynamicTemplatePublishDefinition,
} from "../template-definition";
import {
  promoteInstanceOverridesToTemplateDraft,
  type PromoteDynamicTemplateInstanceRequest,
} from "../dynamic-template-instance/promoteToTemplate";
import { createSystemCompatibilityRecoveryDefinition } from "../templates/unifiedTemplateCatalog";
import { useVisualEditorSession } from "../visual-editor/visualEditorSession";
import {
  DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT,
  createNewDynamicTemplateDraft,
  loadLocalDynamicTemplateDraft,
  saveLocalDynamicTemplateDraft,
} from "./dynamicTemplateDraftRepository";
import { prepareDynamicTemplateDefinitionForNewIdentity } from "./dynamicTemplateEditorUtils";
import type { TemplateEditorLibraryTarget } from "./TemplateEditorLibrary";
import { notifyDynamicTemplateCatalogChanged } from "./templateCatalogEvents";
import { createPersonalTemplateDraft, createSystemTemplateDraft } from "./templateDraftAdapter";
import { adaptLegacyTemplateSource } from "./legacyTemplateConversion";
import { useTemplateEditorSession } from "./templateEditorSession";
import type { TemplateEditorDraft } from "./types";

export interface PersistTemplateOptions {
  asCopy?: boolean;
  overwriteCurrent?: boolean;
  name?: string;
}

type TemplateLifecycleTarget = Pick<DynamicTemplateResource, "templateId" | "name">;

export interface TemplateWorkspaceController {
  active: boolean;
  canManageTemplates: boolean;
  localOnly: boolean;
  publishing: boolean;
  lifecycleBusy: boolean;
  draft: TemplateEditorDraft | null;
  dirty: boolean;
  hasBaseline: boolean;
  device: ReturnType<typeof useTemplateEditorSession.getState>["device"];
  previewMode: boolean;
  previewScenario: ReturnType<typeof useTemplateEditorSession.getState>["previewScenario"];
  saveStatus: ReturnType<typeof useTemplateEditorSession.getState>["saveStatus"];
  setPreviewMode: (previewMode: boolean) => void;
  enter: (pageViewport: { width: number; height: number }) => void;
  returnToPage: () => void;
  openTarget: (target: TemplateEditorLibraryTarget) => void;
  persist: (options?: PersistTemplateOptions) => Promise<boolean>;
  publish: () => Promise<boolean>;
  promoteFromPage: (
    request: PromoteDynamicTemplateInstanceRequest,
    pageViewport: { width: number; height: number },
  ) => Promise<void>;
  archive: (template: TemplateLifecycleTarget) => Promise<boolean>;
  restore: (template: TemplateLifecycleTarget) => Promise<boolean>;
  deleteDraft: (template: TemplateLifecycleTarget) => Promise<boolean>;
  listVersions: () => Promise<DynamicTemplateVersionResource[]>;
  discardChanges: () => void;
  openImportedDraft: (draft: TemplateEditorDraft) => void;
}

function createPersistedDraft(template: DynamicTemplateResource): TemplateEditorDraft | null {
  if (!template.draft) return null;
  const definition = normalizeTemplateDimensionContract(template.draft.definition);
  const requiresContractNormalization = JSON.stringify(definition)
    !== JSON.stringify(template.draft.definition);
  return {
    format: "dynamic",
    sourceType: "persisted",
    localDraftId: template.templateId,
    versionNote: template.draft.versionNote ?? "",
    ...(template.sourceReference ? { sourceReference: template.sourceReference } : {}),
    ...(requiresContractNormalization ? { requiresContractNormalization: true } : {}),
    definition,
    remote: {
      databaseId: template.id,
      revision: template.draft.revision,
      publishedVersion: template.publishedVersion,
      baseVersion: template.draft.baseVersion,
      sourceType: template.sourceType,
      status: template.status,
      canDelete: template.canDelete === true,
      deleteBlockers: template.deleteBlockers ?? [],
    },
  };
}

export function useTemplateWorkspaceController({
  active,
  canManageTemplates,
  localOnly,
  isViewingPublished,
  onEnterWorkspace,
  onReturnPage,
}: {
  active: boolean;
  canManageTemplates: boolean;
  localOnly: boolean;
  isViewingPublished: () => boolean;
  onEnterWorkspace: (pageViewport: { width: number; height: number }) => void;
  onReturnPage: () => void;
}): TemplateWorkspaceController {
  const { message, modal } = AntdApp.useApp();
  const [publishing, setPublishing] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const publishInFlightRef = useRef(false);
  const lifecycleInFlightRef = useRef(false);
  const draft = useTemplateEditorSession((state) => state.draft);
  const dirty = useTemplateEditorSession((state) => state.dirty);
  const hasBaseline = useTemplateEditorSession((state) => Boolean(state.baseline));
  const device = useTemplateEditorSession((state) => state.device);
  const previewMode = useTemplateEditorSession((state) => state.previewMode);
  const previewScenario = useTemplateEditorSession((state) => state.previewScenario);
  const saveStatus = useTemplateEditorSession((state) => state.saveStatus);
  const setPreviewMode = useTemplateEditorSession((state) => state.setPreviewMode);

  const activateTemplateSession = useCallback(() => {
    const visualSession = useVisualEditorSession.getState();
    visualSession.resetWorkspaceContext("template");
    visualSession.activateWorkspace("template");
  }, []);

  const openSystemDraft = useCallback((
    moduleType: string,
    current: SystemContentTemplateCurrent | undefined,
    markAsNew: boolean,
  ) => {
    const sourceDraft = createSystemTemplateDraft(moduleType, current);
    if (!sourceDraft) {
      message.error("当前母模板缺少可编辑合同，暂时无法打开");
      return null;
    }
    try {
      const loaded = adaptLegacyTemplateSource(sourceDraft);
      activateTemplateSession();
      const session = useTemplateEditorSession.getState();
      session.open(loaded.draft, { isNew: markAsNew });
      session.selectObject(loaded.draft.definition.rootNodeId);
      if (loaded.skippedItems.length > 0) {
        message.warning(`母模板已打开；有 ${loaded.skippedItems.length} 项旧引用需在发布前重新确认`);
      }
      return useTemplateEditorSession.getState().sessionId;
    } catch (error) {
      message.error(getEditorErrorMessage(error, "当前母模板暂时无法在统一编辑器中打开"));
      return null;
    }
  }, [activateTemplateSession, message]);

  const openPersistedDraft = useCallback((template: DynamicTemplateResource) => {
    if (template.status === "ARCHIVED") {
      message.warning("回收站中的模板需先恢复后才能继续编辑");
      return false;
    }
    const persistedDraft = createPersistedDraft(template);
    if (!persistedDraft) {
      message.error("服务端模板缺少可编辑草稿");
      return false;
    }
    activateTemplateSession();
    const session = useTemplateEditorSession.getState();
    session.open(persistedDraft);
    session.selectObject(persistedDraft.definition.rootNodeId);
    return true;
  }, [activateTemplateSession, message]);

  const enter = useCallback((pageViewport: { width: number; height: number }) => {
    if (!canManageTemplates) {
      message.warning("只有超级管理员可以设计模板");
      return;
    }
    if (isViewingPublished()) {
      message.warning("请先返回页面草稿，再进入模板编辑");
      return;
    }
    onEnterWorkspace(pageViewport);
    activateTemplateSession();
    useTemplateEditorSession.getState().close();
    const defaultModuleType = "首屏主视觉";
    const openedSessionId = openSystemDraft(defaultModuleType, undefined, false);
    const contractKey = getContentTemplateContract(defaultModuleType)?.key;
    if (!openedSessionId || !contractKey) return;

    void dynamicTemplateApi.listCatalog()
      .then((response) => {
        const catalog = unwrapResponse<TemplateCatalogResource>(response);
        const session = useTemplateEditorSession.getState();
        if (session.sessionId !== openedSessionId || session.dirty) return;
        const systemCurrentItem = catalog?.items.find((item) => (
          item.kind === "system-compatibility" && item.template.contractKey === contractKey
        ));
        const systemCurrent = systemCurrentItem?.kind === "system-compatibility"
          ? systemCurrentItem.template
          : null;
        const persisted = catalog?.items.find((item) => (
          item.kind === "editable"
          && item.template.sourceReference === session.draft?.sourceReference
        ));
        if (persisted?.kind === "editable") {
          const persistedDraft = createPersistedDraft(persisted.template);
          if (persistedDraft) {
            activateTemplateSession();
            session.open(persistedDraft);
            const recoveryDefinition = systemCurrent
              ? createSystemCompatibilityRecoveryDefinition(persisted.template, systemCurrent)
              : undefined;
            if (recoveryDefinition) {
              session.setDynamicDefinition(recoveryDefinition);
              session.selectObject(recoveryDefinition.rootNodeId);
              message.warning("服务端草稿缺少当前系统模板组件，已载入系统基线供修复；原草稿尚未覆盖，确认后再保存");
            } else {
              session.selectObject(persistedDraft.definition.rootNodeId);
            }
            return;
          }
        }
        if (
          !systemCurrent
          || systemCurrent.moduleType !== defaultModuleType
          || systemCurrent.activeVersion <= 0
          || useTemplateEditorSession.getState().sessionId !== openedSessionId
          || useTemplateEditorSession.getState().dirty
        ) return;
        openSystemDraft(defaultModuleType, systemCurrent, false);
      })
      .catch(() => {
        const session = useTemplateEditorSession.getState();
        if (session.sessionId === openedSessionId && !session.dirty) {
          message.warning("首屏当前版本暂时无法读取，已打开代码合同基线");
        }
      });
  }, [activateTemplateSession, canManageTemplates, isViewingPublished, message, onEnterWorkspace, openSystemDraft]);

  const requireActive = useCallback(() => {
    if (!active) {
      message.info("请先点击顶部“模板设计”进入模板工作区");
      return false;
    }
    if (!canManageTemplates) {
      message.warning("只有超级管理员可以设计模板");
      return false;
    }
    return true;
  }, [active, canManageTemplates, message]);

  const openTarget = useCallback((target: TemplateEditorLibraryTarget) => {
    if (!requireActive()) return;
    if (target.kind === "system-fixed") {
      openSystemDraft(target.moduleType, target.current, false);
      return;
    }
    if (target.kind === "personal-fixed") {
      const sourceDraft = createPersonalTemplateDraft(target.template as PersonalContentTemplate);
      if (!sourceDraft) {
        message.error("此模板与当前合同不兼容，原记录未被修改");
        return;
      }
      try {
        const loaded = adaptLegacyTemplateSource(sourceDraft);
        activateTemplateSession();
        const session = useTemplateEditorSession.getState();
        session.open(loaded.draft, { isNew: false });
        session.selectObject(loaded.draft.definition.rootNodeId);
        if (loaded.skippedItems.length > 0) {
          message.warning(`母模板已打开；有 ${loaded.skippedItems.length} 项旧引用需在发布前重新确认`);
        }
      } catch (error) {
        message.error(getEditorErrorMessage(error, "当前母模板暂时无法在统一编辑器中打开"));
      }
      return;
    }
    if (target.kind === "dynamic-local") {
      const localDraft = loadLocalDynamicTemplateDraft(target.localDraftId);
      if (!localDraft) {
        message.error("该本机模板草稿不存在或未通过当前结构校验");
        return;
      }
      activateTemplateSession();
      const session = useTemplateEditorSession.getState();
      session.open(localDraft);
      session.selectObject(localDraft.definition.rootNodeId);
      return;
    }
    if (target.kind === "dynamic-new") {
      const newDraft = createNewDynamicTemplateDraft("未命名模板");
      activateTemplateSession();
      const session = useTemplateEditorSession.getState();
      session.open(newDraft, { isNew: true });
      session.selectObject(newDraft.definition.rootNodeId);
      return;
    }
    if (!openPersistedDraft(target.template)) return;
    if (target.recoveryDefinition) {
      const session = useTemplateEditorSession.getState();
      if (
        session.draft?.sourceType === "persisted"
        && session.draft.definition.templateId === target.template.templateId
      ) {
        session.setDynamicDefinition(target.recoveryDefinition);
        session.selectObject(target.recoveryDefinition.rootNodeId);
        message.warning("服务端草稿缺少当前系统模板组件，已载入系统基线供修复；原草稿尚未覆盖，确认后再保存");
      }
    }
  }, [activateTemplateSession, message, openPersistedDraft, openSystemDraft, requireActive]);

  const persist = useCallback((options: PersistTemplateOptions = {}): Promise<boolean> => {
    if (saveInFlightRef.current) return saveInFlightRef.current;
    const session = useTemplateEditorSession.getState();
    const currentDraft = session.draft;
    const sessionId = session.sessionId;
    if (!canManageTemplates || !currentDraft || !sessionId) return Promise.resolve(false);
    const requestedDraft = structuredClone(currentDraft);
    session.setSaveStatus("saving");
    const savePromise = (async (): Promise<boolean> => {
      try {
        let savedDraft: TemplateEditorDraft;
        if (localOnly) {
          const localBase = requestedDraft.sourceType === "local"
            ? requestedDraft
            : (() => {
                const localDraftId = createDynamicTemplateStableId("tpl");
                return {
                  format: "dynamic" as const,
                  sourceType: "local" as const,
                  localDraftId,
                  versionNote: requestedDraft.versionNote,
                  sourceReference: requestedDraft.definition.templateId,
                  definition: {
                    ...structuredClone(requestedDraft.definition),
                    templateId: localDraftId,
                  },
                };
              })();
          localBase.definition = normalizeTemplateDimensionContract(localBase.definition);
          if (requestedDraft.sourceType !== "local") {
            localBase.definition = prepareDynamicTemplateDefinitionForNewIdentity(
              localBase.definition,
              localBase.localDraftId,
            );
          }
          savedDraft = saveLocalDynamicTemplateDraft(localBase, {
            asCopy: requestedDraft.sourceType === "local" && options.asCopy,
            name: options.name,
          });
          window.dispatchEvent(new Event(DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT));
        } else {
          let response: unknown;
          const copyNeedsCurrentDefinition = Boolean(
            options.asCopy
            && (
              session.dirty
              || session.saveStatus === "conflict"
              || requestedDraft.requiresContractNormalization === true
            ),
          );
          if (options.asCopy && requestedDraft.sourceType === "persisted" && !copyNeedsCurrentDefinition) {
            response = await dynamicTemplateApi.saveAs(requestedDraft.definition.templateId, {
              name: (options.name ?? `${requestedDraft.definition.name} 副本`).trim(),
              versionNote: requestedDraft.versionNote,
            });
          } else {
            let definition = normalizeTemplateDimensionContract(requestedDraft.definition);
            if (options.name?.trim()) definition.name = options.name.trim();
            const updatesPersistedDraft = requestedDraft.sourceType === "persisted"
              && requestedDraft.remote
              && !options.asCopy;
            if (!updatesPersistedDraft) {
              definition = prepareDynamicTemplateDefinitionForNewIdentity(
                definition,
                options.asCopy ? createDynamicTemplateStableId("tpl") : definition.templateId,
              );
            }
            response = updatesPersistedDraft
              ? await dynamicTemplateApi.updateDraft(requestedDraft.definition.templateId, {
                  expectedRevision: requestedDraft.remote!.revision,
                  definition,
                  versionNote: requestedDraft.versionNote,
                })
              : await dynamicTemplateApi.create({
                  definition,
                  versionNote: requestedDraft.versionNote,
                  ...((options.asCopy ? requestedDraft.definition.templateId : requestedDraft.sourceReference)
                    ? { sourceReference: options.asCopy ? requestedDraft.definition.templateId : requestedDraft.sourceReference }
                    : {}),
                });
          }
          const saved = unwrapResponse<DynamicTemplateResource>(response);
          const persistedDraft = saved ? createPersistedDraft(saved) : null;
          if (!persistedDraft) throw new Error("服务端没有返回可编辑模板草稿");
          savedDraft = persistedDraft;
          notifyDynamicTemplateCatalogChanged();
        }

        const reconciliation = useTemplateEditorSession.getState().reconcileSaveResult({
          sessionId,
          requestedDraft,
          savedDraft,
          asCopy: options.asCopy,
        });
        if (reconciliation === "stale-session") return true;
        if (options.asCopy) {
          message.success(localOnly
            ? `“${savedDraft.definition.name}”已另存为本机测试草稿`
            : `“${savedDraft.definition.name}”副本已保存为新的账号模板`);
        } else if (reconciliation === "newer-changes") {
          message.success(localOnly
            ? "本机测试草稿已保存；你还有新的未保存修改"
            : "模板草稿已保存；你还有新的未保存修改");
        } else {
          message.success(localOnly
            ? "已保存为本机测试草稿；未写入服务端模板"
            : "模板草稿已保存，可继续设计或发布");
        }
        return true;
      } catch (error) {
        const current = useTemplateEditorSession.getState();
        const conflicted = getEditorHttpStatus(error) === 409;
        if (
          current.sessionId === sessionId
          && current.draft?.definition.templateId === requestedDraft.definition.templateId
        ) {
          current.setSaveStatus(conflicted ? "conflict" : "error");
          if (conflicted) {
            message.warning("其他人已经保存了这个模板的新修改；当前工作仍完整保留，请另存为新模板。");
          } else {
            message.error(getEditorErrorMessage(error, "模板保存失败，当前修改仍完整保留"));
          }
        }
        return false;
      }
    })();
    saveInFlightRef.current = savePromise;
    void savePromise.finally(() => {
      if (saveInFlightRef.current === savePromise) saveInFlightRef.current = null;
    });
    return savePromise;
  }, [canManageTemplates, localOnly, message]);

  const publish = useCallback(async (): Promise<boolean> => {
    if (localOnly) {
      message.info("Mock 模式只保存本机测试草稿，不支持服务端发布");
      return false;
    }
    if (!canManageTemplates || publishInFlightRef.current) return false;
    publishInFlightRef.current = true;
    setPublishing(true);
    const release = () => {
      publishInFlightRef.current = false;
      setPublishing(false);
    };
    let state = useTemplateEditorSession.getState();
    if (!state.draft || !state.sessionId) {
      release();
      return false;
    }
    const intentSessionId = state.sessionId;
    const intentTemplateId = state.draft.definition.templateId;
    if (state.dirty || state.draft.sourceType === "local" || state.draft.requiresContractNormalization) {
      const saved = await persist();
      if (!saved) {
        release();
        return false;
      }
      state = useTemplateEditorSession.getState();
      if (state.sessionId !== intentSessionId || state.draft?.definition.templateId !== intentTemplateId) {
        release();
        return false;
      }
      if (state.dirty) {
        release();
        message.warning("保存期间产生了新的修改；当前修改已保留，请再次点击发布");
        return false;
      }
    }
    const publishDraft = state.draft;
    if (!publishDraft || publishDraft.sourceType !== "persisted" || !publishDraft.remote) {
      release();
      message.error("模板草稿尚未建立服务端版本，无法发布");
      return false;
    }
    const publishCheck = validateDynamicTemplatePublishDefinition(publishDraft.definition);
    if (!publishCheck.valid) {
      const firstIssue = publishCheck.issues.find((issue) => issue.level === "error");
      useTemplateEditorSession.getState().selectObject(firstIssue?.nodeId ?? publishDraft.definition.rootNodeId);
      release();
      message.error(firstIssue?.message ?? "模板发布检查未通过，请查看右侧“发布检查”");
      return false;
    }
    try {
      const response = await dynamicTemplateApi.publish(publishDraft.definition.templateId, {
        expectedRevision: publishDraft.remote.revision,
        ...(publishDraft.versionNote ? { versionNote: publishDraft.versionNote } : {}),
      });
      const published = unwrapResponse<DynamicTemplatePublishResultResource>(response);
      if (
        !published
        || published.templateId !== publishDraft.definition.templateId
        || published.version !== publishDraft.remote.publishedVersion + 1
        || !Number.isInteger(published.draft?.revision)
      ) throw new Error("服务端返回的模板发布结果与当前草稿不一致");
      const savedPublishedDraft = structuredClone(publishDraft);
      savedPublishedDraft.versionNote = "";
      savedPublishedDraft.remote = {
        ...publishDraft.remote,
        revision: published.draft.revision,
        publishedVersion: published.version,
        baseVersion: published.version,
      };
      const reconciliation = useTemplateEditorSession.getState().reconcileSaveResult({
        sessionId: intentSessionId,
        requestedDraft: publishDraft,
        savedDraft: savedPublishedDraft,
      });
      if (reconciliation === "saved") useTemplateEditorSession.getState().setSaveStatus("publish-success");
      notifyDynamicTemplateCatalogChanged();
      message.success(reconciliation === "newer-changes"
        ? `模板 v${published.version} 已发布；现有页面仍保持原版本，你还有新的未保存修改`
        : `模板 v${published.version} 已发布；现有页面仍保持原版本`);
      return true;
    } catch (error) {
      const current = useTemplateEditorSession.getState();
      const conflicted = getEditorHttpStatus(error) === 409;
      if (current.sessionId === intentSessionId && current.draft?.definition.templateId === publishDraft.definition.templateId) {
        current.setSaveStatus(conflicted ? "conflict" : "publish-error");
      }
      if (conflicted) {
        message.warning("发布前发现这个模板已有其他人的新修改；当前草稿仍完整保留，请另存为新模板。");
      } else {
        message.error(getEditorErrorMessage(error, "模板发布失败，当前模板草稿和页面会话仍保留"));
      }
      return false;
    } finally {
      release();
    }
  }, [canManageTemplates, localOnly, message, persist]);

  const promoteFromPage = useCallback(async (
    request: PromoteDynamicTemplateInstanceRequest,
    pageViewport: { width: number; height: number },
  ) => {
    if (!canManageTemplates) {
      message.warning("只有超级管理员可以把页面设计覆盖应用到母模板草稿");
      return;
    }
    if (localOnly) {
      message.info("Mock 模式没有服务端母模板草稿，不能执行安全回填");
      return;
    }
    if (isViewingPublished()) {
      message.warning("请先返回页面草稿，再应用设计覆盖");
      return;
    }
    const existingSession = useTemplateEditorSession.getState();
    if (existingSession.draft && existingSession.dirty) {
      message.warning("已有未保存的模板修改，请先返回模板设计处理后再回填");
      return;
    }
    try {
      const response = await dynamicTemplateApi.getDraft(request.templateId);
      const template = unwrapResponse<DynamicTemplateResource | null>(response);
      if (!template) {
        message.error("当前母模板不存在可编辑草稿");
        return;
      }
      if (template.status === "ARCHIVED") {
        message.warning("回收站中的模板不能接收页面设计覆盖");
        return;
      }
      const persistedDraft = createPersistedDraft(template);
      if (!persistedDraft) {
        message.error("服务端模板缺少可编辑草稿");
        return;
      }
      const promotion = promoteInstanceOverridesToTemplateDraft({
        sourceDefinition: request.sourceDefinition,
        targetDefinition: persistedDraft.definition,
        layoutOverridesByNodeId: request.layoutOverridesByNodeId,
      });
      if (promotion.blockers.length > 0 || promotion.conflicts.length > 0) {
        modal.error({
          title: "未应用：母模板草稿存在安全冲突",
          content: <div>
            {promotion.blockers.map((blocker) => <p key={blocker}>{blocker}</p>)}
            {promotion.conflicts.slice(0, 6).map((conflict) => (
              <p key={`${conflict.nodeId}-${conflict.device}-${conflict.field}`}>
                <strong>{conflict.nodeName} · {conflict.label}：</strong>{conflict.reason}
              </p>
            ))}
            {promotion.conflicts.length > 6 ? <p>另有 {promotion.conflicts.length - 6} 项冲突。</p> : null}
            <p>请先在模板设计中合并同一字段，页面草稿未被修改。</p>
          </div>,
          okText: "知道了",
        });
        return;
      }
      if (promotion.promoted.length === 0) {
        message.info(promotion.alreadyApplied.length > 0
          ? "这些设计覆盖已存在于当前母模板草稿，无需重复应用"
          : "当前页面没有可无损应用到母模板草稿的设计覆盖");
        return;
      }
      modal.confirm({
        title: `应用 ${promotion.promoted.length} 项设计覆盖到母模板草稿？`,
        width: 560,
        content: <div>
          <p>将打开“{persistedDraft.definition.name}”的模板设计工作区，并形成一条可撤销、尚未保存的草稿修改。</p>
          <ul>{promotion.promoted.slice(0, 8).map((item) => (
            <li key={`${item.nodeId}-${item.device}-${item.field}`}>{item.nodeName} · {item.label}</li>
          ))}</ul>
          {promotion.promoted.length > 8 ? <p>另有 {promotion.promoted.length - 8} 项安全设计字段。</p> : null}
          {promotion.skipped.length > 0 ? <p>{promotion.skipped.length} 项偏移、图片缩放或精确焦点不能无损转换，将保留在当前页面，需在模板设计中人工确认。</p> : null}
          <p><strong>不会带入</strong>页面文字、图片、视频、商品、链接、隐藏状态，也不会自动保存、发布或更新其他页面。</p>
        </div>,
        okText: "打开模板草稿",
        cancelText: "取消",
        onOk: () => {
          onEnterWorkspace(pageViewport);
          activateTemplateSession();
          const session = useTemplateEditorSession.getState();
          session.open(persistedDraft);
          session.setDynamicDefinition(promotion.definition);
          session.selectObject(promotion.promoted[0]?.nodeId ?? promotion.definition.rootNodeId);
          message.success(`已应用 ${promotion.promoted.length} 项设计覆盖；尚未保存模板草稿`);
        },
      });
    } catch (error) {
      message.error(getEditorErrorMessage(error, "母模板草稿读取失败，页面修改仍完整保留"));
    }
  }, [activateTemplateSession, canManageTemplates, isViewingPublished, localOnly, message, modal, onEnterWorkspace]);

  const runLifecycle = useCallback(async (operation: () => Promise<unknown>) => {
    if (localOnly || lifecycleInFlightRef.current) return false;
    lifecycleInFlightRef.current = true;
    setLifecycleBusy(true);
    try {
      await operation();
      return true;
    } finally {
      lifecycleInFlightRef.current = false;
      setLifecycleBusy(false);
    }
  }, [localOnly]);

  const archive = useCallback(async (template: TemplateLifecycleTarget) => {
    const current = useTemplateEditorSession.getState();
    if (current.draft?.sourceType === "persisted"
      && current.draft.definition.templateId === template.templateId
      && current.dirty) {
      message.warning("请先保存草稿或放弃未保存修改，再将当前模板移入回收站。");
      return false;
    }
    try {
      const ok = await runLifecycle(() => dynamicTemplateApi.archive(template.templateId));
      if (!ok) return false;
      const latest = useTemplateEditorSession.getState();
      if (latest.draft?.sourceType === "persisted" && latest.draft.definition.templateId === template.templateId) latest.close();
      notifyDynamicTemplateCatalogChanged();
      message.success(`模板“${template.name}”已移入回收站`);
      return true;
    } catch (error) {
      message.error(getEditorErrorMessage(error, "移入回收站失败，当前模板仍保留"));
      return false;
    }
  }, [message, runLifecycle]);

  const restore = useCallback(async (template: TemplateLifecycleTarget) => {
    try {
      const ok = await runLifecycle(() => dynamicTemplateApi.restore(template.templateId));
      if (!ok) return false;
      notifyDynamicTemplateCatalogChanged();
      message.success(`模板“${template.name}”已恢复`);
      return true;
    } catch (error) {
      message.error(getEditorErrorMessage(error, "模板恢复失败，请重试"));
      return false;
    }
  }, [message, runLifecycle]);

  const deleteDraft = useCallback(async (template: TemplateLifecycleTarget) => {
    const current = useTemplateEditorSession.getState();
    if (current.draft?.sourceType === "persisted"
      && current.draft.definition.templateId === template.templateId
      && current.dirty) {
      message.warning("请先保存草稿或放弃未保存修改，再永久删除当前模板。");
      return false;
    }
    try {
      const ok = await runLifecycle(() => dynamicTemplateApi.deleteDraft(template.templateId));
      if (!ok) return false;
      const latest = useTemplateEditorSession.getState();
      if (latest.draft?.sourceType === "persisted" && latest.draft.definition.templateId === template.templateId) latest.close();
      notifyDynamicTemplateCatalogChanged();
      message.success(`模板“${template.name}”已永久删除`);
      return true;
    } catch (error) {
      message.error(getEditorErrorMessage(error, "永久删除失败；模板和页面数据均未改变"));
      return false;
    }
  }, [message, runLifecycle]);

  const listVersions = useCallback(async () => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft || currentDraft.sourceType !== "persisted") return [];
    const response = await dynamicTemplateApi.listVersions(currentDraft.definition.templateId);
    return unwrapResponse<DynamicTemplateVersionResource[]>(response) ?? [];
  }, []);

  const discardChanges = useCallback(() => {
    const current = useTemplateEditorSession.getState();
    if (!current.draft || !current.dirty) return;
    if (current.baseline) current.open(current.baseline);
    else current.close();
  }, []);

  const openImportedDraft = useCallback((importedDraft: TemplateEditorDraft) => {
    activateTemplateSession();
    const session = useTemplateEditorSession.getState();
    session.open(importedDraft, { isNew: true });
    session.selectObject(importedDraft.definition.rootNodeId);
  }, [activateTemplateSession]);

  const returnToPage = useCallback(() => {
    useTemplateEditorSession.getState().close();
    useVisualEditorSession.getState().activateWorkspace("page");
    onReturnPage();
  }, [onReturnPage]);

  return {
    active,
    canManageTemplates,
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
    enter,
    returnToPage,
    openTarget,
    persist,
    publish,
    promoteFromPage,
    archive,
    restore,
    deleteDraft,
    listVersions,
    discardChanges,
    openImportedDraft,
  };
}
