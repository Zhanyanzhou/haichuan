import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { App as AntdApp } from "antd";
import { useSelectionStore } from "@/store/selectionStore";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import type { CatalogProduct } from "@/data/catalogData";
import {
  selectVirtualCatalog,
  VIRTUAL_PUBLIC_WORK_NOTICE,
} from "@/data/virtualPublicWorks";
import {
  expandCategoryIds,
  useProductData,
  useProductCategories,
  type ProductQuery,
  type RealCategory,
} from "@/hooks/useProductData";
import { useAttributeDictionary } from "@/hooks/useAttributeDictionary";
import { getMaterialCode } from "@/utils/material";
import {
  trackPageView,
  trackFilter,
  trackViewItemList,
} from "@/hooks/useAnalytics";
import { usePageDecorationState } from "@/page-builder/runtime/PublishedPageDecoration";
import {
  useCommerceCapabilities,
} from "@/store/featureFlags";
import CatalogSearch from "./CatalogSearch";
import "./catalogLayout.css";
import {
  ActiveFilters,
  FilterDrawer,
  PrimaryNav,
  SecondaryNav,
  Toolbar,
  type CatalogFilterValues,
} from "./CatalogFilters";
import { getCatalogPriceError } from "./CatalogFilterDrawer";
import { CatalogPathways, ProductGrid } from "./CatalogProductSurface";
import SelectionTray, { type SelectionLookupState } from "./SelectionTray";
import { catNameById, getPrimaryCats } from "./catalogCategories";
import {
  applyCategoryDrafts,
  CatalogCanvasPrimary,
  CatalogCanvasSecondary,
  collectCategoryNames,
  saveCanvasCategoryName,
} from "./CatalogCanvasCategories";
import {
  catalogSort,
  getCatalogSearchQuery,
  serializeWeightRanges,
  useURLParams,
} from "./catalogQuery";
import { catalogTokens as T } from "./catalogTokens";
import RouteLoading from "@/components/common/RouteLoading";
import {
  completeCatalogReturnContext,
  readCatalogReturnContext,
} from "./catalogReturnContext";

const PAGE_SIZE = 32;

function filterQuery(values: CatalogFilterValues): Partial<ProductQuery> {
  const minPrice = values.minPrice.trim();
  const maxPrice = values.maxPrice.trim();
  return {
    materialTypes: values.materials.map(getMaterialCode).filter(Boolean).join(",") || undefined,
    craftTechniques: values.crafts.join(",") || undefined,
    sizes: values.sizes.join(",") || undefined,
    weightRanges: serializeWeightRanges(values.weights),
    minPrice: minPrice === "" ? undefined : Number(minPrice),
    maxPrice: maxPrice === "" ? undefined : Number(maxPrice),
  };
}

function namesForCategoryIds(categories: RealCategory[], ids: string): string[] {
  if (!ids) return [];
  const wanted = new Set(ids.split(",").filter(Boolean));
  const names: string[] = [];
  const walk = (nodes: RealCategory[]) => {
    for (const node of nodes) {
      if (wanted.has(String(node.id)) && node.name.trim()) names.push(node.name.trim());
      if (node.children?.length) walk(node.children);
    }
  };
  walk(categories);
  return names;
}

/* ══════════════════════════════════════
   组件：分页
   ══════════════════════════════════════ */
function Pagination({
  total,
  page,
  onPage,
}: {
  total: number;
  page: number;
  onPage: (p: number) => void;
}) {
  const tp = Math.ceil(total / PAGE_SIZE);
  if (tp <= 1) return null;
  const pages: (number | string)[] = [];
  for (let i = 1; i <= tp; i++) {
    if (i === 1 || i === tp || (i >= page - 1 && i <= page + 1)) pages.push(i);
    else if (pages[pages.length - 1] !== "...") pages.push("...");
  }
  return (
    <nav
      aria-label="作品分页"
      style={{
        maxWidth: 1560,
        marginInline: "auto",
        paddingInline: "clamp(48px,5vw,80px)",
        paddingBlock: "clamp(40px,5vh,60px)",
        display: "flex",
        justifyContent: "center",
        gap: 4,
      }}
    >
      <PBtn ariaLabel="上一页" disabled={page === 1} onClick={() => onPage(page - 1)}>
        ‹
      </PBtn>
      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`d${i}`}
            style={{ width: 36, textAlign: "center", color: T.sec }}
          >
            …
          </span>
        ) : (
          <PBtn key={p} active={p === page} onClick={() => onPage(p as number)}>
            {p}
          </PBtn>
        ),
      )}
      <PBtn ariaLabel="下一页" disabled={page === tp} onClick={() => onPage(page + 1)}>
        ›
      </PBtn>
    </nav>
  );
}

function PBtn({
  children,
  active,
  disabled,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      style={{
        minWidth: 44,
        minHeight: 44,
        border: "none",
        background: active ? T.txt : "transparent",
        cursor: disabled ? "default" : "pointer",
        fontSize: 12,
        color: active ? "#FFFFFF" : disabled ? "rgba(24,26,27,0.3)" : T.txt,
      }}
    >
      {children}
    </button>
  );
}

/* ══════════════════════════════════════
   组件：吸顶工具栏
   ══════════════════════════════════════ */
