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
import { DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT } from "../template-editor/templateCatalogEvents";
import type {
  DynamicTemplateUpgradeAnalysis,
  DynamicTemplateUpgradeInstancePlan,
} from "./upgrade";
import "./DynamicTemplateUpgradePanel.css";

const CATALOG_CACHE_TTL_MS = 30_000;
let publishedTemplatesCache: PublishedDynamicTemplateResource[] | null = null;
let publishedTemplatesCachedAt = 0;
let publishedTemplatesRequest: Promise<PublishedDynamicTemplateResource[]> | null = null;

type TemplateVersionCheckState =
  | { status: "loading" }
  | { status: "catalog-error"; message: string }
  | { status: "catalog-missing" }
  | { status: "current"; latest: PublishedDynamicTemplateResource }
  | { status: "upgrade-available"; latest: PublishedDynamicTemplateResource };

async function loadPublishedTemplates(forceRefresh = false) {
  if (publishedTemplatesRequest) return publishedTemplatesRequest;
  if (
    !forceRefresh
    && publishedTemplatesCache
    && Date.now() - publishedTemplatesCachedAt < CATALOG_CACHE_TTL_MS
  ) {
    return publishedTemplatesCache;
  }
  publishedTemplatesRequest = dynamicTemplateApi.listCatalog()
    .then((response) => {
      const catalog = unwrapResponse<TemplateCatalogResource>(response);
      const templates = catalog?.items.flatMap((item) => (
        item.kind === "published" ? [item.template] : []
      )) ?? [];
      publishedTemplatesCache = templates;
      publishedTemplatesCachedAt = Date.now();
      return templates;
    })
    .finally(() => {
      publishedTemplatesRequest = null;
    });
  return publishedTemplatesRequest;
}

export default function DynamicTemplateUpgradePanel({
  definition,
  instance,
  onApply,
}: {
  definition: TemplateDefinitionV2;
  instance: DynamicTemplateInstanceProps;
  onApply: (
    next: DynamicTemplateInstanceProps,
    analysis: DynamicTemplateUpgradeAnalysis,
    target: PublishedDynamicTemplateResource,
  ) => void;
}) {
  const { message } = AntdApp.useApp();
  const [versionCheck, setVersionCheck] = useState<TemplateVersionCheckState>({ status: "loading" });
  const [reloadRequest, setReloadRequest] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refreshLatest = (forceRefresh = false) => {
      setVersionCheck({ status: "loading" });
      void loadPublishedTemplates(forceRefresh)
        .then((templates) => {
          if (cancelled) return;
          const latest = templates.find((item) => item.templateId === instance.templateId);
          if (!latest) {
            setVersionCheck({ status: "catalog-missing" });
            return;
          }
          setVersionCheck({
            status: latest.version > instance.templateVersion ? "upgrade-available" : "current",
            latest,
          });
        })
        .catch(() => {
          if (!cancelled) {
            setVersionCheck({
              status: "catalog-error",
              message: "暂时无法检查模板新版本，当前页面版本未改变",
            });
          }
        });
    };
    refreshLatest(reloadRequest > 0);
    const refreshAfterCatalogChange = () => refreshLatest(true);
    window.addEventListener(DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT, refreshAfterCatalogChange);
    return () => {
      cancelled = true;
      window.removeEventListener(DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT, refreshAfterCatalogChange);
    };
  }, [instance.templateId, instance.templateVersion, reloadRequest]);

  const latest = versionCheck.status === "current" || versionCheck.status === "upgrade-available"
    ? versionCheck.latest
    : null;

  const upgrade = useMemo(() => (
    versionCheck.status === "upgrade-available" && latest
      ? analyzeDynamicTemplateUpgrade({
          currentDefinition: definition,
          targetDefinition: latest.definition,
          targetVersion: latest.version,
          instance,
        })
      : null
  ), [definition, instance, latest, versionCheck.status]);

  if (versionCheck.status === "loading") {
    return <div className="homepage-editor__properties-hint" role="status"><Spin size="small" /> 正在检查模板版本…</div>;
  }
  if (versionCheck.status === "catalog-error") {
    return (
      <Alert
        type="warning"
        showIcon
        message={versionCheck.message}
        action={<Button size="small" onClick={() => setReloadRequest((value) => value + 1)}>重新检查</Button>}
      />
    );
  }
  if (versionCheck.status === "catalog-missing") {
    return (
      <Alert
        type="warning"
        showIcon
        message="目录未找到当前模板，无法判断是否最新"
        description={`当前页面继续锁定 ${instance.templateId} v${instance.templateVersion}，页面草稿未修改。`}
        action={<Button size="small" onClick={() => setReloadRequest((value) => value + 1)}>重新检查</Button>}
      />
    );
  }
  if (versionCheck.status === "current") {
    return (
      <div className="homepage-editor__properties-hint" role="status">
        {versionCheck.latest.version === instance.templateVersion
          ? `当前已锁定最新可用版本 v${instance.templateVersion}。`
          : `当前页面锁定 v${instance.templateVersion}，目录最新可用版本为 v${versionCheck.latest.version}；无需升级。`}
      </div>
    );
  }
  if (!upgrade || !latest) {
    return null;
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
    onApply(upgrade.nextProps, upgrade, latest);
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
      <DynamicTemplateUpgradeReviewModal
        open={previewOpen}
        title={`模板版本升级：v${instance.templateVersion} → v${latest.version}`}
        plans={[{
          blockId: instance.id,
          instanceId: instance.instanceId,
          currentProps: instance,
          currentDefinition: definition,
          targetDefinition: latest.definition,
          analysis: upgrade,
        }]}
        onConfirm={applyUpgrade}
        onCancel={() => setPreviewOpen(false)}
      />
    </>
  );
}

