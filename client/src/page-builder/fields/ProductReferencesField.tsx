import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "antd";
import { categoryApi } from "@/services/api";
import { SecureImage } from "@/components/common/SecureImage";
import { unwrapResponse } from "@/utils/unwrap";
import {
  fetchProductPage,
  resolveProductReferences,
  type ProductRow,
} from "../data-sources/productSource";
import "./ProductReferencesField.css";

interface CategoryOption {
  id: number;
  name: string;
  children?: CategoryOption[];
}

interface ProductReferencesFieldProps {
  value?: string[];
  legacyIds?: number[];
  onChange: (codes: string[], legacyIds: number[]) => void;
  minProducts?: number;
  maxProducts?: number;
  readOnly?: boolean;
}

type DisplayProductRow = ProductRow & { resolutionPending?: boolean };

const REASON_LABEL: Record<ProductRow["reason"], string> = {
  AVAILABLE: "可公开发布",
  DELETED: "商品已删除，请移除",
  OFFLINE: "商品已下架，可更换为公开商品",
  DRAFT: "商品仍为草稿，可先发布商品或更换",
  ARCHIVED: "商品已归档，请移除",
  NON_PUBLIC: "商品不是公开可见，请调整商品可见性或更换",
  MISSING_IMAGE: "商品缺少展示图，请先补图",
  NOT_FOUND: "商品不存在，请移除",
  FORBIDDEN: "当前账号无权解析该商品，请联系管理员",
  RESOLVE_FAILED: "商品解析失败，引用已保留，请重试",
};

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
}

function uniqueIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function flattenCategories(nodes: CategoryOption[], depth = 0): Array<CategoryOption & { label: string }> {
  return nodes.flatMap((node) => [
    { ...node, label: `${"　".repeat(depth)}${node.name}` },
    ...flattenCategories(node.children ?? [], depth + 1),
  ]);
}