function StickyBar({
  category,
  total,
  sort,
  selCount,
  filterCount,
  onSort,
  onOpenFilter,
  categories,
}: {
  category: string;
  total: number;
  sort: string;
  selCount: number;
  filterCount: number;
  onSort: (s: string) => void;
  onOpenFilter: (trigger: HTMLButtonElement) => void;
  categories: RealCategory[];
}) {
  const parentName = catNameById(categories, Number(category));
  const path = category ? parentName : "全部款式";
  return (
    <div
      className="catalog-sticky-bar"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        zIndex: 40,
        background: "rgba(255,255,255,0.95)",
        borderBottom: `1px solid ${T.line}`,
      }}
    >
      <div
        className="catalog-sticky-bar__inner"
        style={{
          maxWidth: 1280,
          marginInline: "auto",
          paddingInline: "clamp(48px,5vw,80px)",
          height: 52,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <span style={{ fontSize: 12, color: T.txt }}>{path}</span>
        {total > 0 ? (
          <span style={{ fontSize: 11, color: T.sec }}>{total} 件</span>
        ) : null}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={(event) => onOpenFilter(event.currentTarget)}
          aria-label={filterCount > 0 ? `筛选，已选 ${filterCount} 项` : "筛选"}
          style={{
            minHeight: 44,
            padding: "0 8px",
            border: 0,
            background: "transparent",
            cursor: "pointer",
            fontSize: 12,
            color: T.txt,
            whiteSpace: "nowrap",
          }}
        >
          {filterCount > 0 ? `筛选 ${filterCount}` : "筛选"}
        </button>
        <span style={{ fontSize: 12, color: T.txt }}>排序</span>
        <select
          aria-label="作品排序方式"
          value={sort}
          onChange={(e) => onSort(e.target.value)}
          style={{
            background: "transparent",
            border: 0,
            outline: "none",
            fontSize: 12,
            color: T.txt,
            cursor: "pointer",
            WebkitAppearance: "none",
            appearance: "none",
          }}
        >
          <option value="recommended">综合</option>
          <option value="newest">新品</option>
          <option value="price_asc">价格从低到高</option>
          <option value="price_desc">价格从高到低</option>
          <option value="sku">款号升序</option>
        </select>
        {selCount > 0 && (
          <span style={{ fontSize: 11, color: T.sec }}>已选 {selCount}</span>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   主页面
   ══════════════════════════════════════ */
export type CatalogProps = {
  mode?: "public" | "editor-preview";
  hasLeadingDecoration?: boolean;
};

export default function Catalog({
  mode = "public",
  hasLeadingDecoration: leadingDecorationOverride,
}: CatalogProps = {}) {
  const { message } = AntdApp.useApp();
  const location = useLocation();
  const {
    error: commerceFlagsError,
    reload: reloadCommerceFlags,
  } = useCommerceCapabilities();
  const decorationState = usePageDecorationState();
  const editorPreview = mode === "editor-preview";
  const hasLeadingDecoration =
    leadingDecorationOverride ?? decorationState.active;
  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);
  useEffect(() => {
    if (editorPreview) return;
    setPageMeta({
      title: "选款中心 | 海川珠宝",
      description: "按品类、材质与款号选款，加入心仪作品并提交选款咨询。",
    });
    return () => clearPageMeta();
  }, [clearPageMeta, editorPreview, setPageMeta]);

  const { params, update, updateMany } = useURLParams(!editorPreview);
  const filterValues = useMemo<CatalogFilterValues>(() => ({
    materials: params.materials,
    crafts: params.crafts,
    weights: params.weights,
    sizes: params.sizes,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
  }), [params]);
  const priceOnly = params.minPrice !== "" || params.maxPrice !== ""
    || params.sort === "price_asc" || params.sort === "price_desc";
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<CatalogFilterValues | null>(null);
  const filterTriggerRef = useRef<HTMLElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const pendingPageFocusRef = useRef<number | null>(null);
  const pendingCatalogReturnRef = useRef<ReturnType<typeof readCatalogReturnContext>>(null);
  const closeFilter = useCallback(() => {
    setFilterOpen(false);
    setFilterDraft(null);
  }, []);

  useEffect(() => {
    if (editorPreview || location.hash !== "#catalog-search-input") return;
    const frame = window.requestAnimationFrame(() => {
      const input = document.getElementById("catalog-search-input");
      if (!(input instanceof HTMLInputElement)) return;
      input.scrollIntoView({ block: "center", behavior: "auto" });
      input.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editorPreview, location.hash, location.key]);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const catalogAudience = useCustomerAuthStore((state) => state.isLoggedIn)
    ? "member"
    : "public";
  const removeInvalidSelections = useSelectionStore((s) => s.removeMany);
  const { materialOptions, craftOptions } = useAttributeDictionary();

  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    reload: reloadCategories,
  } = useProductCategories();
  const [categoryDrafts, setCategoryDrafts] = useState<Record<number, string>>({});
  const [categoryEditNote, setCategoryEditNote] = useState("");
  const displayCategories = useMemo(
    () => applyCategoryDrafts(categories, editorPreview ? categoryDrafts : {}),
    [categories, categoryDrafts, editorPreview],
  );
  const savedCategoryNames = useMemo(
    () => collectCategoryNames(categories),
    [categories],
  );
  const setCategoryDraft = useCallback((id: number, name: string | null) => {
    setCategoryDrafts((current) => {
      if (name === null) {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      if (current[id] === name) return current;
      return { ...current, [id]: name };
    });
  }, []);
  const renameCanvasCategory = useCallback((id: number, savedName: string, value: string) => {
    const next = value.trim();
    if (!next || next === savedName) {
      setCategoryDraft(id, null);
      return;
    }
    setCategoryDraft(id, next);
    setCategoryEditNote("正在保存…");
    void saveCanvasCategoryName(id, savedName, next).then((result) => {
      if (result === "failed") {
        setCategoryDraft(id, null);
        setCategoryEditNote("名称没有保存，已恢复原来的名称。");
        return;
      }
      setCategoryEditNote("");
      reloadCategories();
    });
  }, [reloadCategories, setCategoryDraft]);
  useEffect(() => {
    if (!editorPreview) return;
    setCategoryDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const [id, name] of Object.entries(current)) {
        if (savedCategoryNames[Number(id)] === name) {
          delete next[Number(id)];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [editorPreview, savedCategoryNames]);
  const categoryTarget = params.subcategory || params.category;
  const categoryIds = useMemo(
    () =>
      categoryTarget
        ? expandCategoryIds(categories, categoryTarget) || categoryTarget
        : "",
    [categories, categoryTarget],
  );
  const catalogQuery = useMemo<ProductQuery | null>(() => {
    if (categoryTarget && categoriesLoading) return null;
    const { keyword, exactCode } = getCatalogSearchQuery(params.query);
    return {
      page: params.page,
      pageSize: PAGE_SIZE,
      sortBy: catalogSort(params.sort, Boolean(keyword)),
      includeFacets: "true",
      exactCode: priceOnly || params.materials.length || params.crafts.length
        || params.weights.length || params.sizes.length ? undefined : exactCode,
      keyword,
      categoryIds: categoryIds || undefined,
      ...filterQuery(filterValues),
    };
  }, [
    categoriesLoading,
    categoryIds,
    categoryTarget,
    filterValues,
    priceOnly,
    params,
  ]);

  /* ═══ API 产品数据（服务端筛选 + URL 分页） ═══ */
  const {
    products: mergedProducts,
    total,
    facets,
    loading: productsLoading,
    error: productsError,
    refreshError: productsRefreshError,
    refreshing: productsRefreshing,
    reload: reloadProducts,
    revision: catalogRevision,
    queryKey: catalogQueryKey,
    dataQueryKey: catalogDataQueryKey,
  } = useProductData(catalogQuery, {
    loadCategories: false,
    refreshKey: catalogAudience,
  });
  const apiLoading = productsLoading || (Boolean(categoryTarget) && categoriesLoading);
  const apiError = productsError || (categoryTarget ? categoriesError : null);
  const catalogResponseCurrent = catalogDataQueryKey === catalogQueryKey;
  const tp = Math.ceil(total / PAGE_SIZE);
  const sizeOptions = catalogResponseCurrent ? facets.sizes : [];
  const draftQuery = useMemo<ProductQuery | null>(() => {
    if (!filterOpen || !filterDraft || !catalogQuery
      || getCatalogPriceError(filterDraft.minPrice, filterDraft.maxPrice)) return null;
    const draftHasPrice = Boolean(filterDraft.minPrice.trim() || filterDraft.maxPrice.trim())
      || params.sort === "price_asc" || params.sort === "price_desc";
    const { exactCode } = getCatalogSearchQuery(params.query);
    return {
      ...catalogQuery,
      ...filterQuery(filterDraft),
      exactCode: draftHasPrice || filterDraft.materials.length || filterDraft.crafts.length
        || filterDraft.weights.length || filterDraft.sizes.length ? undefined : exactCode,
      page: 1,
      pageSize: 1,
      includeFacets: undefined,
    };
  }, [catalogQuery, filterDraft, filterOpen, params.query, params.sort]);
  const draftResults = useProductData(draftQuery, {
    loadCategories: false,
    subscribe: false,
    refreshKey: `${catalogAudience}:${catalogRevision}`,
  });

  // 翻页时单独读取同条件第一页供联想使用，其余情况复用主目录响应。
  const firstPageSuggestionQuery = useMemo<ProductQuery | null>(
    () => catalogQuery && params.page > 1 && params.query.trim()
      ? { ...catalogQuery, page: 1, pageSize: 8, includeFacets: undefined }
      : null,
    [catalogQuery, params.page, params.query],
  );
  const firstPageSuggestions = useProductData(firstPageSuggestionQuery, {
    loadCategories: false,
    subscribe: false,
    refreshKey: `${catalogAudience}:${catalogRevision}`,
  });

  const selectedIdsKey = useMemo(
    () => Array.from(selectedIds).sort((a, b) => a - b).join(","),
    [selectedIds],
  );
  const selectedQuery = useMemo<ProductQuery | null>(
    () =>
      selectedIdsKey
        ? {
            ids: selectedIdsKey,
            page: 1,
            pageSize: Math.min(2_000, selectedIds.size),
            sortBy: "sortOrder",
          }
        : null,
    [selectedIds.size, selectedIdsKey],
  );
  const {
    products: selectedProducts,
    total: selectedTotal,
    loading: selectedLoading,
    error: selectedError,
    reload: reloadSelected,
    queryKey: selectedQueryKey,
    dataQueryKey: selectedDataQueryKey,
  } = useProductData(selectedQuery, {
    subscribe: false,
    loadCategories: false,
    refreshKey: `${catalogAudience}:${catalogRevision}`,
    requireFresh: true,
  });
  const selectedResponseCurrent = selectedDataQueryKey === selectedQueryKey;
  const selectedResponseComplete = selectedProducts.length >= selectedTotal;
  const selectionLookupState: SelectionLookupState = selectedIds.size === 0
    ? "ready"
    : selectedError || (!selectedLoading && selectedResponseCurrent && !selectedResponseComplete)
      ? "error"
      : selectedLoading || !selectedResponseCurrent
        ? "loading"
        : "ready";
  const reconciliationRef = useRef("");
  useEffect(() => {
    if (!selectedQuery || selectionLookupState !== "ready") return;
    const validIds = new Set(selectedProducts.map((product) => product.id));
    const signature = `${selectedDataQueryKey}|${Array.from(validIds).sort((a, b) => a - b).join(",")}`;
    if (reconciliationRef.current === signature) return;
    reconciliationRef.current = signature;
    const invalidIds = Array.from(selectedIds).filter((id) => !validIds.has(id));
    if (!invalidIds.length) return;
    removeInvalidSelections(invalidIds);
    message.warning({
      key: "catalog-invalid-selections",
      content: `已移除 ${invalidIds.length} 款当前不可用的作品`,
    });
  }, [
    removeInvalidSelections,
    message,
    selectedDataQueryKey,
    selectedIds,
    selectedProducts,
    selectedQuery,
    selectionLookupState,
  ]);
  const selectionProducts = useMemo(() => {
    const byId = new Map<number, CatalogProduct>();
    for (const product of [...mergedProducts, ...selectedProducts]) {
      byId.set(product.id, product);
    }
    return Array.from(byId.values());
  }, [mergedProducts, selectedProducts]);
  const selCount = selectionLookupState === "ready"
    ? selectionProducts.filter((product) => selectedIds.has(product.id)).length
    : 0;
  const activeKeyword = params.query.trim();
  const hasStructuralFilters = Boolean(
    params.category ||
      params.subcategory ||
      params.materials.length ||
      params.crafts.length ||
      params.weights.length ||
      params.sizes.length || priceOnly,
  );
  const hasActiveFilters = Boolean(activeKeyword || hasStructuralFilters);
  const selectedCategoryNames = useMemo(
    () => namesForCategoryIds(categories, categoryIds),
    [categories, categoryIds],
  );
  const baselineQuery = useMemo<ProductQuery | null>(() => {
    if (editorPreview || !hasActiveFilters) return null;
    return { page: 1, pageSize: 1, sortBy: "sortOrder" };
  }, [editorPreview, hasActiveFilters]);
  const {
    total: baselineTotal,
    loading: baselineLoading,
    error: baselineError,
    queryKey: baselineQueryKey,
    dataQueryKey: baselineDataQueryKey,
  } = useProductData(baselineQuery, {
    loadCategories: false,
    subscribe: false,
    refreshKey: catalogAudience,
  });
  const baselineReady = baselineDataQueryKey === baselineQueryKey && !baselineLoading && !baselineError;
  const serverCatalogEmpty = !editorPreview && (
    (
      !hasActiveFilters
      && catalogResponseCurrent
      && !apiLoading
      && !apiError
      && total === 0
    ) || (
      hasActiveFilters
      && !categoriesError
      && !(categoryTarget && categoriesLoading)
      && baselineReady
      && baselineTotal === 0
    )
  );
  const virtualCatalog = useMemo(
    () => serverCatalogEmpty
      ? selectVirtualCatalog({
          keyword: params.query,
          categoryNames: selectedCategoryNames,
          categorySelected: Boolean(categoryTarget),
          materials: params.materials,
          crafts: params.crafts,
          weights: params.weights,
          sizes: params.sizes,
          sort: params.sort === "newest" || params.sort === "sku" ? params.sort : "recommended",
          page: params.page,
          pageSize: PAGE_SIZE,
        })
      : null,
    [
      categoryTarget,
      params.crafts,
      params.materials,
      params.page,
      params.query,
      params.sort,
      params.sizes,
      params.weights,
      selectedCategoryNames,
      serverCatalogEmpty,
    ],
  );
  const displayProducts = virtualCatalog ? (priceOnly ? [] : virtualCatalog.pageItems) : mergedProducts;
  const displayTotal = virtualCatalog ? (priceOnly ? 0 : virtualCatalog.total) : total;
  const visibleResultTotal = virtualCatalog || catalogResponseCurrent ? displayTotal : 0;
  const draftPreviewLoading = draftQuery !== null && (
    draftResults.loading || draftResults.refreshing || draftResults.dataQueryKey !== draftResults.queryKey
  );
  const draftPreviewReady = draftQuery !== null && !draftPreviewLoading
    && !draftResults.error && !draftResults.refreshError;
  const draftVirtualCatalog = filterDraft && serverCatalogEmpty ? selectVirtualCatalog({
    keyword: params.query,
    categoryNames: selectedCategoryNames,
    categorySelected: Boolean(categoryTarget),
    ...filterDraft,
    sort: params.sort === "newest" || params.sort === "sku" ? params.sort : "recommended",
    page: 1,
    pageSize: 1,
  }) : null;
  const draftPreviewTotal = draftVirtualCatalog && filterDraft
    ? (params.sort === "price_asc" || params.sort === "price_desc"
      || filterDraft.minPrice.trim() || filterDraft.maxPrice.trim() ? 0 : draftVirtualCatalog.total)
    : draftPreviewReady ? draftResults.total : null;
  const suggestionsReady = virtualCatalog
    ? true
    : firstPageSuggestionQuery
      ? firstPageSuggestions.dataQueryKey === firstPageSuggestions.queryKey
        && !firstPageSuggestions.loading && !firstPageSuggestions.refreshing && !firstPageSuggestions.error
      : catalogResponseCurrent && !apiLoading && !productsRefreshing && !apiError;
  const suggestionProducts = virtualCatalog?.matches
    ?? (firstPageSuggestionQuery ? firstPageSuggestions.products : mergedProducts);
  const showingVirtualWorks = virtualCatalog !== null && displayTotal > 0;
  const showCatalogLoading = !virtualCatalog
    && (apiLoading || productsRefreshing)
    && (!catalogResponseCurrent || mergedProducts.length === 0);
  const showCatalogTools = apiLoading
    || categories.length > 0
    || displayTotal > 0
    || hasActiveFilters;

  useEffect(() => {
    const pageCount = Math.ceil(displayTotal / PAGE_SIZE);
    if (!virtualCatalog && (apiLoading || productsRefreshing || apiError || !catalogResponseCurrent)) return;
    if (params.page <= pageCount || pageCount <= 0) return;
    update("page", String(pageCount), { replace: true });
  }, [apiError, apiLoading, catalogResponseCurrent, displayTotal, params.page, productsRefreshing, update, virtualCatalog]);

  const currentCatalogUrl = `${location.pathname}${location.search}${location.hash}`;
  const catalogUrlForDetail = editorPreview ? null : currentCatalogUrl;

  useEffect(() => {
    if (
      editorPreview
      || apiLoading
      || apiError
      || !catalogResponseCurrent
      || (tp > 0 && params.page > tp)
    ) {
      return;
    }
    if (!pendingCatalogReturnRef.current) {
      pendingCatalogReturnRef.current = readCatalogReturnContext(currentCatalogUrl);
    }
    const returnContext = pendingCatalogReturnRef.current;
    if (!returnContext) return;

    let focusFrame = 0;
    let mutationFocusFrame = 0;
    let settleTimer = 0;
    let mutationObserver: MutationObserver | null = null;
    const cancelOnInteraction = () => {
      completeCatalogReturnContext(returnContext);
      pendingCatalogReturnRef.current = null;
      if (settleTimer) window.clearTimeout(settleTimer);
      mutationObserver?.disconnect();
    };
    window.addEventListener("pointerdown", cancelOnInteraction, { capture: true, once: true });
    window.addEventListener("keydown", cancelOnInteraction, { capture: true, once: true });

    const resolveFocusTarget = () => {
      const results = resultsRef.current;
      if (!results) return null;
      const productCell = results.querySelector<HTMLElement>(
        `[data-catalog-product-id="${returnContext.productId}"]`,
      );
      // 旧索引只描述离开目录时的快照位置。原作品下架、权限变化或结果重排后，
      // 同一索引可能已属于另一作品，不能把返回焦点错误交给无关项目。
      if (!productCell) return results;
      const preferredSelector = returnContext.focusTarget === "card"
        ? "[data-catalog-product-focus]"
        : "[data-catalog-detail-entry]";
      const fallbackSelector = returnContext.focusTarget === "card"
        ? "[data-catalog-detail-entry]"
        : "[data-catalog-product-focus]";
      return productCell?.querySelector<HTMLElement>(preferredSelector)
        || productCell?.querySelector<HTMLElement>(fallbackSelector)
        || results;
    };
    const scrollFrame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: returnContext.scrollY, behavior: "auto" });
      focusFrame = window.requestAnimationFrame(() => {
        const focusTarget = resolveFocusTarget();
        if (!focusTarget || pendingCatalogReturnRef.current !== returnContext) return;
        focusTarget.focus({ preventScroll: true });
        const results = resultsRef.current;
        if (results && typeof window.MutationObserver === "function") {
          mutationObserver = new window.MutationObserver(() => {
            if (pendingCatalogReturnRef.current !== returnContext) return;
            if (mutationFocusFrame) window.cancelAnimationFrame(mutationFocusFrame);
            mutationFocusFrame = window.requestAnimationFrame(() => {
              resolveFocusTarget()?.focus({ preventScroll: true });
            });
          });
          mutationObserver.observe(results, { childList: true, subtree: true });
        }
        // 身份/能力读取可能在目录首帧后再替换结果节点。只有经历短暂稳定期且
        // 用户没有开始新的键盘或指针操作，才消费本次恢复上下文。
        settleTimer = window.setTimeout(() => {
          if (pendingCatalogReturnRef.current !== returnContext) return;
          const settledTarget = resolveFocusTarget();
          settledTarget?.focus({ preventScroll: true });
          completeCatalogReturnContext(returnContext);
          pendingCatalogReturnRef.current = null;
          mutationObserver?.disconnect();
        }, 1_500);
      });
    });
    return () => {
      window.cancelAnimationFrame(scrollFrame);
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
      if (mutationFocusFrame) window.cancelAnimationFrame(mutationFocusFrame);
      if (settleTimer) window.clearTimeout(settleTimer);
      mutationObserver?.disconnect();
      window.removeEventListener("pointerdown", cancelOnInteraction, { capture: true });
      window.removeEventListener("keydown", cancelOnInteraction, { capture: true });
    };
  }, [
    apiError,
    apiLoading,
    catalogResponseCurrent,
    currentCatalogUrl,
    editorPreview,
    params.page,
    tp,
  ]);

  useEffect(() => {
    const pendingPage = pendingPageFocusRef.current;
    if (
      editorPreview
      || pendingPage === null
      || pendingPage !== params.page
      || apiLoading
      || apiError
      || !catalogResponseCurrent
    ) {
      return;
    }
    pendingPageFocusRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      const results = resultsRef.current;
      if (!results) return;
      results.scrollIntoView({ block: "start", behavior: "auto" });
      results.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    apiError,
    apiLoading,
    catalogResponseCurrent,
    editorPreview,
    params.page,
  ]);

  const goToPage = useCallback((page: number) => {
    if (page === params.page) return;
    pendingPageFocusRef.current = page;
    update("page", String(page));
  }, [params.page, update]);
  const [stickyVisible, setStickyVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editorPreview) {
      setStickyVisible(false);
      return;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const Observer = window.IntersectionObserver;
    if (typeof Observer !== "function") {
      setStickyVisible(false);
      return;
    }
    const header = sentinel.ownerDocument.querySelector<HTMLElement>(".site-header");
    let observer: IntersectionObserver | null = null;
    let observedOffset = -1;
    let generation = 0;
    const connect = () => {
      const concealed = header?.classList.contains("is-concealed") ?? false;
      const offset = concealed ? 0 : Math.round(header?.getBoundingClientRect().height || 0);
      if (observer && offset === observedOffset) return;
      observedOffset = offset;
      const current = ++generation;
      observer?.disconnect();
      try {
        observer = new Observer(
          ([entry]) => {
            if (current !== generation) return;
            // 正常工具栏完全越过页头后才显示吸顶条；回滚碰到边界时即收起。
            // 相交判定负责退出边界，位置判定排除工具栏还在视口下方的情况。
            setStickyVisible(
              !entry.isIntersecting && entry.boundingClientRect.bottom <= offset + 1,
            );
          },
          { rootMargin: `-${offset}px 0px 0px 0px`, threshold: 0 },
        );
        observer.observe(sentinel);
      } catch {
        // 吸顶筛选仅是渐进增强；观察器被禁用或脚本构造异常时，
        // 保留正常目录、搜索与选款业务，不升级为整页错误。
        setStickyVisible(false);
      }
    };
    connect();
    let classObserver: MutationObserver | null = null;
    if (header) {
      classObserver = new MutationObserver(connect);
      classObserver.observe(header, { attributes: true, attributeFilter: ["class"] });
    }
    const ownerWindow = sentinel.ownerDocument.defaultView;
    ownerWindow?.addEventListener("resize", connect);
    return () => {
      observer?.disconnect();
      classObserver?.disconnect();
      ownerWindow?.removeEventListener("resize", connect);
    };
  }, [editorPreview]);

  const clearAll = () => {
    updateMany({
      category: "",
      query: "",
      material: [],
      craft: [],
      weight: [],
      size: [],
      minPrice: "",
      maxPrice: "",
      sort: "recommended",
    });
  };
  const changeFilters = (changes: Partial<CatalogFilterValues>) => {
    const next = { ...filterValues, ...changes };
    updateMany({
      material: next.materials,
      craft: next.crafts,
      weight: next.weights,
      size: next.sizes,
      minPrice: next.minPrice.trim(),
      maxPrice: next.maxPrice.trim(),
    });
    trackFilter("catalog", Object.keys(changes).join(","));
  };
  const openFilter = (trigger: HTMLButtonElement) => {
    filterTriggerRef.current = trigger;
    setFilterDraft(filterValues);
    setFilterOpen(true);
  };
  const clearPriceScope = () => {
    updateMany({
      minPrice: "",
      maxPrice: "",
      sort: params.sort === "price_asc" || params.sort === "price_desc" ? "recommended" : params.sort,
    });
  };
  const clearAttributeFilters = () => {
    updateMany({
      material: [], craft: [], weight: [], size: [], minPrice: "", maxPrice: "",
      sort: params.sort === "price_asc" || params.sort === "price_desc" ? "recommended" : params.sort,
    });
  };

  useEffect(() => {
    if (editorPreview) return;
    trackPageView();
  }, [editorPreview]);

  useEffect(() => {
    if (editorPreview || ((apiLoading || apiError) && !virtualCatalog)) return;
    trackViewItemList(displayProducts.length, "catalog");
  }, [apiError, apiLoading, displayProducts.length, editorPreview, virtualCatalog]);

  return (
    <div
      className={`catalog-page${editorPreview ? " is-editor-preview" : ""}`}
      style={{
        background: T.bg,
        minHeight: editorPreview ? "auto" : "100vh",
        paddingBottom: 160,
        overflowX: "clip",
      }}
    >
      <style>{`
        .catalog-page.is-editor-preview {
          pointer-events: none;
        }
        .catalog-page :is(button, a, input, select):focus-visible {
          outline: 2px solid #5F6568 !important;
          outline-offset: 3px;
        }
        .catalog-page__discovery {
          background: #FFFFFF;
          border-bottom: 1px solid #DDE1E2;
        }
        .catalog-page__discovery-main {
          max-width: 1440px;
          margin-inline: auto;
          padding: calc(32px + var(--site-header-height, 88px)) clamp(32px, 5.55vw, 80px) 20px;
          display: grid;
          gap: 28px;
        }
        .catalog-page__discovery.is-compact .catalog-page__discovery-main {
          max-width: 720px;
          padding-block: 32px 20px;
        }
        .catalog-search {
          min-width: 0;
        }
        .catalog-search__field {
          position: relative;
        }
        .catalog-search__form {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          border-bottom: 1px solid #B8BEC1;
          transition: border-color 180ms ease;
        }
        .catalog-search__form:focus-within {
          border-color: #181A1B;
          outline: 2px solid #5F6568;
          outline-offset: 3px;
        }
        .catalog-search__input {
          min-width: 0;
          height: 56px;
          padding: 0 16px 0 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: #181A1B;
          font: inherit;
          font-size: 16px;
        }
        .catalog-search__input::placeholder {
          color: #6E7477;
          opacity: 1;
        }
        .catalog-page .catalog-search__input:focus-visible {
          outline: none !important;
        }
        .catalog-search__actions {
          display: flex;
          align-items: center;
        }
        .catalog-search__clear {
          min-width: 44px;
          min-height: 44px;
          border: 0;
          background: none;
          color: #5F6568;
          cursor: pointer;
          font-size: 18px;
        }
        .catalog-search__submit {
          min-width: 112px;
          min-height: 56px;
          padding-inline: 20px;
          border: 0;
          background: #181A1B;
          color: #F7F8F8;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          font-size: 12px;
          letter-spacing: .08em;
          transition: background-color 180ms ease;
        }
        .catalog-search__submit:hover {
          background: #101213;
        }
        .catalog-search__suggestions {
          position: absolute;
          inset-inline: 0;
          top: calc(100% + 1px);
          z-index: 60;
          background: #FFFFFF;
          border: 1px solid #DDE1E2;
          box-shadow: 0 18px 42px rgba(24, 26, 27, .09);
        }
        .catalog-category-nav {
          border-top: 1px solid #DDE1E2;
        }
        .catalog-category-nav__inner {
          max-width: 1440px;
          min-height: 64px;
          margin-inline: auto;
          padding-inline: clamp(32px, 5.55vw, 80px);
          display: flex;
          align-items: center;
        }
        .catalog-category-nav__items {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: clamp(32px, 4vw, 64px);
          overflow-x: auto;
          scrollbar-width: none;
        }
        .catalog-category-nav__items::-webkit-scrollbar {
          display: none;
        }
        .catalog-category-nav__item {
          position: relative;
          min-width: 44px;
          min-height: 44px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          background: none;
          color: #5F6568;
          cursor: pointer;
          white-space: nowrap;
          font-family: "Cormorant Garamond", "Noto Serif SC", serif;
          font-size: 18px;
          font-weight: 400;
          transition: color 180ms ease;
        }
        .catalog-category-nav__item:hover,
        .catalog-category-nav__item[aria-pressed="true"] {
          color: #181A1B;
        }
        .catalog-category-nav__item > span {
          position: absolute;
          right: 0;
          bottom: 4px;
          left: 0;
          height: 1px;
          background: #181A1B;
        }
        .catalog-page.is-editor-preview .catalog-canvas-categories,
        .catalog-page.is-editor-preview .catalog-canvas-categories * {
          pointer-events: auto !important;
        }
        .catalog-canvas-category-input {
          width: auto;
          min-width: 4em;
          max-width: 16em;
          field-sizing: content;
          border: 0;
          border-bottom: 1px solid #181A1B;
          border-radius: 0;
          background: transparent;
          color: #181A1B;
          text-align: center;
        }
        .catalog-canvas-subitem {
          position: relative;
          min-height: 44px;
          padding-inline: 12px;
          border: 0;
          background: none;
          color: #5F6568;
          cursor: pointer;
          font-size: 13px;
          white-space: nowrap;
        }
        .catalog-canvas-subitem[aria-pressed="true"],
        .catalog-canvas-subitem.catalog-canvas-category-input {
          color: #181A1B;
        }
        .catalog-canvas-subitem[aria-pressed="true"]::after {
          content: "";
          position: absolute;
          right: 12px;
          bottom: 12px;
          left: 12px;
          height: 1px;
          background: #181A1B;
        }
        .catalog-canvas-categories__hint {
          max-width: 1440px;
          margin: 0 auto;
          padding: 0 clamp(32px, 5.55vw, 80px) 16px;
          color: #6E7477;
          font-size: 12px;
          line-height: 1.6;
        }
        .catalog-secondary-nav__inner,
        .catalog-toolbar__inner {
          padding-inline: clamp(32px, 5.55vw, 80px);
        }
        .catalog-toolbar__inner {
          gap: 20px;
        }
        .catalog-recovery-target {
          box-sizing: border-box;
          display: inline-flex !important;
          min-width: 44px;
          min-height: 44px;
          align-items: center;
          justify-content: center;
        }
        @media (max-width: 900px) {
          .catalog-page__discovery-main {
            gap: 24px;
            padding-inline: 32px;
          }
          .catalog-category-nav__inner,
          .catalog-secondary-nav__inner,
          .catalog-toolbar__inner {
            padding-inline: 32px;
          }
        }
        @media (max-width: 720px) {
          .catalog-page__discovery-main {
            padding: calc(28px + var(--site-header-height, 64px)) 20px 16px;
            gap: 24px;
          }
          .catalog-page__discovery.is-compact .catalog-page__discovery-main {
            padding: 28px 20px 16px;
          }
          .catalog-search__input {
            font-size: 14px;
          }
          .catalog-search__submit {
            min-width: 92px;
            padding-inline: 16px;
            gap: 14px;
          }
          .catalog-category-nav__inner {
            min-height: auto;
            padding: 22px 20px 16px;
            display: block;
          }
          .catalog-secondary-nav__inner,
          .catalog-toolbar__inner {
            padding-inline: 20px;
          }
          .catalog-category-nav__items {
            gap: 28px;
          }
          .catalog-category-nav__item {
            font-size: 16px;
          }
          .catalog-toolbar__inner {
            gap: 8px;
          }
        }
      `}</style>
      <section
        className={`catalog-page__discovery${hasLeadingDecoration ? " is-compact" : ""}`}
        aria-label={hasLeadingDecoration || decorationState.ownsPrimaryHeading ? "选款中心检索" : undefined}
        aria-labelledby={hasLeadingDecoration || decorationState.ownsPrimaryHeading ? undefined : "catalog-page-title"}
      >
        <div className="catalog-page__discovery-main">
          {decorationState.ownsPrimaryHeading ? null : <h1 id="catalog-page-title" className="sr-only">选款中心</h1>}
          <CatalogSearch
            query={params.query}
            resolvedQuery={suggestionsReady ? params.query : null}
            products={suggestionProducts}
            categories={displayCategories}
            materials={materialOptions}
            onSearch={(value) => update("query", value, { replace: true })}
          />
        </div>
        {showCatalogTools ? (
          editorPreview ? (
            <CatalogCanvasPrimary
              categories={displayCategories}
              savedNames={savedCategoryNames}
              active={params.category}
              note={categoryEditNote}
              onChange={(id) => update("category", id)}
              onDraft={setCategoryDraft}
              onRename={renameCanvasCategory}
            />
          ) : (
            <PrimaryNav
              active={params.category}
              onChange={(c) => update("category", c)}
              categories={categories}
            />
          )
        ) : null}
      </section>
      {showCatalogTools ? (
        <>
          {params.category ? (
            editorPreview ? (
              <CatalogCanvasSecondary
                categories={displayCategories}
                savedNames={savedCategoryNames}
                parentId={params.category}
                active={params.subcategory}
                onChange={(id) => update("subcategory", id)}
                onDraft={setCategoryDraft}
                onRename={renameCanvasCategory}
              />
            ) : (
            <SecondaryNav
              parentId={params.category}
              active={params.subcategory}
              onChange={(s) => update("subcategory", s)}
              categories={categories}
            />
            )
          ) : null}
          <div ref={sentinelRef}>
            <Toolbar
              values={filterValues}
              total={visibleResultTotal}
              materialOptions={materialOptions}
              craftOptions={craftOptions}
              sizeOptions={sizeOptions}
              sort={params.sort}
              selCount={selCount}
              loading={apiLoading || productsRefreshing || !catalogResponseCurrent}
              onChange={changeFilters}
              onSort={(s) => update("sort", s)}
              onOpenFilter={openFilter}
            />
          </div>
          {stickyVisible ? (
            <StickyBar
              category={params.category}
              total={visibleResultTotal}
              sort={params.sort}
              selCount={selCount}
              filterCount={
                params.materials.length
                + params.crafts.length
                + params.weights.length
                + params.sizes.length
                + Number(Boolean(params.minPrice || params.maxPrice))
              }
              onSort={(s) => update("sort", s)}
              onOpenFilter={openFilter}
              categories={categories}
            />
          ) : null}
          <ActiveFilters
            values={filterValues}
            priceOnly={priceOnly}
            onChange={changeFilters}
            onClearAll={clearAttributeFilters}
            onClearPriceScope={clearPriceScope}
          />
        </>
      ) : null}
      {categoriesError && !categoryTarget ? (
        <div
          role="status"
          style={{
            margin: "20px auto 0",
            maxWidth: 1560,
            paddingInline: "clamp(24px,5vw,80px)",
            color: T.sec,
            fontSize: 13,
          }}
        >
          分类筛选暂时无法加载，作品列表仍可浏览。
          <button
            type="button"
            className="catalog-recovery-target"
            onClick={reloadCategories}
            style={{
              marginLeft: 12,
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              border: 0,
              borderBottom: `1px solid ${T.txt}`,
              background: "none",
              color: T.txt,
              cursor: "pointer",
            }}
          >
            重试分类
          </button>
        </div>
      ) : null}
      {!editorPreview
      && commerceFlagsError
      && mergedProducts.some((product) =>
        product.salesMode === "DIRECT_PURCHASE"
        && product.isAvailableForPurchase === true
      ) ? (
        <div
          role="alert"
          aria-live="polite"
          style={{
            margin: "20px auto 0",
            maxWidth: 1560,
            paddingInline: "clamp(24px,5vw,80px)",
            color: T.sec,
            fontSize: 13,
          }}
        >
          购买状态暂时无法确认，作品仍可继续浏览。
          <button
            type="button"
            className="catalog-recovery-target"
            onClick={() => void reloadCommerceFlags()}
            style={{
              marginLeft: 12,
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              border: 0,
              borderBottom: `1px solid ${T.txt}`,
              background: "none",
              color: T.txt,
              cursor: "pointer",
            }}
          >
            重新检查购买状态
          </button>
        </div>
      ) : null}
      <section
        ref={resultsRef}
        tabIndex={-1}
        aria-label="作品结果"
        aria-busy={apiLoading || productsRefreshing}
        style={{ scrollMarginTop: "calc(var(--site-header-offset, var(--site-header-height, 88px)) + 16px)" }}
      >
      {productsRefreshError && !virtualCatalog ? (
        <div role="alert" className="catalog-refresh-notice">
          <span>作品更新失败，当前显示上次成功加载的结果。最新资料尚未确认。</span>
          <button
            type="button"
            className="catalog-recovery-target"
            disabled={productsRefreshing}
            onClick={reloadProducts}
          >
            {productsRefreshing ? "正在更新" : "重试更新"}
          </button>
        </div>
      ) : null}
      {showCatalogLoading ? (
        <div className="catalog-state">
          <RouteLoading scope="region" surface="public" label="正在加载珠宝作品…" />
        </div>
      ) : apiError && !productsRefreshError && !virtualCatalog && (!catalogResponseCurrent || mergedProducts.length === 0) ? (
        <div
          className="catalog-state"
          style={{
            textAlign: "center",
            paddingBlock: 80,
            maxWidth: 1560,
            marginInline: "auto",
            paddingInline: "clamp(48px,5vw,80px)",
          }}
        >
          <p style={{ fontSize: 15, color: T.txt, marginBottom: 12 }}>
            作品目录暂时无法加载
          </p>
          <p style={{ fontSize: 13, color: T.sec, marginBottom: 20 }}>
            您可以重新加载，或先提交需求由顾问协助选款。
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="catalog-recovery-target"
              onClick={() => {
                reloadProducts();
                if (categoriesError) reloadCategories();
              }}
              style={{
                background: "none",
                border: `1px solid ${T.line}`,
                padding: "8px 20px",
                cursor: "pointer",
                fontSize: 12,
                color: T.txt,
              }}
            >
              重新加载
            </button>
            <Link
              to="/contact?type=product"
              className="catalog-recovery-target"
              style={{
                border: `1px solid ${T.txt}`,
                padding: "8px 20px",
                fontSize: 12,
                color: T.txt,
                textDecoration: "none",
              }}
            >
              提交选款需求
            </Link>
          </div>
        </div>
      ) : displayTotal === 0 ? (
        <div
          className="catalog-state"
          style={{
            textAlign: "center",
            paddingBlock: 80,
            maxWidth: 1560,
            marginInline: "auto",
            paddingInline: "clamp(48px,5vw,80px)",
          }}
        >
          {hasActiveFilters ? (
            <>
              <p style={{ fontSize: 15, color: T.txt, marginBottom: 8 }}>
                {activeKeyword && !hasStructuralFilters
                  ? `没有找到「${activeKeyword}」`
                  : "没有符合当前条件的作品"}
              </p>
              {activeKeyword && !hasStructuralFilters ? (
                <p
                  style={{
                    fontSize: 13,
                    color: T.sec,
                    marginBottom: 20,
                    lineHeight: 1.7,
                  }}
                >
                  修改上方关键词，作品会随输入更新。
                </p>
              ) : null}
              <button
                type="button"
                className="catalog-recovery-target"
                onClick={clearAll}
                style={{
                  background: "none",
                  border: `1px solid ${T.line}`,
                  padding: "8px 20px",
                  cursor: "pointer",
                  fontSize: 12,
                  color: T.txt,
                }}
              >
                查看全部作品
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 15, color: T.txt, marginBottom: 8 }}>
                当前没有可公开的作品
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: T.sec,
                  marginBottom: 20,
                  maxWidth: 360,
                  marginInline: "auto",
                }}
              >
                当前暂无已上架作品。您仍可提交选款需求，具体建议与安排以实际沟通为准。
              </p>
              <Link
                to="/contact?type=product"
                className="catalog-recovery-target"
                style={{
                  display: "inline-flex",
                  minHeight: 44,
                  alignItems: "center",
                  border: `1px solid ${T.txt}`,
                  padding: "0 24px",
                  fontSize: 12,
                  color: T.txt,
                  textDecoration: "none",
                  letterSpacing: "0.08em",
                }}
              >
                提交选款需求
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
        {showingVirtualWorks ? (
          <p
            className="catalog-state"
            style={{
              maxWidth: 720,
              margin: "28px auto 0",
              paddingInline: "clamp(24px,5vw,80px)",
              color: T.sec,
              fontSize: 13,
              lineHeight: 1.7,
              textAlign: "center",
            }}
          >
            {VIRTUAL_PUBLIC_WORK_NOTICE}
          </p>
        ) : null}
        <ProductGrid
          products={displayProducts}
          catalogUrl={catalogUrlForDetail}
          startIndex={(params.page - 1) * PAGE_SIZE}
        />
        {displayProducts.length > 0 ? (
          <CatalogPathways
            categories={getPrimaryCats(displayCategories)}
            activeCategoryId={params.category}
            products={displayProducts}
            hasMore={!showingVirtualWorks && params.page < Math.ceil(displayTotal / PAGE_SIZE)}
            onOpenCategory={(id) => update("category", id)}
            onMore={() => goToPage(params.page + 1)}
          />
        ) : null}
        </>
      )}
      </section>
      <Pagination
        total={visibleResultTotal}
        page={params.page}
        onPage={goToPage}
      />
      {filterOpen && filterDraft && (
        <FilterDrawer
          values={filterDraft}
          materialOptions={materialOptions}
          craftOptions={craftOptions}
          sizeOptions={sizeOptions}
          onChange={setFilterDraft}
          onApply={() => {
            changeFilters(filterDraft);
            closeFilter();
          }}
          onClose={closeFilter}
          total={draftPreviewTotal}
          loading={draftPreviewLoading}
          returnFocusRef={filterTriggerRef}
        />
      )}
      {!editorPreview ? (
        <SelectionTray
          products={selectionProducts}
          lookupState={selectionLookupState}
          onRetry={reloadSelected}
        />
      ) : null}
    </div>
  );
}
