import { App as AntdApp, Alert, Button, Modal, Spin, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { unwrapResponse } from "@/utils/unwrap";
import {
  dynamicTemplateApi,
  type PublishedDynamicTemplateResource,
  type TemplateCatalogResource,
} from "@/services/clients/dynamicTemplateClient";
import { DynamicTemplateRenderer, type TemplateDefinitionV2 } from "../template-definition";
import { registerResolvedDynamicTemplate } from "./registry";
import type { DynamicTemplateInstanceProps } from "./types";
import { analyzeDynamicTemplateUpgrade } from "./upgrade";

export default function DynamicTemplateUpgradePanel({
  definition,
  instance,
  onApply,
}: {
  definition: TemplateDefinitionV2;
  instance: DynamicTemplateInstanceProps;
  onApply: (next: DynamicTemplateInstanceProps) => void;
}) {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<PublishedDynamicTemplateResource | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void dynamicTemplateApi.listCatalog()
      .then((response) => {
        if (cancelled) return;
        const catalog = unwrapResponse<TemplateCatalogResource>(response);
        const templates = catalog?.items.flatMap((item) => (
          item.kind === "published" ? [item.template] : []
        )) ?? [];
        setLatest(templates.find((item) => item.templateId === instance.templateId) ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("暂时无法检查模板新版本，当前页面版本未改变");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [instance.templateId, instance.templateVersion]);

  const upgrade = useMemo(() => (
    latest && latest.version > instance.templateVersion
      ? analyzeDynamicTemplateUpgrade({
          currentDefinition: definition,
          targetDefinition: latest.definition,
          targetVersion: latest.version,
          instance,
        })
      : null
  ), [definition, instance, latest]);

  if (loading) {
    return <div className="homepage-editor__properties-hint" role="status"><Spin size="small" /> 正在检查模板版本…</div>;
  }
  if (error) return <Alert type="warning" showIcon message={error} />;
  if (!upgrade || !latest) {
    return <div className="homepage-editor__properties-hint" role="status">当前已锁定最新可用版本。</div>;
  }

  const applyUpgrade = () => {
    if (upgrade.blockers.length > 0) return;
    registerResolvedDynamicTemplate({
      templateId: latest.templateId,
      version: latest.version,
      schemaVersion: latest.schemaVersion,
      definitionChecksum: latest.definitionChecksum,
      definition: latest.definition,
    });
    onApply(upgrade.nextProps);
    setPreviewOpen(false);
    message.success(`页面实例已升级到 v${latest.version}；尚未保存页面草稿，可使用页面撤销回退`);
  };

  return (
    <>
      <Alert
        type="info"
        showIcon
        message={`发现新版本 v${latest.version}`}
        description={`当前页面继续使用 v${instance.templateVersion}，只有确认升级才会修改页面草稿。`}
        action={<Button size="small" onClick={() => setPreviewOpen(true)}>查看差异</Button>}
      />
      <Modal
        title={`模板版本升级：v${instance.templateVersion} → v${latest.version}`}
        open={previewOpen}
        width={980}
        okText={upgrade.warnings.length > 0 ? "确认升级并处理差异" : "确认升级"}
        cancelText="保留当前版本"
        okButtonProps={{ disabled: upgrade.blockers.length > 0, danger: upgrade.warnings.length > 0 }}
        onOk={applyUpgrade}
        onCancel={() => setPreviewOpen(false)}
      >
        <p>升级只修改当前页面实例的版本引用和兼容槽位内容；模板本身、其他页面和已保存页面均不受影响。</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <Tag>新增节点 {upgrade.diff.addedNodeIds.length}</Tag>
          <Tag>删除节点 {upgrade.diff.removedNodeIds.length}</Tag>
          <Tag>变化节点 {upgrade.diff.changedNodeIds.length}</Tag>
          <Tag>新增槽位 {upgrade.diff.addedSlotIds.length}</Tag>
          <Tag>删除槽位 {upgrade.diff.removedSlotIds.length}</Tag>
          <Tag>变化槽位 {upgrade.diff.changedSlotIds.length}</Tag>
        </div>
        {upgrade.blockers.map((blocker) => <Alert key={blocker} type="error" showIcon message={blocker} style={{ marginBottom: 8 }} />)}
        {upgrade.warnings.map((warning) => <Alert key={warning} type="warning" showIcon message={warning} style={{ marginBottom: 8 }} />)}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, marginTop: 16 }}>
          <section aria-label={`当前模板版本 ${instance.templateVersion}`}>
            <strong>当前 v{instance.templateVersion}</strong>
            <DynamicTemplateRenderer
              definition={definition}
              device="desktop"
              contentBySlotId={instance.contentBySlotId}
              hiddenSlotIds={instance.hiddenSlotIds}
              layoutOverridesByNodeId={instance.layoutOverridesByNodeId}
              mode="thumbnail"
            />
          </section>
          <section aria-label={`目标模板版本 ${latest.version}`}>
            <strong>目标 v{latest.version}</strong>
            <DynamicTemplateRenderer
              definition={latest.definition}
              device="desktop"
              contentBySlotId={upgrade.nextProps.contentBySlotId}
              hiddenSlotIds={upgrade.nextProps.hiddenSlotIds}
              layoutOverridesByNodeId={upgrade.nextProps.layoutOverridesByNodeId}
              mode="thumbnail"
            />
          </section>
        </div>
      </Modal>
    </>
  );
}
