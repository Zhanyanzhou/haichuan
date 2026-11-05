import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { SecureImage } from "@/components/common/SecureImage";
import { expandCategoryIds, type RealCategory } from "@/hooks/useProductData";
import { getPrimaryCats, getRealSubs } from "@/pages/public/Catalog/catalogCategories";
import { categoryApi, productApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { withPublicMediaWidth } from "@/utils/publicMediaWidth";
import { publicProductPath } from "@/utils/publicProductPath";
import RouteLoading from "@/components/common/RouteLoading";
import { clampProductTitle } from "@/utils/productTitleLength";

type SiteSearchDialogProps = {
  open: boolean;
  onClose: () => void;
};

type SearchWork = {
  id: number;
  code: string;
  name: string;
  categoryId: number;
  price: number;
  salesMode?: string;
  image?: string;
};

type SeriesLink = {
  id: number;
  name: string;
  parentId: number;
};

const WORK_LIMIT = 4;
type LoadStatus = "loading" | "ready" | "error";

function isCanceled(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? String(error.code) : "";
  const name = "name" in error ? String(error.name) : "";
  return code === "ERR_CANCELED" || name === "CanceledError" || name === "AbortError";
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mediaOf(value: unknown): string {
  if (typeof value !== "object" || value === null) return "";
  const record = value as Record<string, unknown>;
  return textOf(record.mediaUrl) || textOf(record.url);
}

function parseWork(value: unknown): SearchWork | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const id = Number(record.id);
  const categoryId = Number(record.categoryId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(categoryId) || categoryId <= 0) return null;
  const images = Array.isArray(record.images) ? record.images : [];
  const image = mediaOf(record.listingImage) || mediaOf(record.primaryImage) || mediaOf(images[0]);
  const price = Number(record.price);
  const code = textOf(record.code);
  return {
    id,
    code,
    name: textOf(record.name) || code || "未命名作品",
    categoryId,
    price: Number.isFinite(price) ? price : 0,
    salesMode: textOf(record.salesMode) || undefined,
    image: image ? withPublicMediaWidth(image, 480) : undefined,
  };
}

function readWorks(payload: unknown): SearchWork[] {
  const record = typeof payload === "object" && payload !== null
    ? payload as Record<string, unknown>
    : null;
  const rawList = Array.isArray(payload)
    ? payload
    : record && Array.isArray(record.list)
      ? record.list
      : null;
  if (!rawList) throw new Error("Invalid public search response");
  const works: SearchWork[] = [];
  for (const item of rawList) {
    const work = parseWork(item);
    if (work) works.push(work);
    if (works.length >= WORK_LIMIT) break;
  }
  if (rawList.length && !works.length) throw new Error("Invalid public search works");
  return works;
}

function useSearchWorks(keyword: string, categoryIds: string, enabled: boolean, revision: number) {
  const key = JSON.stringify([keyword, categoryIds, revision]);
  const [result, setResult] = useState<{
    key: string;
    status: Exclude<LoadStatus, "loading">;
    works: SearchWork[];
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    productApi.getPublicList({
      page: 1,
      pageSize: WORK_LIMIT,
      ...(keyword ? { keyword } : {}),
      ...(categoryIds ? { categoryIds } : {}),
    }, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      const works = readWorks(unwrapResponse<unknown>(response));
      setResult({ key, status: "ready", works });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || isCanceled(error)) return;
      setResult({ key, status: "error", works: [] });
    });
    return () => controller.abort();
  }, [keyword, categoryIds, enabled, key]);

  return enabled && result?.key === key
    ? result
    : { status: "loading" as const, works: [] };
}

function workPrice(work: SearchWork): string {
  if (work.salesMode !== "DIRECT_PURCHASE" || !(work.price > 0)) return "";
  return `¥${work.price.toLocaleString("zh-CN")} 起`;
}

function primaryCategoryId(tree: RealCategory[], categoryId: number): number | null {
  const includesCategory = (node: RealCategory): boolean =>
    node.id === categoryId || Boolean(node.children?.some(includesCategory));
  return tree.find(includesCategory)?.id ?? null;
}

function categoryIdsMatching(tree: RealCategory[], needle: string): string {
  if (!needle) return "";
  const ids = new Set<number>();
  const visit = (nodes: RealCategory[]) => {
    for (const node of nodes) {
      if (node.name.toLocaleLowerCase().includes(needle)) {
        for (const id of expandCategoryIds(tree, node.id).split(",")) {
          const numeric = Number(id);
          if (Number.isInteger(numeric) && numeric > 0) ids.add(numeric);
        }
      }
      if (node.children?.length) visit(node.children);
    }
  };
  visit(tree);
  return [...ids].join(",");
}

