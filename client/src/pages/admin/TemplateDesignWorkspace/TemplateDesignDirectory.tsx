import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, Select, Spin } from "antd";
import {
  dynamicTemplateApi,
  type DynamicTemplateResource,
  type TemplateCatalogItemResource,
  type TemplateCatalogResource,
} from "@/services/clients/dynamicTemplateClient";
import { unwrapResponse } from "@/utils/unwrap";
import { DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT } from "@/page-builder/template-editor/templateCatalogEvents";
import type { TemplateDefinitionV2 } from "@/page-builder/template-definition";

type DirectoryFilter = "all" | "draft" | "published" | "archived" | "compatibility";

function itemName(item: TemplateCatalogItemResource) {
  if (item.kind === "system-compatibility") return item.template.displayName;
  return item.template.name;
}

function itemStatus(item: TemplateCatalogItemResource): DirectoryFilter {
  if (item.kind === "published") return "published";
  if (item.kind === "editable") {
    return item.template.status === "ARCHIVED" ? "archived" : "draft";
  }
  return "compatibility";
}

function itemDefinition(item: TemplateCatalogItemResource): TemplateDefinitionV2 | null {
  if (item.kind === "published") return item.template.definition;
  if (item.kind === "editable") return item.template.draft?.definition ?? null;
  return null;
}

export default function TemplateDesignDirectory({
  enabled,
  canManageTemplates,
  activeTemplateId,
  onCreateBlank,
  onCreateFrom,
  onOpenDraft,
}: {
  enabled: boolean;
  canManageTemplates: boolean;
  activeTemplateId: string | null;
  onCreateBlank: () => void;
  onCreateFrom: (definition: TemplateDefinitionV2) => void;
  onOpenDraft: (template: DynamicTemplateResource) => void;
}) {
  const [items, setItems] = useState<TemplateCatalogItemResource[]>([]);
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const itemsRef = useRef<TemplateCatalogItemResource[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await dynamicTemplateApi.listCatalog({ dedupe: false });
      if (requestId !== requestIdRef.current) return;
      const catalog = unwrapResponse<TemplateCatalogResource>(response);
      const nextItems = Array.isArray(catalog?.items) ? catalog.items : [];
      itemsRef.current = nextItems;
      setItems(nextItems);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError(itemsRef.current.length > 0
        ? "模板目录刷新失败，已保留上次结果。"
        : "模板目录加载失败。请稍后重试。");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const handleCatalogChanged = () => { void refresh(); };
    window.addEventListener(DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT, handleCatalogChanged);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener(DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT, handleCatalogChanged);
    };
  }, [enabled, refresh]);

  const visibleItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase("zh-CN");
    return items.filter((item) => (
      (filter === "all" || itemStatus(item) === filter)
      && (!normalizedKeyword || itemName(item).toLocaleLowerCase("zh-CN").includes(normalizedKeyword))
    ));
  }, [filter, items, keyword]);

  return (
    <section className="template-design-workspace__directory" aria-label="模板目录">
      <div className="template-design-workspace__directory-heading">
        <h3>模板目录</h3>
        <Button type="text" size="small" loading={loading} onClick={() => void refresh()}>
          刷新
        </Button>
      </div>
      <Button
        type="primary"
        block
        disabled={!canManageTemplates}
        onClick={onCreateBlank}
      >
        新建空白模板
      </Button>
      <Input.Search
        allowClear
        value={keyword}
        aria-label="搜索模板名称"
        placeholder="搜索模板名称"
        onChange={(event) => setKeyword(event.target.value)}
      />
      <Select<DirectoryFilter>
        value={filter}
        aria-label="筛选模板状态"
        onChange={setFilter}
        options={[
          { value: "all", label: "全部状态" },
          { value: "draft", label: "草稿" },
          { value: "published", label: "已发布" },
          { value: "archived", label: "回收站" },
          { value: "compatibility", label: "兼容来源" },
        ]}
      />
      {error ? <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void refresh()}>重新加载</Button>} /> : null}
      {loading && items.length === 0 ? (
        <div className="template-design-workspace__directory-loading"><Spin size="small" /> 正在加载模板目录…</div>
      ) : null}
      {!loading && !error && visibleItems.length === 0 ? (
        <p className="template-design-workspace__empty-note">没有符合当前筛选条件的模板。</p>
      ) : null}
      <ul className="template-design-workspace__directory-list">
        {visibleItems.map((item, index) => {
          const definition = itemDefinition(item);
          const status = itemStatus(item);
          const templateId = item.kind === "system-compatibility"
            ? item.template.contractKey
            : item.kind === "personal-compatibility"
              ? `personal:${item.template.id}`
              : item.template.templateId;
          return (
            <li key={`${item.kind}:${templateId}:${index}`} data-template-status={status}>
              <div>
                <strong>{itemName(item)}</strong>
                <span>{status === "draft" ? "草稿" : status === "published" ? "已发布" : status === "archived" ? "回收站" : "兼容来源"}</span>
              </div>
              {item.kind === "editable" ? (
                <Button
                  size="small"
                  disabled={!canManageTemplates || status === "archived" || !item.template.draft || activeTemplateId === item.template.templateId}
                  onClick={() => onOpenDraft(item.template)}
                >
                  {activeTemplateId === item.template.templateId ? "正在编辑" : "打开草稿"}
                </Button>
              ) : null}
              <Button
                size="small"
                disabled={!canManageTemplates || !definition}
                title={definition ? undefined : "该兼容来源需要先通过统一转换接口载入，当前不会伪造新模板。"}
                onClick={() => definition && onCreateFrom(definition)}
              >
                基于此模板创建
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