export default function ProductReferencesField({
  value,
  legacyIds,
  onChange,
  minProducts = 1,
  maxProducts = 8,
  readOnly,
}: ProductReferencesFieldProps) {
  const codes = useMemo(() => uniqueStrings(value), [value]);
  const oldIds = useMemo(() => uniqueIds(legacyIds), [legacyIds]);
  const [selectedRows, setSelectedRows] = useState<ProductRow[]>([]);
  const [results, setResults] = useState<ProductRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftCodes, setDraftCodes] = useState<string[]>([]);
  const [draftLegacyIds, setDraftLegacyIds] = useState<number[]>([]);
  const [candidateRows, setCandidateRows] = useState<Record<string, ProductRow>>({});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [visibility, setVisibility] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [categories, setCategories] = useState<Array<CategoryOption & { label: string }>>([]);
  const [categoryError, setCategoryError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<"FORBIDDEN" | "RESOLVE_FAILED" | null>(null);
  const [error, setError] = useState<"FORBIDDEN" | "LOAD_FAILED" | null>(null);
  const [categoryRevision, setCategoryRevision] = useState(0);
  const [selectedRevision, setSelectedRevision] = useState(0);
  const [listRevision, setListRevision] = useState(0);
  const requestVersion = useRef(0);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const pageSize = 12;

  useEffect(() => {
    if (!pickerOpen) return;
    const controller = new AbortController();
    setCategoryError(false);
    void categoryApi.getManageTree()
      .then((response) => {
        const data = unwrapResponse<CategoryOption[]>(response);
        if (!controller.signal.aborted) setCategories(flattenCategories(Array.isArray(data) ? data : []));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCategories([]);
          setCategoryError(true);
        }
      });
    return () => controller.abort();
  }, [categoryRevision, pickerOpen]);

  useEffect(() => {
    const controller = new AbortController();
    setSelectedLoading(codes.length + oldIds.length > 0);
    setSelectedError(null);
    void resolveProductReferences(
      { codes: codes.length ? codes : undefined, legacyIds: oldIds.length ? oldIds : undefined },
      controller.signal,
    )
      .then((rows) => {
        if (!controller.signal.aborted) setSelectedRows(rows);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted && codes.length + oldIds.length > 0) {
          const status = (requestError as { response?: { status?: unknown } })?.response?.status;
          setSelectedError(status === 403 ? "FORBIDDEN" : "RESOLVE_FAILED");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSelectedLoading(false);
      });
    return () => controller.abort();
  }, [codes, oldIds, selectedRevision]);

  useEffect(() => {
    if (!pickerOpen) return;
    const version = ++requestVersion.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void fetchProductPage({
        query: query.trim(),
        page,
        pageSize,
        categoryId,
        status: status || undefined,
        visibility: visibility || undefined,
        signal: controller.signal,
      })
        .then((result) => {
          if (version !== requestVersion.current || controller.signal.aborted) return;
          setResults(result.rows);
          setTotal(result.total);
          setCandidateRows((current) => ({
            ...current,
            ...Object.fromEntries(result.rows.map((row) => [row.code, row])),
          }));
        })
        .catch((requestError: unknown) => {
          if (version !== requestVersion.current || controller.signal.aborted) return;
          const status = (requestError as { response?: { status?: unknown } })?.response?.status;
          setError(status === 403 ? "FORBIDDEN" : "LOAD_FAILED");
        })
        .finally(() => {
          if (version === requestVersion.current && !controller.signal.aborted) setLoading(false);
        });
    }, query.trim() ? 260 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [categoryId, listRevision, page, pickerOpen, query, status, visibility]);

  const selectedByCode = new Map(
    selectedRows.filter((row) => row.code).map((row) => [row.code, row]),
  );
  const selectedByLegacyId = new Map(
    selectedRows.flatMap((row) => {
      const id = row.legacyId ?? row.id;
      return Number.isInteger(id) && id > 0 ? [[id, row] as const] : [];
    }),
  );
  const resolvedLegacyCodes = oldIds.map((id) => selectedByLegacyId.get(id)?.code ?? "");
  const allLegacyResolved = resolvedLegacyCodes.every(Boolean);
  const activeCodes = [...new Set([
    ...codes,
    ...(allLegacyResolved ? resolvedLegacyCodes : []),
  ])];
  const displaySelectedRows: DisplayProductRow[] = [
    ...codes.map((code) => selectedByCode.get(code) ?? {
      id: 0,
      code,
      name: "引用状态待确认",
      price: 0,
      priceLabel: "",
      image: "",
      category: "",
      status: "",
      visibility: "",
      eligible: false,
      reason: "RESOLVE_FAILED" as const,
      resolutionPending: selectedLoading && !selectedError,
    }),
    ...oldIds.map((legacyId) => selectedByLegacyId.get(legacyId) ?? {
      id: legacyId,
      legacyId,
      code: "",
      name: `旧商品引用 #${legacyId}`,
      price: 0,
      priceLabel: "",
      image: "",
      category: "",
      status: "",
      visibility: "",
      eligible: false,
      reason: "RESOLVE_FAILED" as const,
      resolutionPending: selectedLoading && !selectedError,
    }),
  ];
  const selectedCount = codes.length + oldIds.length;

  const draftSelectedByCode = new Map(
    [...selectedRows, ...Object.values(candidateRows)]
      .filter((row) => row.code)
      .map((row) => [row.code, row]),
  );
  const draftResolvedLegacyCodes = draftLegacyIds.map(
    (id) => selectedByLegacyId.get(id)?.code ?? "",
  );
  const allDraftLegacyResolved = draftResolvedLegacyCodes.every(Boolean);
  const draftActiveCodes = [...new Set([
    ...draftCodes,
    ...(allDraftLegacyResolved ? draftResolvedLegacyCodes : []),
  ])];
  const draftDisplayRows: DisplayProductRow[] = [
    ...draftCodes.map((code) => draftSelectedByCode.get(code) ?? {
      id: 0,
      code,
      name: "引用状态待确认",
      price: 0,
      priceLabel: "",
      image: "",
      category: "",
      status: "",
      visibility: "",
      eligible: false,
      reason: "RESOLVE_FAILED" as const,
      resolutionPending: true,
    }),
    ...draftLegacyIds.map((legacyId) => selectedByLegacyId.get(legacyId) ?? {
      id: legacyId,
      legacyId,
      code: "",
      name: `旧商品引用 #${legacyId}`,
      price: 0,
      priceLabel: "",
      image: "",
      category: "",
      status: "",
      visibility: "",
      eligible: false,
      reason: "RESOLVE_FAILED" as const,
      resolutionPending: selectedLoading && !selectedError,
    }),
  ];
  const draftSelectedCount = draftCodes.length + draftLegacyIds.length;

  const openPicker = () => {
    setDraftCodes(codes);
    setDraftLegacyIds(oldIds);
    setCandidateRows(Object.fromEntries(
      selectedRows.filter((row) => row.code).map((row) => [row.code, row]),
    ));
    setPickerOpen(true);
  };

  const closePicker = () => {
    setPickerOpen(false);
  };

  const resetFilters = () => {
    setQuery("");
    setCategoryId(undefined);
    setStatus("");
    setVisibility("");
    setPage(1);
  };

  const getDraftLegacyIdForCode = (code: string) => draftLegacyIds.find(
    (legacyId) => selectedByLegacyId.get(legacyId)?.code === code,
  );

  const toggleDraftProduct = (product: ProductRow) => {
    if (readOnly) return;
    const legacyId = getDraftLegacyIdForCode(product.code);
    const selectedAsCode = draftCodes.includes(product.code);
    if (selectedAsCode || legacyId) {
      setDraftCodes((current) => current.filter((code) => code !== product.code));
      if (legacyId) {
        setDraftLegacyIds((current) => current.filter((id) => id !== legacyId));
      }
      return;
    }
    if (!allDraftLegacyResolved) return;
    if (maxProducts === 1) {
      setDraftCodes([product.code]);
      setDraftLegacyIds([]);
      return;
    }
    if (draftSelectedCount >= maxProducts) return;
    setDraftCodes((current) => [...new Set([...current, product.code])]);
  };

  const removeDraftRow = (product: ProductRow) => {
    if (readOnly) return;
    const legacyId = product.legacyId && draftLegacyIds.includes(product.legacyId)
      ? product.legacyId
      : getDraftLegacyIdForCode(product.code);
    if (legacyId) {
      setDraftLegacyIds((current) => current.filter((id) => id !== legacyId));
      return;
    }
    setDraftCodes((current) => current.filter((code) => code !== product.code));
  };

  const moveDraftRow = (index: number, direction: -1 | 1) => {
    if (readOnly || !allDraftLegacyResolved) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draftDisplayRows.length) return;
    const ordered = draftDisplayRows.map((row) => row.code).filter(Boolean);
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    setDraftCodes(ordered);
    setDraftLegacyIds([]);
  };

  const confirmDraftSelection = () => {
    if (
      readOnly ||
      !allDraftLegacyResolved ||
      draftSelectedCount < minProducts ||
      draftSelectedCount > maxProducts
    ) return;
    onChange(draftActiveCodes, []);
    setPickerOpen(false);
  };

  const commitCodes = (nextCodes: string[]) => {
    if (readOnly || !allLegacyResolved) return;
    onChange([...new Set(nextCodes)], []);
  };

  const removeRow = (row: ProductRow) => {
    if (readOnly) return;
    if (codes.length) {
      onChange(codes.filter((code) => code !== row.code), []);
      return;
    }
    if (row.legacyId) {
      if (allLegacyResolved) {
        commitCodes(activeCodes.filter((code) => code !== row.code));
      } else {
        onChange([], oldIds.filter((id) => id !== row.legacyId));
      }
      return;
    }
    if (allLegacyResolved) commitCodes(activeCodes.filter((code) => code !== row.code));
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    if (readOnly || !allLegacyResolved) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= displaySelectedRows.length) return;
    const ordered = displaySelectedRows.map((row) => row.code).filter(Boolean);
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    commitCodes(ordered);
  };

  return (
    <div className="homepage-editor__product-picker" aria-label="选择真实商品">
      <div className="homepage-editor__product-picker-method">
        <span aria-hidden="true" />
        <div>
          <strong>从真实商品库选择</strong>
          <small>页面只保存商品 code；名称、价格、图片和状态始终从商品系统读取。</small>
        </div>
      </div>
      <div className="homepage-editor__product-picker-entry">
        <div>
          <strong>{selectedCount > 0 ? `已选择 ${selectedCount} 件商品` : "尚未选择商品"}</strong>
          <small>
            {maxProducts === 1
              ? "打开商品库后单击商品，再确认选择。"
              : `可选择 ${minProducts}–${maxProducts} 件，公开展示顺序可在下方调整。`}
          </small>
        </div>
        <button
          ref={pickerTriggerRef}
          type="button"
          className="homepage-editor__product-picker-trigger"
          disabled={readOnly}
          onClick={openPicker}
        >
          {selectedCount > 0 ? "重新选择商品" : "选择商品"}
        </button>
      </div>

      <div className="homepage-editor__product-picker-selected">
        <div className="homepage-editor__product-picker-title">已选商品 · 顺序即公开顺序<span>{selectedCount}/{maxProducts} 件</span></div>
        {selectedLoading ? <div className="homepage-editor__product-picker-note">正在刷新已选商品状态…当前结果暂时保留</div> : null}
        {selectedError ? <div className="homepage-editor__product-picker-note is-error">{REASON_LABEL[selectedError]}；已保留上次成功解析结果和原始引用<button type="button" onClick={() => setSelectedRevision((value) => value + 1)}>重试解析</button></div> : null}
        {displaySelectedRows.map((product, index) => <div key={product.code || `legacy-${product.legacyId}-${index}`} className="homepage-editor__product-picker-selected-row">
          {product.image ? <SecureImage src={product.image} alt="" tokenKind="staff" className="homepage-editor__product-picker-thumb" /> : <span aria-hidden="true" />}
          <span><strong>{product.name}</strong><small>{product.code || `旧引用 #${product.legacyId}`} · {"resolutionPending" in product && product.resolutionPending ? "正在解析引用" : REASON_LABEL[product.reason]}</small></span>
          <div>
            <button type="button" aria-label={`上移 ${product.name || product.code || `旧引用 ${product.legacyId}`}`} disabled={readOnly || !allLegacyResolved || index === 0} onClick={() => moveRow(index, -1)}>上移</button>
            <button type="button" aria-label={`下移 ${product.name || product.code || `旧引用 ${product.legacyId}`}`} disabled={readOnly || !allLegacyResolved || index === displaySelectedRows.length - 1} onClick={() => moveRow(index, 1)}>下移</button>
            <button type="button" aria-label={`移除 ${product.name || product.code || `旧引用 ${product.legacyId}`}`} disabled={readOnly} onClick={() => removeRow(product)}>移除</button>
          </div>
        </div>)}
        {!selectedLoading && !selectedError && selectedCount === 0 ? <div className="homepage-editor__product-picker-note">暂未选择商品</div> : null}
        {selectedCount > 0 && selectedCount < minProducts ? <div className="homepage-editor__product-picker-note is-error">至少选择 {minProducts} 件商品后才能发布</div> : null}
        {!allLegacyResolved ? <div className="homepage-editor__product-picker-note is-error">旧引用中有无法解析的商品；请先移除失效项，再添加或排序。</div> : null}
      </div>

      <Modal
        title="选择商品"
        open={pickerOpen}
        width={1120}
        centered
        keyboard
        maskClosable={false}
        wrapClassName="homepage-editor__product-picker-modal"
        okText={`确认选择（${draftSelectedCount}）`}
        cancelText="取消"
        okButtonProps={{
          disabled:
            readOnly ||
            !allDraftLegacyResolved ||
            draftSelectedCount < minProducts ||
            draftSelectedCount > maxProducts,
          size: "large",
        }}
        cancelButtonProps={{ size: "large" }}
        onOk={confirmDraftSelection}
        onCancel={closePicker}
        afterClose={() => pickerTriggerRef.current?.focus()}
      >
        <div className="homepage-editor__product-picker-dialog">
          <div className="homepage-editor__product-picker-dialog-heading">
            <div>
              <strong>从商品库关联</strong>
              <span>名称、价格、图片和公开状态始终从商品系统读取。</span>
            </div>
            <span>已选 {draftSelectedCount}/{maxProducts} 件</span>
          </div>

          <div className="homepage-editor__product-picker-toolbar" aria-label="商品搜索与筛选">
            <label>
              <span>搜索商品</span>
              <input
                value={query}
                disabled={readOnly}
                aria-label="搜索商品名称或货号"
                placeholder="搜索商品名称或货号"
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              />
            </label>
            <label>
              <span>商品分类</span>
              <select aria-label="商品分类" value={categoryId ?? ""} onChange={(event) => { setCategoryId(event.target.value ? Number(event.target.value) : undefined); setPage(1); }}>
                <option value="">全部分类</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
              </select>
            </label>
            <label>
              <span>商品状态</span>
              <select aria-label="商品状态" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="">全部状态</option><option value="PUBLISHED">已发布</option><option value="DRAFT">草稿</option><option value="OFFLINE">已下架</option><option value="ARCHIVED">已归档</option>
              </select>
            </label>
            <label>
              <span>公开资格</span>
              <select aria-label="公开资格" value={visibility} onChange={(event) => { setVisibility(event.target.value); setPage(1); }}>
                <option value="">全部可见范围</option><option value="PUBLIC">公开</option><option value="MEMBER">会员</option><option value="PARTNER">合作商家</option><option value="INTERNAL">内部</option>
              </select>
            </label>
            <button type="button" className="homepage-editor__product-picker-reset" onClick={resetFilters}>重置</button>
          </div>

          {categoryError ? (
            <div className="homepage-editor__product-picker-note is-error" role="status">
              分类筛选加载失败，仍可使用关键词、状态和公开资格继续选择商品
              <button type="button" onClick={() => setCategoryRevision((value) => value + 1)}>重新加载分类</button>
            </div>
          ) : null}

          <div className="homepage-editor__product-picker-dialog-results" aria-live="polite" aria-busy={loading}>
            {loading ? <div className="homepage-editor__product-picker-dialog-state">正在加载商品…</div>
              : error ? <div className="homepage-editor__product-picker-dialog-state is-error">{error === "FORBIDDEN" ? "当前账号无权浏览商品，请联系管理员。" : "商品加载失败，原有选择未改变。"}<button type="button" onClick={() => setListRevision((value) => value + 1)}>重新加载</button></div>
              : results.length ? results.map((product) => {
                  const selected = draftActiveCodes.includes(product.code);
                  const addBlocked = !selected && (
                    readOnly ||
                    !allDraftLegacyResolved ||
                    (maxProducts !== 1 && draftSelectedCount >= maxProducts)
                  );
                  return (
                    <button
                      key={product.code}
                      type="button"
                      className="homepage-editor__product-picker-card"
                      data-selected={selected}
                      aria-pressed={selected}
                      disabled={addBlocked}
                      onClick={() => toggleDraftProduct(product)}
                    >
                      <span className="homepage-editor__product-picker-card-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                      {product.image ? (
                        <SecureImage src={product.image} alt="" tokenKind="staff" className="homepage-editor__product-picker-card-image" />
                      ) : (
                        <span className="homepage-editor__product-picker-card-image is-empty" aria-hidden="true">暂无图片</span>
                      )}
                      <span className="homepage-editor__product-picker-card-copy">
                        <strong>{product.name}</strong>
                        <small>{product.code} · {product.category || "未分类"}</small>
                        <em data-eligible={product.eligible}>{REASON_LABEL[product.reason]}</em>
                        <b>{product.priceLabel}</b>
                      </span>
                    </button>
                  );
                })
                : <div className="homepage-editor__product-picker-dialog-state">没有符合当前筛选条件的商品</div>}
          </div>

          <div className="homepage-editor__product-picker-dialog-pagination" aria-label="商品分页">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
            <span>第 {page} 页 · 共 {total} 件商品</span>
            <button type="button" disabled={page * pageSize >= total || loading} onClick={() => setPage((value) => value + 1)}>下一页</button>
          </div>

          <section className="homepage-editor__product-picker-draft" aria-label="本次已选商品">
            <header>
              <strong>本次已选</strong>
              <span>{draftSelectedCount}/{maxProducts} 件 · 确认后才会更新页面</span>
            </header>
            {draftDisplayRows.length > 0 ? (
              <div>
                {draftDisplayRows.map((product, index) => (
                  <article key={product.code || `draft-legacy-${product.legacyId}-${index}`}>
                    {product.image ? <SecureImage src={product.image} alt="" tokenKind="staff" /> : <span aria-hidden="true" />}
                    <span><strong>{product.name}</strong><small>{product.code || `旧引用 #${product.legacyId}`}</small></span>
                    <div>
                      <button type="button" aria-label={`上移本次选择 ${product.name}`} disabled={readOnly || !allDraftLegacyResolved || index === 0} onClick={() => moveDraftRow(index, -1)}>上移</button>
                      <button type="button" aria-label={`下移本次选择 ${product.name}`} disabled={readOnly || !allDraftLegacyResolved || index === draftDisplayRows.length - 1} onClick={() => moveDraftRow(index, 1)}>下移</button>
                      <button type="button" aria-label={`移除本次选择 ${product.name}`} disabled={readOnly} onClick={() => removeDraftRow(product)}>移除</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p>尚未选择商品。</p>
            )}
            {draftSelectedCount < minProducts ? <p role="alert">至少选择 {minProducts} 件商品后才能确认。</p> : null}
            {!allDraftLegacyResolved ? <p role="alert">旧引用中有无法解析的商品，请先移除失效项。</p> : null}
          </section>
        </div>
      </Modal>
    </div>
  );
}
