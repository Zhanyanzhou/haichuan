import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { SecureImage } from "@/components/common/SecureImage";
import { expandCategoryIds, type RealCategory } from "@/hooks/useProductData";
import { getPrimaryCats, getRealSubs } from "@/pages/public/Catalog/catalogCategories";
import { categoryApi, productApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { publicProductPath } from "@/utils/publicProductPath";

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
    image: image || undefined,
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
      : [];
  const works: SearchWork[] = [];
  for (const item of rawList) {
    const work = parseWork(item);
    if (work) works.push(work);
    if (works.length >= WORK_LIMIT) break;
  }
  return works;
}

function workPrice(work: SearchWork): string {
  if (work.salesMode !== "DIRECT_PURCHASE" || !(work.price > 0)) return "";
  return `¥${work.price.toLocaleString("zh-CN")} 起`;
}

function primaryCategoryId(tree: RealCategory[], categoryId: number): number | null {
  const parentById = new Map<number, number | null>();
  const visit = (nodes: RealCategory[], parentId: number | null) => {
    for (const node of nodes) {
      parentById.set(node.id, node.parentId ?? parentId);
      if (node.children?.length) visit(node.children, node.id);
    }
  };
  visit(tree, null);
  if (!parentById.has(categoryId)) return null;
  let current = categoryId;
  let parent = parentById.get(current) ?? null;
  while (parent) {
    current = parent;
    parent = parentById.get(current) ?? null;
  }
  return current;
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
  const [categories, setCategories] = useState<RealCategory[]>([]);
  const [categoryStatus, setCategoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [works, setWorks] = useState<SearchWork[]>([]);
  const [workStatus, setWorkStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const categoriesRef = useRef(categories);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  categoriesRef.current = categories;

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
    setActiveCategoryId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const next = keyword.trim();
    const timer = window.setTimeout(() => {
      setDebouncedKeyword((current) => (current === next ? current : next));
    }, next ? 280 : 0);
    return () => window.clearTimeout(timer);
  }, [keyword, open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    if (categoriesRef.current.length === 0) setCategoryStatus("loading");
    categoryApi
      .getTree(controller.signal)
      .then((response) => {
        if (!active) return;
        const data = unwrapResponse<unknown>(response);
        setCategories(Array.isArray(data) ? data as RealCategory[] : []);
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!debouncedKeyword && categoryStatus !== "ready" && categoryStatus !== "error") return;
    const controller = new AbortController();
    let active = true;
    const load = async (params: { keyword?: string; categoryIds?: string }) => {
      const response = await productApi.getPublicList(
        { page: 1, pageSize: WORK_LIMIT, ...params },
        controller.signal,
      );
      return readWorks(unwrapResponse<unknown>(response));
    };
    setWorkStatus((current) => (current === "ready" ? current : "loading"));
    const run = async () => {
      const scopedIds = !debouncedKeyword && activeCategoryId
        ? expandCategoryIds(categories, activeCategoryId)
        : "";
      const matchedIds = debouncedKeyword
        ? categoryIdsMatching(categories, debouncedKeyword)
        : "";
      let next: SearchWork[] = [];
      if (debouncedKeyword) {
        next = await load({ keyword: debouncedKeyword });
        if (!next.length && matchedIds) next = await load({ categoryIds: matchedIds });
      } else if (scopedIds) {
        next = await load({ categoryIds: scopedIds });
      } else {
        next = await load({});
        const primary = next[0] ? primaryCategoryId(categories, next[0].categoryId) : null;
        const familyIds = primary ? expandCategoryIds(categories, primary) : "";
        if (familyIds) {
          const family = await load({ categoryIds: familyIds });
          if (family.length) next = family;
          if (!active) return;
          if (primary) setActiveCategoryId(primary);
        }
      }
      if (!active) return;
      setWorks(next);
      setWorkStatus("ready");
    };
    run().catch((error: unknown) => {
      if (!active || isCanceled(error)) return;
      setWorkStatus("error");
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [activeCategoryId, categories, categoryStatus, debouncedKeyword, open]);

  if (!open) return null;

  const needle = debouncedKeyword.toLocaleLowerCase();
  const primaries = getPrimaryCats(categories);
  const categoryLinks = primaries.length > 0 ? primaries : categories;
  const visibleCategories = needle
    ? categoryLinks.filter((category) => category.name.toLocaleLowerCase().includes(needle))
    : categoryLinks;
  const visibleSeries = needle
    ? seriesOf(categories, null).filter((series) => series.name.toLocaleLowerCase().includes(needle))
    : activeCategoryId
      ? seriesOf(categories, activeCategoryId)
      : [];
  const seriesPending = !needle
    && !activeCategoryId
    && categoryStatus !== "error"
    && workStatus !== "ready"
    && workStatus !== "error";

  const submit = () => {
    const value = keyword.trim();
    if (!value) return;
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
              <p className="site-search__note">品类暂时无法读取</p>
            ) : visibleCategories.length === 0 ? (
              <p className="site-search__note">
                {categoryStatus === "loading" ? "正在读取品类" : "没有相符的类别"}
              </p>
            ) : (
              <div className="site-search__list">
                {visibleCategories.map((category) => (
                  <Link
                    key={category.id}
                    to={`/catalog?category=${category.id}`}
                    className={
                      activeCategoryId === category.id
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
              <p className="site-search__note">正在读取系列</p>
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
              <p className="site-search__note">作品暂时无法读取</p>
            ) : works.length === 0 ? (
              <p className="site-search__note">
                {workStatus === "loading" ? "正在查找作品" : "没有相符的作品"}
              </p>
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
                      <span className="site-search__product-name">{work.name}</span>
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
