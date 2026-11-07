import { useEffect, useRef, useState } from "react";
import { App, Alert, Modal, Select } from "antd";
import { useGetPuck } from "@puckeditor/core";
import { useLocation } from "react-router-dom";
import { editorPages, getEditorPage, type EditorPageKey } from "@/page-builder/config/editorPages";
import { registerResolvedDynamicTemplate } from "@/page-builder/dynamic-template-instance/registry";
import {
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
  type ResolvedDynamicTemplateDefinition,
} from "@/page-builder/dynamic-template-instance/types";
import { isContentTemplateSectionRoleAllowedOnPage } from "@/page-builder/generated/contentTemplates.generated";
import { isPageEditorLibraryTemplate } from "@/page-builder/templates/pageEditorCatalog";
import { useEditorCanvasActive } from "@/page-builder/workspace/editorCanvasActivity";
import type { PuckDocument } from "@/page-builder/types";
import { dynamicTemplateApi, type TemplateCatalogSummaryItemResource } from "@/services/clients/dynamicTemplateClient";
import { unwrapResponse } from "@/utils/unwrap";
import { focusCanvasBlock } from "../editor-store";
import { commitPageModuleStructureTransaction, type PageModuleData } from "./pageModuleActions";

export interface CrossPageModuleSnapshot {
  sourcePage: EditorPageKey;
  name: string;
  block: PageModuleData;
  version: ResolvedDynamicTemplateDefinition;
}

export default function CrossPageModuleCopy({
  snapshot,
  pageKey,
  readOnly,
  onSwitchPage,
  onClose,
}: {
  snapshot: CrossPageModuleSnapshot;
  pageKey: EditorPageKey;
  readOnly: boolean;
  onSwitchPage: (key: EditorPageKey, copyId: string) => void;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const getPuck = useGetPuck();
  const active = useEditorCanvasActive();
  const location = useLocation();
  const [target, setTarget] = useState<EditorPageKey>();
  const [requestedPage, setRequestedPage] = useState<EditorPageKey>();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const copyId = snapshot.block.props.id;
  const isCopyNavigation = location.state?.pageModuleCopyId === copyId;
  const choosing = active && !readOnly && !requestedPage && pageKey === snapshot.sourcePage;
  const inserting = active && !readOnly && requestedPage === pageKey && isCopyNavigation;
  useEffect(() => {
    if (pageKey !== snapshot.sourcePage && !(requestedPage === pageKey && isCopyNavigation)) onClose();
  }, [isCopyNavigation, onClose, pageKey, requestedPage, snapshot.sourcePage]);
  const confirmLabel = choosing ? "前往目标页" : "添加到页面";
  const currentStep = choosing ? "choose" : inserting ? "insert" : undefined;
  const stepRef = useRef(currentStep);
  stepRef.current = currentStep;
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const requestInFlight = useRef(false);

  const confirmCopy = async () => {
    const destination = choosing ? target : pageKey;
    if (!currentStep || !destination || requestInFlight.current) return;
    const definition = snapshot.version.definition;
    const sectionRole = definition.metadata.sectionRole ?? definition.templateRecipe?.sectionRole;
    // 目录返回最新发布版本，复制仍保留来源区块实际使用的版本。
    if (!isContentTemplateSectionRoleAllowedOnPage(destination, sectionRole)
      || !isPageEditorLibraryTemplate({ templateId: snapshot.version.templateId, tags: definition.metadata.tags })) {
      setError(`此区块使用的模板版本不适用于「${getEditorPage(destination).label}」。`);
      return;
    }
    requestInFlight.current = true;
    setChecking(true);
    setError("");
    try {
      const response = await dynamicTemplateApi.listCatalog({ pageKey: destination, view: "summary" });
      if (!mountedRef.current || stepRef.current !== currentStep) return;
      const catalog = unwrapResponse<{ items: TemplateCatalogSummaryItemResource[] }>(response);
      if (!Array.isArray(catalog?.items)) throw new Error("invalid-template-catalog");
      if (!catalog.items.some((item) => item.kind === "published"
        && item.template.templateId === snapshot.version.templateId
        && isPageEditorLibraryTemplate(item.template))) {
        setError(choosing
          ? `「${getEditorPage(destination).label}」的模板组件库不提供此模板。请选择其他页面。`
          : "目标页面的模板组件库不再提供此模板。请取消并返回来源页面，重新选择目标页。");
        return;
      }
      if (choosing) {
        setRequestedPage(destination);
        onSwitchPage(destination, copyId);
        return;
      }
      const version = snapshot.version;
      const versionKey = dynamicTemplateVersionKey(version.templateId, version.version);
      const data = getPuck().appState.data as PuckDocument;
      const definitions = data[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY] as
        Record<string, ResolvedDynamicTemplateDefinition> | undefined;
      if (definitions?.[versionKey] && definitions[versionKey].definitionChecksum !== version.definitionChecksum) {
        setError("目标页的模板版本记录与来源不一致。请重新加载页面后再复制。");
        return;
      }
      registerResolvedDynamicTemplate(version);
      const added = commitPageModuleStructureTransaction(
        getPuck,
        (current) => ({
          ...current,
          [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: { ...definitions, [versionKey]: version },
          content: [...current.content, snapshot.block],
        }),
        { blockId: snapshot.block.props.id },
      );
      if (added) {
        focusCanvasBlock(snapshot.block.props.id, undefined, true);
        message.success(`已添加到「${getEditorPage(pageKey).label}」的页尾，请保存当前草稿。`);
        onClose();
      }
    } catch {
      if (mountedRef.current && stepRef.current === currentStep) {
        setError("无法检查目标页面的模板目录，请重试。");
      }
    } finally {
      requestInFlight.current = false;
      if (mountedRef.current) setChecking(false);
    }
  };

  return (
    <Modal
      open={choosing || inserting}
      title={choosing ? "复制到其他页面" : "添加复制的区块"}
      okText={confirmLabel}
      cancelText="取消"
      confirmLoading={checking}
      okButtonProps={{ "aria-label": confirmLabel, disabled: checking || (choosing && !target) }}
      cancelButtonProps={{ disabled: checking }}
      keyboard={!checking}
      closable={!checking}
      maskClosable={false}
      onCancel={onClose}
      onOk={() => void confirmCopy()}
    >
      <p>{choosing
        ? `选择「${snapshot.name}」的目标页面。到达后可确认添加。`
        : `把「${snapshot.name}」添加到「${getEditorPage(pageKey).label}」页尾。副本可在目标页独立编辑，添加后请保存草稿。`}</p>
      {choosing ? (
        <Select
          aria-label="目标页面"
          placeholder="选择目标页面"
          virtual={false}
          value={target}
          disabled={checking}
          onChange={(key) => {
            setTarget(key);
            setError("");
          }}
          style={{ width: "100%" }}
          options={editorPages.filter((page) => page.key !== snapshot.sourcePage)
            .map((page) => ({ value: page.key, label: page.label }))}
        />
      ) : null}
      {error ? <Alert type="error" showIcon message={error} /> : null}
    </Modal>
  );
}
