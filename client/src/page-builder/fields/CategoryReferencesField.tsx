import { useEffect, useMemo, useRef, useState } from "react";
import {
  categoryApi,
  type CategoryReferenceResult,
} from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";

interface CategoryNode {
  id: number;
  slug: string;
  name: string;
  isActive?: boolean;
  deletedAt?: string | null;
  coverImage?: string | null;
  hasPublicProduct?: boolean;
  children?: CategoryNode[];
}

interface CategoryReferencesFieldProps {
  value?: string[];
  onChange: (value: string[]) => void;
  minItems: number;
  maxItems: number;
  readOnly?: boolean;
}

const REASON_LABEL: Record<CategoryReferenceResult["reason"] | "FORBIDDEN" | "RESOLVE_FAILED", string> = {
  AVAILABLE: "可公开发布",
  DELETED: "分类已删除，请移除",
  INACTIVE: "分类已停用，可保留草稿但不能发布",
  NO_PUBLIC_PRODUCT: "分类没有公开商品，可保留草稿但不能发布",
  MISSING_COVER: "分类缺少封面，可保留草稿但不能发布",
  NOT_FOUND: "分类不存在，请移除",
  FORBIDDEN: "当前账号无权解析分类，请联系管理员",
  RESOLVE_FAILED: "分类解析失败，引用已保留，请重试",
};

function flatten(nodes: CategoryNode[], depth = 0): Array<CategoryNode & { depth: number }> {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flatten(node.children ?? [], depth + 1),
  ]);
}

function getRequestStatus(error: unknown): number | undefined {
  const value = error as { status?: number; response?: { status?: number } } | undefined;
  return value?.response?.status ?? value?.status;
}

