import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { App as AntdApp } from "antd";
import { useSelectionStore } from "@/store/selectionStore";
import type { CatalogProduct } from "@/data/catalogData";
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
import {
  ActiveFilters,
  FilterDrawer,
  PrimaryNav,
  SecondaryNav,
  Toolbar,
} from "./CatalogFilters";
import { ProductGrid, QuickView } from "./CatalogProductSurface";
import SelectionTray, { type SelectionLookupState } from "./SelectionTray";
import { catNameById } from "./catalogCategories";
import {
  catalogSort,
  serializeWeightRanges,
  useURLParams,
} from "./catalogQuery";
import { catalogTokens as T } from "./catalogTokens";

const DESKTOP_HEADER_H = 108;
const PAGE_SIZE = 32;
const SKU_RE = /^[A-Z]{2,3}-[A-Z]{2,3}-\d{3,4}$/i;

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
    <div
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
      <PBtn disabled={page === 1} onClick={() => onPage(page - 1)}>
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
      <PBtn disabled={page === tp} onClick={() => onPage(page + 1)}>
        ›
      </PBtn>
    </div>
  );
}

function PBtn({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
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
  onSort,
  categories,
}: {
  category: string;
  total: number;
  sort: string;
  selCount: number;
  onSort: (s: string) => void;
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
        <span style={{ fontSize: 11, color: T.sec }}>{total} 款</span>
        <div style={{ flex: 1 }} />
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value)}
          style={{
            background: "transparent",
            border: 0,
            outline: "none",
            fontSize: 12,
            color: T.sec,
            cursor: "pointer",
            WebkitAppearance: "none",
            appearance: "none",
          }}
        >
          <option value="recommended">推荐</option>
          <option value="newest">最新</option>
          <option value="sku">货号</option>
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
  const { flags: commerceFlags, loading: commerceFlagsLoading } =
    useCommerceCapabilities();
  const commerceAllowed =
    !commerceFlagsLoading &&
    commerceFlags?.commerceEnabled === true &&
    commerceFlags.cartEnabled === true;
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
      description: "按品类、材质与货号选款，加入心仪作品并提交选款咨询。",
    });
    return () => clearPageMeta();
  }, [clearPageMeta, editorPreview, setPageMeta]);

  const { params, update } = useURLParams(!editorPreview);
  const [filterOpen, setFilterOpen] = useState(false);
  const [quickView, setQuickView] = useState<CatalogProduct | null>(null);
  const filterTriggerRef = useRef<HTMLElement | null>(null);
  const quickViewTriggerRef = useRef<HTMLElement | null>(null);
  const closeFilter = useCallback(() => setFilterOpen(false), []);
  const closeQuickView = useCallback(() => setQuickView(null), []);

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
  const removeInvalidSelections = useSelectionStore((s) => s.removeMany);
  const { materialOptions, craftOptions } = useAttributeDictionary();

  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
  } = useProductCategories();
  const categoryTarget = params.subcategory || params.category;
  const categoryIds = useMemo(
    () =>
      categoryTarget
        ? expandCategoryIds(categories, Number(categoryTarget)) || categoryTarget
        : "",
    [categories, categoryTarget],
  );
  const materialTypes = useMemo(
    () =>
      params.materials
        .map(getMaterialCode)
        .filter((code): code is string => Boolean(code))
        .join(","),
    [params.materials],
  );
  const catalogQuery = useMemo<ProductQuery | null>(() => {
    if (categoryTarget && categoriesLoading) return null;
    const keyword = params.query.trim();
    const exactCode = keyword && SKU_RE.test(keyword) ? keyword : undefined;
    return {
      page: params.page,
      pageSize: PAGE_SIZE,
      sortBy: catalogSort(params.sort),
      includeFacets: "true",
      exactCode,
      keyword: exactCode ? undefined : keyword || undefined,
      categoryIds: exactCode ? undefined : categoryIds || undefined,
      materialTypes: exactCode ? undefined : materialTypes || undefined,
      craftTechniques:
        !exactCode && params.crafts.length > 0
          ? params.crafts.join(",")
          : undefined,
      sizes:
        !exactCode && params.sizes.length > 0
          ? params.sizes.join(",")
          : undefined,
      weightRanges: exactCode
        ? undefined
        : serializeWeightRanges(params.weights),
    };
  }, [
    categoriesLoading,
    categoryIds,
    categoryTarget,
    materialTypes,
    params,
  ]);

  /* ═══ API 产品数据（服务端筛选 + URL 分页） ═══ */
  const {
    products: mergedProducts,
    total,
    facets,
    loading: productsLoading,
    error: productsError,
    revision: catalogRevision,
  } = useProductData(catalogQuery, {
    loadCategories: false,
  });
  const apiLoading = productsLoading || (Boolean(categoryTarget) && categoriesLoading);
  const apiError = productsError || categoriesError;
  const tp = Math.ceil(total / PAGE_SIZE);
  const sizeOptions = facets.sizes;

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
    refreshKey: catalogRevision,
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
    for (const product of [...selectedProducts, ...mergedProducts]) {
      byId.set(product.id, product);
    }
    return Array.from(byId.values());
  }, [mergedProducts, selectedProducts]);
  const selCount = selectionLookupState === "ready"
    ? selectionProducts.filter((product) => selectedIds.has(product.id)).length
    : 0;

  useEffect(() => {
    if (!apiLoading && params.page > tp && tp > 0) update("page", String(tp));
  }, [apiLoading, tp, params.page, update]);
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
    let observer: IntersectionObserver;
    try {
      observer = new Observer(
        ([entry]) => setStickyVisible(!entry.isIntersecting),
        { rootMargin: `-${DESKTOP_HEADER_H}px 0px 0px 0px`, threshold: 0 },
      );
    } catch {
      // 吸顶筛选仅是渐进增强；观察器被禁用或脚本构造异常时，
      // 保留正常目录、搜索与选款业务，不升级为整页错误。
      setStickyVisible(false);
      return;
    }
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [editorPreview]);

  const clearAll = () => {
    update("category", "");
    update("query", "");
    update("material", []);
    update("craft", []);
    update("weight", []);
    update("size", []);
  };
  const hasActiveFilters = Boolean(
    params.category ||
      params.subcategory ||
      params.query.trim() ||
      params.materials.length ||
      params.crafts.length ||
      params.weights.length ||
      params.sizes.length,
  );
  const showCatalogTools =
    apiLoading || total > 0 || hasActiveFilters;
  const toggleArray = (key: string, arr: string[], val: string) => {
    const newArr = arr.includes(val)
      ? arr.filter((x) => x !== val)
      : [...arr, val];
    update(key, newArr);
    trackFilter(key, val);
  };

  useEffect(() => {
    if (editorPreview) return;
    trackPageView();
  }, [editorPreview]);

  useEffect(() => {
    if (editorPreview || apiLoading || apiError) return;
    trackViewItemList(mergedProducts.length, "catalog");
  }, [apiError, apiLoading, editorPreview, mergedProducts]);

  return (
    <div
      className={`catalog-page${editorPreview ? " is-editor-preview" : ""}`}
      style={{
        background: T.bg,
        minHeight: editorPreview ? "auto" : "100vh",
        paddingBottom: 160,
        overflowX: "hidden",
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
          padding: clamp(64px, 6vw, 88px) clamp(32px, 5.55vw, 80px) clamp(56px, 5vw, 72px);
          display: grid;
          grid-template-columns: minmax(300px, .8fr) minmax(440px, 1fr);
          align-items: end;
          gap: clamp(56px, 9vw, 136px);
        }
        .catalog-page__discovery.is-compact .catalog-page__discovery-main {
          grid-template-columns: minmax(0, 720px);
          justify-content: center;
          padding-block: 48px;
        }
        .catalog-page__intro-eyebrow {
          margin: 0 0 20px;
          color: #5F6568;
          font-size: 11px;
          line-height: 1;
          letter-spacing: .2em;
        }
        .catalog-page__intro h1 {
          margin: 0;
          color: #181A1B;
          font-family: "Cormorant Garamond", "Noto Serif SC", serif;
          font-size: clamp(48px, 4.7vw, 68px);
          font-weight: 400;
          line-height: 1.04;
          letter-spacing: -.02em;
        }
        .catalog-page__intro-copy {
          max-width: 430px;
          margin: 24px 0 0;
          color: #5F6568;
          font-size: 14px;
          line-height: 1.9;
        }
        .catalog-search {
          min-width: 0;
          padding: 32px 36px 28px;
          background: #F4F5F5;
        }
        .catalog-search__eyebrow {
          margin: 0 0 10px;
          color: #6E7477;
          font-size: 10px;
          line-height: 1;
          letter-spacing: .18em;
        }
        .catalog-search__title {
          margin: 0 0 24px;
          color: #181A1B;
          font-family: "Cormorant Garamond", "Noto Serif SC", serif;
          font-size: 24px;
          font-weight: 400;
          line-height: 1.3;
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
        .catalog-search__hint {
          margin: 12px 0 0;
          color: #6E7477;
          font-size: 11px;
          line-height: 1.6;
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
          min-height: 84px;
          margin-inline: auto;
          padding-inline: clamp(32px, 5.55vw, 80px);
          display: grid;
          grid-template-columns: minmax(140px, 180px) minmax(0, 1fr);
          align-items: center;
          gap: 32px;
        }
        .catalog-category-nav__label {
          color: #6E7477;
          font-size: 11px;
          letter-spacing: .08em;
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
          min-height: 44px;
          padding: 0;
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
        .catalog-toolbar__inner {
          gap: 20px;
        }
        @media (max-width: 900px) {
          .catalog-page__discovery-main {
            grid-template-columns: minmax(240px, .72fr) minmax(360px, 1fr);
            gap: 40px;
            padding-inline: 32px;
          }
          .catalog-category-nav__inner {
            padding-inline: 32px;
          }
        }
        @media (max-width: 720px) {
          .catalog-page__discovery-main,
          .catalog-page__discovery.is-compact .catalog-page__discovery-main {
            grid-template-columns: minmax(0, 1fr);
            padding: 44px 20px 40px;
            gap: 40px;
          }
          .catalog-page__intro h1 {
            font-size: 40px;
            line-height: 1.1;
          }
          .catalog-page__intro-copy {
            margin-top: 18px;
            font-size: 13px;
          }
          .catalog-search {
            padding: 24px 20px 20px;
          }
          .catalog-search__title {
            margin-bottom: 18px;
            font-size: 20px;
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
          .catalog-category-nav__label {
            display: block;
            margin-bottom: 8px;
          }
          .catalog-category-nav__items {
            gap: 36px;
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
        aria-label={hasLeadingDecoration ? "选款中心检索" : undefined}
        aria-labelledby={hasLeadingDecoration ? undefined : "catalog-page-title"}
      >
        <div className="catalog-page__discovery-main">
          {hasLeadingDecoration ? (
            <h1 className="sr-only">选款中心</h1>
          ) : (
            <header className="catalog-page__intro">
            <p className="catalog-page__intro-eyebrow">SELECTION CENTER</p>
            <h1 id="catalog-page-title">选款中心</h1>
            <p className="catalog-page__intro-copy">
              按关键词、货号与当前公开属性查找作品，并将意向款式加入选款清单。
            </p>
            </header>
          )}
          <CatalogSearch
            query={params.query}
            products={mergedProducts}
            categories={categories}
            materials={materialOptions}
            onSearch={(value) => update("query", value)}
          />
        </div>
        {showCatalogTools ? (
          <PrimaryNav
            active={params.category}
            onChange={(c) => update("category", c)}
            categories={categories}
          />
        ) : null}
      </section>
      {showCatalogTools ? (
        <>
          {params.category ? (
            <SecondaryNav
              parentId={params.category}
              active={params.subcategory}
              onChange={(s) => update("subcategory", s)}
              categories={categories}
            />
          ) : null}
          <div ref={sentinelRef}>
            <Toolbar
              category={params.category}
              total={total}
              materials={params.materials}
              materialOptions={materialOptions}
              sort={params.sort}
              selCount={selCount}
              onToggleMaterial={(m) =>
                toggleArray("material", params.materials, m)
              }
              onSort={(s) => update("sort", s)}
              onOpenFilter={(trigger) => {
                filterTriggerRef.current = trigger;
                setFilterOpen(true);
              }}
              categories={categories}
            />
          </div>
          {stickyVisible ? (
            <StickyBar
              category={params.category}
              total={total}
              sort={params.sort}
              selCount={selCount}
              onSort={(s) => update("sort", s)}
              categories={categories}
            />
          ) : null}
          <ActiveFilters
            materials={params.materials}
            crafts={params.crafts}
            weights={params.weights}
            sizes={params.sizes}
            onClearMat={(m) =>
              update(
                "material",
                params.materials.filter((x) => x !== m),
              )
            }
            onClearCraft={(c) =>
              update(
                "craft",
                params.crafts.filter((x) => x !== c),
              )
            }
            onClearWeight={(w) =>
              update(
                "weight",
                params.weights.filter((x) => x !== w),
              )
            }
            onClearSize={(s) =>
              update(
                "size",
                params.sizes.filter((x) => x !== s),
              )
            }
            onClearAll={clearAll}
          />
        </>
      ) : null}
      {apiLoading ? (
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
          <p style={{ fontSize: 14, color: T.light }}>正在加载珠宝作品…</p>
        </div>
      ) : apiError ? (
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
              onClick={() => window.location.reload()}
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
              to="/contact"
              style={{
                border: `1px solid ${T.txt}`,
                padding: "8px 20px",
                fontSize: 12,
                color: T.txt,
                textDecoration: "none",
              }}
            >
              预约咨询
            </Link>
          </div>
        </div>
      ) : mergedProducts.length === 0 ? (
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
                没有符合当前筛选的作品
              </p>
              <button
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
                清除筛选
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 15, color: T.txt, marginBottom: 8 }}>
                珠宝作品正在筹备中
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
                当前暂无已上架作品，欢迎预约咨询，顾问将为您推荐最新臻品。
              </p>
              <Link
                to="/contact"
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
                预约咨询
              </Link>
            </>
          )}
        </div>
      ) : (
        <ProductGrid
          products={mergedProducts}
          commerceAllowed={commerceAllowed}
          onQuickView={(product, trigger) => {
            quickViewTriggerRef.current = trigger;
            setQuickView(product);
          }}
        />
      )}
      <Pagination
        total={total}
        page={params.page}
        onPage={(p) => update("page", String(p))}
      />
      {quickView && (
        <QuickView
          product={quickView}
          onClose={closeQuickView}
          returnFocusRef={quickViewTriggerRef}
          commerceAllowed={commerceAllowed}
        />
      )}
      {filterOpen && (
        <FilterDrawer
          materials={params.materials}
          crafts={params.crafts}
          materialOptions={materialOptions}
          craftOptions={craftOptions}
          weights={params.weights}
          sizes={params.sizes}
          sizeOptions={sizeOptions}
          onMaterials={(m) => update("material", m)}
          onCrafts={(c) => update("craft", c)}
          onWeights={(w) => update("weight", w)}
          onSizes={(s) => update("size", s)}
          onClear={() => {
            update("material", []);
            update("craft", []);
            update("weight", []);
            update("size", []);
          }}
          onClose={closeFilter}
          total={total}
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