function seriesOf(tree: RealCategory[], parentId: number | null): SeriesLink[] {
  if (parentId) {
    return getRealSubs(tree, parentId).map((series) => ({
      id: series.id,
      name: series.name,
      parentId,
    }));
  }
  const links: SeriesLink[] = [];
  for (const category of getPrimaryCats(tree)) {
    for (const series of getRealSubs(tree, category.id)) {
      links.push({ id: series.id, name: series.name, parentId: category.id });
    }
  }
  return links;
}

function SearchGlyph() {
  return (
    <svg className="site-search__glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.25" />
      <path d="M15.2 15.2 L20 20" />
    </svg>
  );
}

/** 页头下方的全宽搜索面板：类别、系列与作品同时可见，提交后才进入选款中心。 */
export default function SiteSearchDialog({ open, onClose }: SiteSearchDialogProps) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [composing, setComposing] = useState(false);
  const [categories, setCategories] = useState<RealCategory[]>([]);
  const [categoryStatus, setCategoryStatus] = useState<LoadStatus>("loading");
  const [categoryRevision, setCategoryRevision] = useState(0);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [workRevision, setWorkRevision] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    setPortalHost(panelRef.current?.ownerDocument.body ?? null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const ownerDocument = panel?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    if (!panel || !ownerDocument || !ownerWindow) return;
    const focusTimer = ownerWindow.setTimeout(() => inputRef.current?.focus(), 0);
    const previousOverflow = ownerDocument.body.style.overflow;
    ownerDocument.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && ownerDocument.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && ownerDocument.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    ownerWindow.addEventListener("keydown", onKeyDown);
    return () => {
      ownerWindow.clearTimeout(focusTimer);
      ownerWindow.removeEventListener("keydown", onKeyDown);
      ownerDocument.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    setKeyword("");
    setDebouncedKeyword("");
    setComposing(false);
    setActiveCategoryId(null);
  }, [open]);

  useEffect(() => {
    if (!open || composing) return;
    const next = keyword.trim();
    const timer = window.setTimeout(() => {
      setDebouncedKeyword((current) => (current === next ? current : next));
    }, next ? 280 : 0);
    return () => window.clearTimeout(timer);
  }, [composing, keyword, open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    setCategoryStatus("loading");
    categoryApi
      .getTree(controller.signal)
      .then((response) => {
        if (!active) return;
        const data = unwrapResponse<unknown>(response);
        if (!Array.isArray(data)) throw new Error("Invalid public category tree");
        setCategories(data as RealCategory[]);
        setCategoryStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active || isCanceled(error)) return;
        setCategoryStatus("error");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [categoryRevision, open]);

  const value = keyword.trim();
  const needle = value.toLocaleLowerCase();
  const queryCurrent = open && !composing && value === debouncedKeyword;
  const scopedIds = !needle && activeCategoryId
    ? expandCategoryIds(categories, activeCategoryId)
    : "";
  const primary = useSearchWorks(debouncedKeyword, scopedIds, queryCurrent, workRevision);
  const keywordMiss = Boolean(needle) && primary.status === "ready" && primary.works.length === 0;
  const matchedIds = keywordMiss && categoryStatus === "ready"
    ? categoryIdsMatching(categories, needle)
    : "";
  const fallback = useSearchWorks("", matchedIds, queryCurrent && Boolean(matchedIds), workRevision);
  const { works, status: workStatus } = keywordMiss && (matchedIds || categoryStatus === "loading")
    ? fallback
    : primary;

  if (!open) return null;

  const suggestedCategoryId = activeCategoryId ?? (
    !needle && works[0] ? primaryCategoryId(categories, works[0].categoryId) : null
  );
  const primaries = getPrimaryCats(categories);
  const categoryLinks = primaries.length > 0 ? primaries : categories;
  const visibleCategories = needle
    ? categoryLinks.filter((category) => category.name.toLocaleLowerCase().includes(needle))
    : categoryLinks;
  const visibleSeries = needle
    ? seriesOf(categories, null).filter((series) => series.name.toLocaleLowerCase().includes(needle))
    : suggestedCategoryId
      ? seriesOf(categories, suggestedCategoryId)
      : [];
  const seriesPending = categoryStatus === "loading" ||
    (!needle && !suggestedCategoryId && workStatus === "loading");

  const submit = () => {
    if (!value || composing) return;
    onClose();
    navigate(`/catalog?query=${encodeURIComponent(value)}`);
  };

  return (
    <>
      {portalHost
        ? createPortal(
            <div className="site-search__scrim" onClick={onClose} />,
            portalHost,
          )
        : null}
      <div
        ref={panelRef}
        id="site-search-dialog"
        className="site-search__panel"
        role="dialog"
        aria-modal="true"
        aria-label="搜索作品"
      >
        <form
          className="site-search__field"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <SearchGlyph />
          <label className="sr-only" htmlFor="site-search-input">关键词或货号</label>
          <input
            ref={inputRef}
            id="site-search-input"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            placeholder="搜索作品、系列、货号"
            autoComplete="off"
            enterKeyHint="search"
          />
          <button type="submit" className="site-search__submit" disabled={!keyword.trim()}>
            查看结果
          </button>
          <button type="button" className="site-search__close" aria-label="关闭" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </form>

        <div className="site-search__body">
          <nav className="site-search__column" aria-label="类别">
            <h2 className="site-search__heading">类别</h2>
            {categoryStatus === "error" ? (
              <div>
                <p className="site-search__note" role="status">品类暂时无法读取</p>
                <button type="button" className="site-search__submit" onClick={() => {
                  setCategoryStatus("loading");
                  setCategoryRevision((value) => value + 1);
                }}>重试读取品类</button>
              </div>
            ) : visibleCategories.length === 0 ? (
              categoryStatus === "loading" ? (
                <RouteLoading scope="inline" surface="public" label="正在读取品类" />
              ) : (
                <p className="site-search__note">没有相符的类别</p>
              )
            ) : (
              <div className="site-search__list">
                {visibleCategories.map((category) => (
                  <Link
                    key={category.id}
                    to={`/catalog?category=${category.id}`}
                    className={
                      suggestedCategoryId === category.id
                        ? "site-search__link is-active"
                        : "site-search__link"
                    }
                    onMouseEnter={() => setActiveCategoryId(category.id)}
                    onFocus={() => setActiveCategoryId(category.id)}
                    onClick={onClose}
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            )}
          </nav>

          <nav className="site-search__column" aria-label="系列">
            <h2 className="site-search__heading">系列</h2>
            {categoryStatus === "error" ? (
              <p className="site-search__note">系列暂时无法读取</p>
            ) : seriesPending ? (
              <RouteLoading scope="inline" surface="public" label="正在读取系列" />
            ) : visibleSeries.length === 0 ? (
              <p className="site-search__note">
                {needle ? "没有相符的系列" : "这一类别暂无系列"}
              </p>
            ) : (
              <div className="site-search__list">
                {visibleSeries.map((series) => (
                  <Link
                    key={series.id}
                    to={`/catalog?category=${series.parentId}&subcategory=${series.id}`}
                    className="site-search__link"
                    onClick={onClose}
                  >
                    {series.name}
                  </Link>
                ))}
              </div>
            )}
          </nav>

          <section className="site-search__works" aria-label="作品" aria-busy={workStatus === "loading"}>
            <h2 className="site-search__heading">作品</h2>
            {workStatus === "error" ? (
              <div>
                <p className="site-search__note" role="status">作品暂时无法读取</p>
                <button type="button" className="site-search__submit" onClick={() => {
                  setWorkRevision((value) => value + 1);
                }}>重试查找作品</button>
              </div>
            ) : works.length === 0 ? (
              workStatus === "loading" ? (
                <RouteLoading scope="inline" surface="public" label="正在查找作品" />
              ) : (
                <p className="site-search__note">没有相符的作品</p>
              )
            ) : (
              <div className="site-search__products">
                {works.map((work) => {
                  const price = workPrice(work);
                  return (
                    <Link
                      key={work.id}
                      to={publicProductPath(work)}
                      className="site-search__product"
                      onClick={onClose}
                    >
                      <span className="site-search__product-media">
                        {work.image ? (
                          <SecureImage src={work.image} alt="" />
                        ) : null}
                      </span>
                      <span className="site-search__product-name" title={work.name}>{clampProductTitle(work.name)}</span>
                      {price ? <span className="site-search__product-price">{price}</span> : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