export default function CategoryReferencesField({
  value,
  onChange,
  minItems,
  maxItems,
  readOnly,
}: CategoryReferencesFieldProps) {
  const slugs = useMemo(
    () => Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [],
    [value],
  );
  const [nodes, setNodes] = useState<Array<CategoryNode & { depth: number }>>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"FORBIDDEN" | "LOAD_FAILED" | null>(null);
  const [selectedRows, setSelectedRows] = useState<CategoryReferenceResult[]>([]);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<"FORBIDDEN" | "RESOLVE_FAILED" | null>(null);
  const [listRevision, setListRevision] = useState(0);
  const [selectedRevision, setSelectedRevision] = useState(0);
  const listRequestVersion = useRef(0);
  const selectedRequestVersion = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 260);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const version = ++listRequestVersion.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void categoryApi.getManageTree(controller.signal)
      .then((response) => {
        const data = unwrapResponse<CategoryNode[]>(response);
        if (version === listRequestVersion.current && !controller.signal.aborted) {
          setNodes(flatten(Array.isArray(data) ? data : []));
        }
      })
      .catch((requestError) => {
        if (version === listRequestVersion.current && !controller.signal.aborted) {
          setError(getRequestStatus(requestError) === 403 ? "FORBIDDEN" : "LOAD_FAILED");
        }
      })
      .finally(() => {
        if (version === listRequestVersion.current && !controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [listRevision]);

  useEffect(() => {
    if (slugs.length === 0) {
      setSelectedRows([]);
      setSelectedLoading(false);
      setSelectedError(null);
      return;
    }
    const version = ++selectedRequestVersion.current;
    const controller = new AbortController();
    setSelectedLoading(true);
    setSelectedError(null);
    void categoryApi.resolveReferences(slugs, controller.signal)
      .then((response) => {
        const rows = unwrapResponse<CategoryReferenceResult[]>(response);
        if (version === selectedRequestVersion.current && !controller.signal.aborted) {
          setSelectedRows(Array.isArray(rows) ? rows : []);
        }
      })
      .catch((requestError) => {
        if (version === selectedRequestVersion.current && !controller.signal.aborted) {
          setSelectedError(getRequestStatus(requestError) === 403 ? "FORBIDDEN" : "RESOLVE_FAILED");
        }
      })
      .finally(() => {
        if (version === selectedRequestVersion.current && !controller.signal.aborted) setSelectedLoading(false);
      });
    return () => controller.abort();
  }, [slugs, selectedRevision]);

  const bySlug = new Map(nodes.map((node) => [node.slug, node]));
  const selectedBySlug = new Map(selectedRows.map((row) => [row.slug, row]));
  const filtered = nodes.filter((node) => {
    return !debouncedQuery || node.name.toLowerCase().includes(debouncedQuery) || node.slug.toLowerCase().includes(debouncedQuery);
  });

  const move = (index: number, direction: -1 | 1) => {
    if (readOnly) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= slugs.length) return;
    const next = [...slugs];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  };

  return (
    <div className="homepage-editor__product-picker" aria-label="选择真实商品分类">
      <div className="homepage-editor__product-picker-method">
        <span aria-hidden="true" />
        <div><strong>从真实分类树选择</strong><small>页面只保存 Category.slug；名称、封面和链接从分类系统读取。</small></div>
      </div>
      <div className="homepage-editor__product-picker-search">
        <input value={query} disabled={readOnly} aria-label="搜索分类" placeholder="搜索分类名称或 slug" onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="homepage-editor__product-picker-results" aria-live="polite" aria-busy={loading}>
        {loading ? <div className="homepage-editor__product-picker-note">正在加载分类</div>
          : error ? <div className="homepage-editor__product-picker-note is-error">{error === "FORBIDDEN" ? "当前账号无权浏览分类，请联系管理员" : "分类加载失败，原有引用未改变"}<button type="button" onClick={() => setListRevision((value) => value + 1)}>重试加载</button></div>
            : filtered.length ? filtered.map((node) => {
                const selected = slugs.includes(node.slug);
                const unavailable = Boolean(node.deletedAt) || node.isActive === false;
                const stateLabel = node.deletedAt
                  ? "已删除"
                  : node.isActive === false
                    ? "已停用"
                    : node.hasPublicProduct === false
                      ? "无公开商品"
                      : !node.coverImage
                        ? "缺少封面"
                        : "可发布";
                return <button key={node.slug} type="button" aria-label={`${selected ? "已选择" : "选择"}分类 ${node.name}`} disabled={readOnly || selected || slugs.length >= maxItems || Boolean(unavailable)} className="homepage-editor__product-picker-row" onClick={() => onChange([...slugs, node.slug])}>
                  {node.coverImage ? <img src={node.coverImage} alt="" loading="lazy" /> : <span aria-hidden="true" />}
                  <span style={{ paddingInlineStart: node.depth * 10 }}><strong>{node.name}</strong><small>{node.slug} · {stateLabel}</small></span>
                  <em>{selected ? "已选" : unavailable ? "不可用" : "选择"}</em>
                </button>;
              }) : <div className="homepage-editor__product-picker-note">没有符合条件的分类</div>}
      </div>
      <div className="homepage-editor__product-picker-selected">
        <div className="homepage-editor__product-picker-title">已选分类 · 顺序即公开顺序<span>{slugs.length}/{maxItems} 个</span></div>
        {selectedLoading ? <div className="homepage-editor__product-picker-note">正在刷新已选分类状态，当前结果暂时保留</div> : null}
        {selectedError ? <div className="homepage-editor__product-picker-note is-error">{REASON_LABEL[selectedError]}；已保留上次成功解析结果和原始引用<button type="button" onClick={() => setSelectedRevision((value) => value + 1)}>重试解析</button></div> : null}
        {slugs.map((slug, index) => {
          const node = bySlug.get(slug);
          const resolved = selectedBySlug.get(slug);
          const reason = resolved
            ? REASON_LABEL[resolved.reason]
            : selectedError
              ? REASON_LABEL[selectedError]
              : selectedLoading
                ? "正在解析引用"
                : !node
                  ? REASON_LABEL.NOT_FOUND
                  : node.deletedAt
                    ? REASON_LABEL.DELETED
                    : node.isActive === false
                      ? REASON_LABEL.INACTIVE
                      : node.hasPublicProduct === false
                        ? REASON_LABEL.NO_PUBLIC_PRODUCT
                        : !node.coverImage
                          ? REASON_LABEL.MISSING_COVER
                          : REASON_LABEL.AVAILABLE;
          return <div key={slug} className="homepage-editor__product-picker-selected-row">
            {resolved?.coverImage || node?.coverImage ? <img src={resolved?.coverImage || node?.coverImage || ""} alt="" loading="lazy" /> : <span aria-hidden="true" />}
            <span><strong>{resolved?.name || node?.name || slug}</strong><small>{slug} · {reason}</small></span>
            <div>
              <button type="button" aria-label={`上移分类 ${resolved?.name || node?.name || slug}`} disabled={readOnly || index === 0} onClick={() => move(index, -1)}>上移</button>
              <button type="button" aria-label={`下移分类 ${resolved?.name || node?.name || slug}`} disabled={readOnly || index === slugs.length - 1} onClick={() => move(index, 1)}>下移</button>
              <button type="button" aria-label={`移除分类 ${resolved?.name || node?.name || slug}`} disabled={readOnly} onClick={() => onChange(slugs.filter((item) => item !== slug))}>移除</button>
            </div>
          </div>;
        })}
        {!selectedLoading && !selectedError && slugs.length === 0 ? <div className="homepage-editor__product-picker-note">暂未选择分类</div> : null}
        {slugs.length < minItems ? <div className="homepage-editor__product-picker-note is-error">至少选择 {minItems} 个公开分类后才能发布</div> : null}
      </div>
    </div>
  );
}