export function DynamicTemplateUpgradeReviewModal({
  open,
  title,
  plans,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  plans: DynamicTemplateUpgradeInstancePlan[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    if (open) setSelectedIndex(0);
  }, [open, plans]);
  const selected = plans[Math.min(selectedIndex, Math.max(0, plans.length - 1))];
  const blocked = plans.some((plan) => plan.analysis.blockers.length > 0);
  return (
    <Modal
      className="dynamic-template-upgrade-review"
      title={title}
      open={open}
      width={1120}
      okText="确认升级页面草稿"
      cancelText="保留当前版本"
      okButtonProps={{ disabled: blocked || plans.length === 0 }}
      onOk={onConfirm}
      onCancel={onCancel}
    >
      <p>确认后只修改当前内存草稿并增加一条页面历史；不会自动保存、发布或回写母模板。</p>
      <div className="dynamic-template-upgrade-review__instances" aria-label="实例升级审查列表">
        {plans.map((plan, index) => (
          <button
            type="button"
            key={plan.blockId}
            className={index === selectedIndex ? "is-active" : undefined}
            aria-label={`审查实例 ${plan.instanceId}：保留 ${plan.analysis.preservedChanges.length}，待填 ${plan.analysis.pendingRequiredSlots.length}，阻断 ${plan.analysis.blockers.length}`}
            onClick={() => setSelectedIndex(index)}
          >
            <span>{plan.analysis.nextProps.moduleName || "模板实例"} · {plan.instanceId}</span>
            <small>
              保留 {plan.analysis.preservedChanges.length} · 待填 {plan.analysis.pendingRequiredSlots.length} · 阻断 {plan.analysis.blockers.length}
            </small>
          </button>
        ))}
      </div>
      {selected ? (
        <>
          <div className="dynamic-template-upgrade-review__tags">
            <Tag>新增节点 {selected.analysis.diff.addedNodeIds.length}</Tag>
            <Tag>删除节点 {selected.analysis.diff.removedNodeIds.length}</Tag>
            <Tag>变化节点 {selected.analysis.diff.changedNodeIds.length}</Tag>
            <Tag color={selected.analysis.pendingRequiredSlots.length > 0 ? "gold" : undefined}>待填写 {selected.analysis.pendingRequiredSlots.length}</Tag>
            <Tag color={selected.analysis.blockers.length > 0 ? "red" : undefined}>阻断 {selected.analysis.blockers.length}</Tag>
          </div>
          {selected.analysis.blockers.map((reason, index) => (
            <Alert key={`${selected.instanceId}-blocker-${index}`} type="error" showIcon message={reason} />
          ))}
          {selected.analysis.pendingRequiredSlots.map((item) => (
            <Alert key={item.slotId} type="warning" showIcon message={`升级后待填写：${item.label}`} />
          ))}
          <div className="dynamic-template-upgrade-review__devices">
            {(["desktop", "mobile"] as const).map((device) => (
              <section key={device} aria-label={device === "desktop" ? "桌面端升级对比" : "移动端升级对比"}>
                <h4>{device === "desktop" ? "桌面端" : "移动端"}</h4>
                <div className="dynamic-template-upgrade-review__comparison">
                  {selected.currentDefinition ? (
                    <Preview
                      label={`当前 v${selected.analysis.fromVersion}`}
                      definition={selected.currentDefinition}
                      instance={selected.currentProps}
                      contentBySlotId={selected.currentProps.contentBySlotId}
                      device={device}
                    />
                  ) : (
                    <div
                      className="dynamic-template-upgrade-review__preview"
                      aria-label={`${device === "desktop" ? "桌面端" : "移动端"}当前 v${selected.analysis.fromVersion}`}
                    >
                      <strong>当前 v{selected.analysis.fromVersion}</strong>
                      <Alert type="error" showIcon message="当前精确模板版本不可用，无法生成可靠预览" />
                    </div>
                  )}
                  <Preview
                    label={`目标 v${selected.analysis.toVersion}`}
                    definition={selected.targetDefinition}
                    instance={selected.analysis.nextProps}
                    contentBySlotId={selected.analysis.nextProps.contentBySlotId}
                    device={device}
                  />
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </Modal>
  );
}

function Preview({
  label,
  definition,
  instance,
  contentBySlotId,
  device,
}: {
  label: string;
  definition: TemplateDefinitionV2;
  instance: DynamicTemplateInstanceProps;
  contentBySlotId: Record<string, unknown>;
  device: "desktop" | "mobile";
}) {
  return (
    <div className="dynamic-template-upgrade-review__preview" aria-label={`${device === "desktop" ? "桌面端" : "移动端"}${label}`}>
      <strong>{label}</strong>
      <DynamicTemplateRenderer
        definition={definition}
        device={device}
        contentBySlotId={contentBySlotId}
        hiddenSlotIds={instance.hiddenSlotIds}
        layoutOverridesByNodeId={instance.layoutOverridesByNodeId}
        mode="thumbnail"
      />
    </div>
  );
}
