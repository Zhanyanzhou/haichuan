import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useId, type RefObject } from "react";
import { usePageMetaStore } from "@/store/pageMetaStore";
import { motion, AnimatePresence } from "framer-motion";
import { message } from "antd";
import { useSelectionStore } from "@/store/selectionStore";
import { WEIGHT_RANGES, type CatalogProduct } from "@/data/catalogData";
import {
  expandCategoryIds,
  useProductData,
  useProductCategories,
  type ProductQuery,
  type RealCategory,
} from "@/hooks/useProductData";
import { useAttributeDictionary } from "@/hooks/useAttributeDictionary";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { getListingImage } from "@/utils/productImage";
import { SecureImage } from "@/components/common/SecureImage";
import { getMaterialCode } from "@/utils/material";
import { selectionInquiryApi } from "@/services/api";
import {
  trackPageView,
  trackAddToSelection,
  trackRemoveFromSelection,
  trackSubmitSelection,
  trackFilter,
  trackSearch,
} from "@/hooks/useAnalytics";
import { usePageDecorationState } from "@/page-builder/runtime/PublishedPageDecoration";
import { salesModeCta, salesModeRoute } from "@/store/featureFlags";

/* ══════════════════════════════════════
   设计令牌
   ══════════════════════════════════════ */
const T = {
  bg: "#FFFFFF",
  bgWarm: "#F4F5F5",
  txt: "#181A1B",
  sec: "rgba(24,26,27,0.68)",
  light: "rgba(24,26,27,0.48)",
  line: "#DDE1E2",
  imgBg: "#F4F5F5",
};

const HEADER_H = 84;
const PAGE_SIZE = 32;
const SKU_RE = /^[A-Z]{2,3}-[A-Z]{2,3}-\d{3,4}$/i;

/** 从真实分类树查找名称 */
function catNameById(tree: RealCategory[], id: number): string {
  for (const c of tree) {
    if (c.id === id) return c.name;
    if (c.children?.length) {
      const found = catNameById(c.children, id);
      if (found) return found;
    }
  }
  return "";
}

/** 获取一级分类的二级子分类 */
function getRealSubs(tree: RealCategory[], parentId: number): RealCategory[] {
  for (const c of tree) {
    if (c.id === parentId) return c.children || [];
  }
  return [];
}

/** 从真实分类树获取一级分类列表 */
function getPrimaryCats(tree: RealCategory[]): RealCategory[] {
  return tree.filter((c) => c.level === 1).sort((a, b) => a.id - b.id);
}

/* ══════════════════════════════════════
   URL 状态管理
   ══════════════════════════════════════ */
interface URLParams {
  category: string;
  subcategory: string;
  query: string;
  materials: string[];
  crafts: string[];
  weights: string[];
  sizes: string[];
  sort: string;
  page: number;
}

function createURLParams(readLocation: boolean): URLParams {
  const u = readLocation ? new URL(window.location.href) : null;
  const rawPage = Number.parseInt(u?.searchParams.get("page") || "1", 10);
  return {
    category: u?.searchParams.get("category") || "",
    subcategory: u?.searchParams.get("subcategory") || "",
    query: u?.searchParams.get("query") || "",
    materials:
      u?.searchParams.get("material")?.split(",").filter(Boolean) || [],
    crafts: u?.searchParams.get("craft")?.split(",").filter(Boolean) || [],
    weights: u?.searchParams.get("weight")?.split(",").filter(Boolean) || [],
    sizes: u?.searchParams.get("size")?.split(",").filter(Boolean) || [],
    sort: u?.searchParams.get("sort") || "recommended",
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

function useURLParams(syncHistory = true) {
  const [p, setP] = useState<URLParams>(() => {
    return createURLParams(syncHistory);
  });

  const syncURL = useCallback((next: URLParams) => {
    if (!syncHistory) return;
    const u = new URL(window.location.href);
    const s = (k: string, v: string) =>
      v ? u.searchParams.set(k, v) : u.searchParams.delete(k);
    s("category", next.category);
    s("subcategory", next.subcategory);
    s("query", next.query);
    s("material", next.materials.join(","));
    s("craft", next.crafts.join(","));
    s("weight", next.weights.join(","));
    s("size", next.sizes.join(","));
    s("sort", next.sort !== "recommended" ? next.sort : "");
    s("page", next.page > 1 ? String(next.page) : "");
    window.history.replaceState(null, "", u.toString());
  }, [syncHistory]);

  const update = useCallback(
    (key: string, val: string | string[]) => {
      setP((prev) => {
        const next = { ...prev } as Record<string, unknown>;
        const stateKey =
          ({
            material: "materials",
            craft: "crafts",
            weight: "weights",
            size: "sizes",
          } as Record<string, string>)[key] || key;
        if (key === "category") {
          next.category = val;
          next.subcategory = "";
          next.page = 1;
        } else if (key === "page") {
          next.page = Number(val);
        } else if (Array.isArray(val)) {
          next[stateKey] = val;
          next.page = 1;
        } else {
          next[stateKey] = val;
          next.page = 1;
        }
        syncURL(next as unknown as URLParams);
        return next as unknown as URLParams;
      });
    },
    [syncURL],
  );

  return { params: p, update };
}

function serializeWeightRanges(ranges: string[]): string | undefined {
  const serialized = ranges
    .map((range) => range.match(/\d+(?:\.\d+)?/g)?.map(Number) || [])
    .filter((bounds) => bounds.length > 0)
    .map((bounds) => `${bounds[0]}:${bounds[1] ?? ""}`);
  return serialized.length > 0 ? serialized.join(",") : undefined;
}

function catalogSort(sort: string): NonNullable<ProductQuery["sortBy"]> {
  if (sort === "newest") return "updated_desc";
  if (sort === "sku") return "code_asc";
  return "sortOrder";
}

/* ══════════════════════════════════════
   组件：一级类目（真实分类）
   ══════════════════════════════════════ */
function PrimaryNav({
  active,
  onChange,
  categories,
}: {
  active: string;
  onChange: (id: string) => void;
  categories: RealCategory[];
}) {
  const primaryCats = getPrimaryCats(categories);
  if (!primaryCats.length) return null;
  return (
    <nav className="catalog-category-nav" aria-label="作品品类">
      <div className="catalog-category-nav__inner">
        <span className="catalog-category-nav__label">按品类浏览</span>
        <div className="catalog-category-nav__items">
          {primaryCats.map((c) => {
            const cid = String(c.id);
            const isA = active === cid;
            return (
              <button
                key={c.id}
                className="catalog-category-nav__item"
                aria-pressed={isA}
                onClick={() => onChange(isA ? "" : cid)}
              >
                {c.name}
                {isA ? <span aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/* ══════════════════════════════════════
   组件：二级类目（真实子分类）
   ══════════════════════════════════════ */
function SecondaryNav({
  parentId,
  active,
  onChange,
  categories,
}: {
  parentId: string;
  active: string;
  onChange: (id: string) => void;
  categories: RealCategory[];
}) {
  const subs = getRealSubs(categories, Number(parentId));
  if (!subs.length) return null;

  return (
    <div style={{ borderBottom: `1px solid ${T.line}` }}>
      <div
        style={{
          maxWidth: 1560,
          marginInline: "auto",
          paddingInline: "clamp(48px,5vw,80px)",
          display: "flex",
          alignItems: "center",
          minHeight: 52,
          gap: 4,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        <L2Btn active={!active} onClick={() => onChange("")}>
          全部
        </L2Btn>
        {subs.map((s) => (
          <L2Btn
            key={s.id}
            active={active === String(s.id)}
            onClick={() => onChange(String(s.id))}
          >
            {s.name}
          </L2Btn>
        ))}
      </div>
    </div>
  );
}

function L2Btn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        paddingInline: 12,
        height: 52,
        display: "inline-flex",
        alignItems: "center",
        background: "none",
        border: 0,
        cursor: "pointer",
        fontSize: 13,
        letterSpacing: "0.04em",
        color: active ? T.txt : T.sec,
        whiteSpace: "nowrap",
        position: "relative",
      }}
    >
      {children}
      {active && (
        <span
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            right: 12,
            height: 1,
            background: T.txt,
          }}
        />
      )}
    </button>
  );
}

/* ══════════════════════════════════════
   组件：工具栏（极简风格）
   ══════════════════════════════════════ */
function Toolbar({
  category,
  total,
  materials,
  materialOptions,
  sort,
  selCount,
  onToggleMaterial,
  onSort,
  onOpenFilter,
  categories,
}: {
  category: string;
  total: number;
  materials: string[];
  materialOptions: string[];
  sort: string;
  selCount: number;
  onToggleMaterial: (m: string) => void;
  onSort: (s: string) => void;
  onOpenFilter: (trigger: HTMLButtonElement) => void;
  categories: RealCategory[];
}) {
  const parentName = catNameById(categories, Number(category));
  const path = category ? parentName : "全部作品";
  const [openDD, setOpenDD] = useState<string | null>(null);

  return (
    <>
      <div style={{ borderBottom: `1px solid ${T.line}` }}>
        <div
          className="catalog-toolbar__inner"
          style={{
            maxWidth: 1560,
            marginInline: "auto",
            paddingInline: "clamp(16px,3vw,28px)",
            height: 52,
            display: "flex",
            alignItems: "center",
            fontSize: 12,
            color: T.sec,
          }}
        >
          <span style={{ color: T.txt, fontSize: 13, whiteSpace: "nowrap", flexShrink: 0 }}>{path}</span>
          <span style={{ color: T.light, whiteSpace: "nowrap", flexShrink: 0 }}>{total} 件作品</span>
          <div className="catalog-toolbar__spacer" style={{ flex: 1 }} />
          <div style={{ position: "relative" }}>
            <button
              onClick={() =>
                setOpenDD(openDD === "material" ? null : "material")
              }
              style={{
                background: "none",
                border: 0,
                cursor: "pointer",
                fontSize: 12,
                color: T.sec,
                padding: "0 8px",
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              材质{materials.length > 0 ? ` ${materials.length}` : ""}
            </button>
            {openDD === "material" && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 10 }}
                  onClick={() => setOpenDD(null)}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    zIndex: 20,
                    minWidth: 180,
                    background: T.bg,
                    border: `1px solid ${T.line}`,
                    padding: "14px 16px",
                  }}
                >
                  {materialOptions.map((o) => (
                    <label
                      key={o}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                        fontSize: 12,
                        color: T.txt,
                        paddingBlock: 3,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={materials.includes(o)}
                        onChange={() => onToggleMaterial(o)}
                        style={{ width: 13, height: 13, accentColor: T.txt }}
                      />
                      {o}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value)}
            style={{
              background: "none",
              border: 0,
              fontSize: 12,
              color: T.sec,
              cursor: "pointer",
              outline: "none",
              minHeight: 44,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <option value="recommended">推荐</option>
            <option value="newest">最新</option>
            <option value="sku">货号</option>
          </select>
          <button
            onClick={(event) => onOpenFilter(event.currentTarget)}
            style={{
              background: "none",
              border: 0,
              cursor: "pointer",
              fontSize: 12,
              color: T.sec,
              padding: "0 8px",
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            更多筛选
          </button>
          {selCount > 0 && (
            <span style={{ color: T.txt, whiteSpace: "nowrap", flexShrink: 0 }}>已选 {selCount}</span>
          )}
        </div>
      </div>
    </>
  );
}

function DD({
  target,
  label,
  count,
  open,
  setOpen,
  options,
  selected,
  onToggle,
}: {
  target: string;
  label: string;
  count: string;
  open: string | null;
  setOpen: (v: string | null) => void;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const isOpen = open === target;
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(isOpen ? null : target)}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          minHeight: 44,
          paddingInline: 10,
          background: "none",
          border: 0,
          cursor: "pointer",
          fontSize: 13,
          letterSpacing: "0.04em",
          color: T.sec,
          whiteSpace: "nowrap",
        }}
      >
        {label}⌄{count}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              zIndex: 20,
              minWidth: 200,
              background: T.bg,
              border: `1px solid ${T.line}`,
              padding: "16px 18px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
              {options.map((o) => (
                <label
                  key={o}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    fontSize: 12,
                    color: T.txt,
                    paddingBlock: 3,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(o)}
                    onChange={() => onToggle(o)}
                    style={{
                      width: 13,
                      height: 13,
                      accentColor: T.txt,
                      cursor: "pointer",
                    }}
                  />
                  {o}
                </label>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════
   组件：当前筛选标签
   ══════════════════════════════════════ */
function ActiveFilters({
  materials,
  crafts,
  weights,
  sizes,
  onClearMat,
  onClearCraft,
  onClearWeight,
  onClearSize,
  onClearAll,
}: {
  materials: string[];
  crafts: string[];
  weights: string[];
  sizes: string[];
  onClearMat: (m: string) => void;
  onClearCraft: (c: string) => void;
  onClearWeight: (w: string) => void;
  onClearSize: (s: string) => void;
  onClearAll: () => void;
}) {
  const all = [...materials, ...crafts, ...weights, ...sizes];
  if (!all.length) return null;
  return (
    <div style={{ borderBottom: `1px solid ${T.line}` }}>
      <div
        style={{
          maxWidth: 1560,
          marginInline: "auto",
          paddingInline: "clamp(48px,5vw,80px)",
          paddingBlock: 10,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
        }}
      >
        {materials.map((m) => (
          <Tag key={m} label={m} onRemove={() => onClearMat(m)} />
        ))}
        {crafts.map((c) => (
          <Tag key={c} label={c} onRemove={() => onClearCraft(c)} />
        ))}
        {weights.map((w) => (
          <Tag key={w} label={w} onRemove={() => onClearWeight(w)} />
        ))}
        {sizes.map((s) => (
          <Tag key={s} label={s} onRemove={() => onClearSize(s)} />
        ))}
        <button
          onClick={onClearAll}
          style={{
            background: "none",
            border: 0,
            cursor: "pointer",
            fontSize: 11,
            color: T.sec,
            textDecoration: "underline",
            padding: "0 2px",
            minHeight: 44,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          清除筛选
        </button>
      </div>
    </div>
  );
}

function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        paddingInline: 9,
        minHeight: 44,
        border: `1px solid ${T.line}`,
        fontSize: 11,
        color: T.txt,
      }}
    >
      {label}
      <button
        type="button"
        aria-label={`移除筛选 ${label}`}
        onClick={onRemove}
        style={{
          background: "none",
          border: 0,
          cursor: "pointer",
          color: T.sec,
          fontSize: 14,
          lineHeight: 1,
          minWidth: 44,
          minHeight: 44,
          padding: 0,
        }}
      >
        ×
      </button>
    </span>
  );
}

/* ══════════════════════════════════════
   组件：更多筛选抽屉
   ══════════════════════════════════════ */
function useCatalogDialog(
  onClose: () => void,
  returnFocusRef: RefObject<HTMLElement | null>,
) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const ownerDocument = dialog?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    if (!dialog || !ownerDocument || !ownerWindow) return;
    const returnFocusTarget = returnFocusRef.current;

    const previousOverflow = ownerDocument.body.style.overflow;
    ownerDocument.body.style.overflow = "hidden";
    const focusTimer = ownerWindow.setTimeout(
      () => initialFocusRef.current?.focus({ preventScroll: true }),
      0,
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
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
      ownerWindow.setTimeout(
        () => returnFocusTarget?.focus({ preventScroll: true }),
        0,
      );
    };
  }, [onClose, returnFocusRef]);

  return { dialogRef, initialFocusRef };
}

function FilterDrawer({
  materials,
  crafts,
  materialOptions,
  craftOptions,
  weights,
  sizes,
  sizeOptions,
  onMaterials,
  onCrafts,
  onWeights,
  onSizes,
  onClear,
  onClose,
  total,
  returnFocusRef,
}: {
  materials: string[];
  crafts: string[];
  materialOptions: string[];
  craftOptions: string[];
  weights: string[];
  sizes: string[];
  sizeOptions: string[];
  onMaterials: (m: string[]) => void;
  onCrafts: (c: string[]) => void;
  onWeights: (w: string[]) => void;
  onSizes: (s: string[]) => void;
  onClear: () => void;
  onClose: () => void;
  total: number;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const { dialogRef, initialFocusRef } = useCatalogDialog(onClose, returnFocusRef);
  const toggle = (arr: string[], v: string, setter: (a: string[]) => void) => {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 90,
          background: "rgba(0,0,0,0.12)",
        }}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(440px, 100%)",
          zIndex: 91,
          background: T.bg,
          overflowY: "auto",
          padding: "32px 28px",
          boxShadow: "-1px 0 0 " + T.line,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <h3
            id={titleId}
            style={{ fontSize: 16, fontWeight: 400, color: T.txt, margin: 0 }}
          >
            更多筛选
          </h3>
          <button
            ref={initialFocusRef}
            type="button"
            aria-label="关闭筛选"
            onClick={onClose}
            style={{
              background: "none",
              border: 0,
              cursor: "pointer",
              fontSize: 20,
              color: T.sec,
              lineHeight: 1,
              minWidth: 44,
              minHeight: 44,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1 }}>
          <FG
            title="材质"
            options={materialOptions}
            selected={materials}
            onToggle={(v) => toggle(materials, v, onMaterials)}
          />
          <FG
            title="工艺"
            options={craftOptions}
            selected={crafts}
            onToggle={(v) => toggle(crafts, v, onCrafts)}
          />
          <FG
            title="重量"
            options={WEIGHT_RANGES}
            selected={weights}
            onToggle={(v) => toggle(weights, v, onWeights)}
          />
          {sizeOptions.length > 0 && (
            <FG
              title="规格"
              options={sizeOptions}
              selected={sizes}
              onToggle={(v) => toggle(sizes, v, onSizes)}
            />
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            paddingTop: 20,
            borderTop: `1px solid ${T.line}`,
          }}
        >
          <button
            onClick={onClear}
            style={{
              flex: 1,
              minHeight: 44,
              border: `1px solid ${T.line}`,
              background: "transparent",
              cursor: "pointer",
              fontSize: 12,
              color: T.sec,
            }}
          >
            重置
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              minHeight: 44,
              border: 0,
              background: T.txt,
              cursor: "pointer",
              fontSize: 12,
              color: "#FFFFFF",
            }}
          >
            查看 {total} 款结果
          </button>
        </div>
      </div>
    </>
  );
}

function FG({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <p
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          color: T.light,
          marginBottom: 12,
        }}
      >
        {title}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
        {options.map((o) => (
          <label
            key={o}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              paddingInline: 4,
              gap: 6,
              cursor: "pointer",
              fontSize: 12,
              color: T.txt,
              paddingBlock: 2,
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(o)}
              onChange={() => onToggle(o)}
              style={{
                width: 13,
                height: 13,
                accentColor: T.txt,
                cursor: "pointer",
              }}
            />
            {o}
          </label>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   组件：产品卡片（梵克雅宝矩阵风格）
   ══════════════════════════════════════ */
function CatalogProductAction({
  product,
  selected,
  onToggle,
}: {
  product: CatalogProduct;
  selected: boolean;
  onToggle: () => void;
}) {
  const commonStyle: React.CSSProperties = {
    display: "inline-flex",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    padding: "0 16px",
    border: `1px solid ${T.line}`,
    background: "transparent",
    color: T.txt,
    cursor: "pointer",
    fontSize: 11,
    letterSpacing: "0.03em",
    textDecoration: "none",
  };

  if (product.salesMode === "SELECTION") {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        style={{
          ...commonStyle,
          borderColor: selected ? T.txt : T.line,
          background: selected ? T.txt : "transparent",
          color: selected ? "#FFFFFF" : T.sec,
        }}
      >
        {selected ? "✓ 已选" : "+ 加入选款"}
      </button>
    );
  }

  if (product.salesMode === "APPOINTMENT" || product.salesMode === "CUSTOM_INQUIRY") {
    return (
      <Link to={salesModeRoute(product.salesMode)} style={commonStyle}>
        {salesModeCta(product.salesMode)}
      </Link>
    );
  }

  return (
    <Link to={`/products/${product.id}`} style={commonStyle}>
      {product.salesMode === "DIRECT_PURCHASE" && product.isAvailableForPurchase === true
        ? "查看并购买"
        : "查看作品"}
    </Link>
  );
}

function ProductCard({
  product,
  onQuickView,
}: {
  product: CatalogProduct;
  onQuickView: (p: CatalogProduct, trigger: HTMLButtonElement) => void;
}) {
  const toggle = useSelectionStore((s) => s.toggle);
  const sel = useSelectionStore((s) => s.isSelected)(product.id);

  const handleToggle = () => {
    toggle(product.id);
    if (sel) trackRemoveFromSelection(product.id);
    else trackAddToSelection(product.id);
  };
  const [imgIdx, setImgIdx] = useState(0);

  // 所有可用图片
  const allImages: string[] =
    product.images && product.images.length > 0
      ? product.images.filter(Boolean)
      : [getListingImage(product as any)];
  const currentImg = allImages[imgIdx] || allImages[0] || "";

  // 鼠标左右半区切换图片
  const handleMouseMove = (e: React.MouseEvent) => {
    if (allImages.length < 2) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const half = rect.width / 2;
    if (x < half && allImages.length >= 2) {
      setImgIdx(1);
    } else if (x >= half && allImages.length >= 3) {
      setImgIdx(2);
    }
  };
  const handleMouseLeave = () => {
    setImgIdx(0);
  };

  const priceText = product.salesMode === "DIRECT_PURCHASE"
    ? product.price && product.price > 0
      ? `¥${product.price.toLocaleString()} 起`
      : "价格暂不可用"
    : salesModeCta(product.salesMode);

  const subInfo = [product.categoryName, product.material]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ background: T.bg }}>
      {/* 商品目录统一使用 4:5 产品图比例。 */}
      <div
        data-catalog-product-media
        style={{
          aspectRatio: "4/5",
          background: T.imgBg,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <button
          type="button"
          className="catalog-image-trigger"
          aria-label={`快速预览 ${product.name || product.sku}`}
          onClick={(event) => onQuickView(product, event.currentTarget)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            padding: 0,
            background: "none",
            cursor: "pointer",
          }}
        >
          <SecureImage
            src={currentImg}
            alt={product.name || product.sku}
            className="catalog-img"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transition: "transform 0.6s cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        </button>
        {/* 图片切换指示器 — 极简细线（全部商品默认显示） */}
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 4,
            zIndex: 1,
          }}
        >
          {allImages.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`查看第 ${i + 1} 张图片`}
              aria-pressed={i === imgIdx}
              onClick={() => {
                setImgIdx(i);
              }}
              style={{
                width: 44,
                height: 44,
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                background: "transparent",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: i === imgIdx ? 20 : 8,
                  height: 2,
                  background: i === imgIdx ? "rgba(24,26,27,0.55)" : "rgba(24,26,27,0.18)",
                  transition: "all 0.25s",
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* 信息区：名称 → 材质 → 价格 → 选款 */}
      <div style={{ padding: "14px 0 20px", textAlign: "center" }}>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: T.txt,
            margin: "0 0 5px",
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {product.name || product.sku}
        </h3>
        <p
          style={{
            fontSize: 11,
            color: T.light,
            margin: "0 0 8px",
            lineHeight: 1.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subInfo}
        </p>
        <p
          style={{
            fontSize: 12,
            fontWeight: 400,
            color: T.txt,
            margin: "0 0 10px",
            lineHeight: 1.4,
          }}
        >
          {priceText}
        </p>
        {product.salesMode === "DIRECT_PURCHASE" && product.isAvailableForPurchase === false ? (
          <p role="status" style={{ margin: "-4px 0 10px", color: T.sec, fontSize: 11 }}>
            已售罄
          </p>
        ) : null}
        <CatalogProductAction
          product={product}
          selected={sel}
          onToggle={handleToggle}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   组件：产品矩阵（横竖分割线网格）
   — 横线：cell border-bottom，同一行自然连续
   — 竖线：cell border-right，最后列不画
   — gap=0 确保边框相接无断点
   ══════════════════════════════════════ */
function ProductGrid({
  products,
  onQuickView,
}: {
  products: CatalogProduct[];
  onQuickView: (p: CatalogProduct, trigger: HTMLButtonElement) => void;
}) {
  return (
    <>
      <style>{`
        .catalog-matrix {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          column-gap: 0;
          row-gap: 1px;
          background: ${T.line};
          width: 100%;
          border-left: 1px solid ${T.line};
          border-right: 1px solid ${T.line};
        }
        @media (min-width: 1280px) {
          .catalog-matrix { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        .catalog-cell {
          background: ${T.bg};
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          border-right: 1px solid ${T.line};
          padding: clamp(16px, 3vw, 28px);
        }
        /* 2列：第2列无右边线 */
        .catalog-cell:nth-child(2n) { border-right: none; }
        @media (min-width: 1280px) {
          /* 3列：覆盖2列规则，改为第3列无右边线 */
          .catalog-cell:nth-child(2n) { border-right: 1px solid ${T.line}; }
          .catalog-cell:nth-child(3n) { border-right: none; }
        }
      `}</style>
      <div
        className="catalog-matrix"
        style={{ maxWidth: "1560px", margin: "0 auto" }}
      >
        {products.map((p) => (
          <div key={p.id} className="catalog-cell">
            <ProductCard product={p} onQuickView={onQuickView} />
          </div>
        ))}
      </div>
      {/* 底部全宽横线：独立 div，width:100% 确保铺满整行 */}
      <div
        aria-hidden="true"
        style={{
          width: "100%",
          maxWidth: "1560px",
          margin: "0 auto",
          height: "1px",
          background: T.line,
        }}
      />
    </>
  );
}

/* ══════════════════════════════════════
   组件：快速查看
   ══════════════════════════════════════ */
function QuickView({
  product,
  onClose,
  returnFocusRef,
}: {
  product: CatalogProduct | null;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const toggle = useSelectionStore((s) => s.toggle);
  const isSelected = useSelectionStore((s) => s.isSelected);
  const { dialogRef, initialFocusRef } = useCatalogDialog(onClose, returnFocusRef);
  if (!product) return null;
  const sel = isSelected(product.id);
  const handleToggle = () => {
    toggle(product.id);
    if (sel) trackRemoveFromSelection(product.id);
    else trackAddToSelection(product.id);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 95,
        background: "rgba(0,0,0,0.15)",
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-quick-view-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(720px, 100%)",
          zIndex: 96,
          background: T.bg,
          overflowY: "auto",
          padding: "40px 36px",
          boxShadow: "-1px 0 0 " + T.line,
        }}
      >
        <button
          ref={initialFocusRef}
          type="button"
          aria-label="关闭快速预览"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 20,
            right: 24,
            background: "none",
            border: 0,
            cursor: "pointer",
            fontSize: 22,
            color: T.sec,
            lineHeight: 1,
            minWidth: 44,
            minHeight: 44,
          }}
        >
          ✕
        </button>
        <div
          data-catalog-quick-media
          style={{
            aspectRatio: "4/5",
            background: T.imgBg,
            overflow: "hidden",
            marginBottom: 28,
          }}
        >
          <SecureImage
            src={getListingImage(product as any)}
            alt={product.sku}
            fallback="/images/products/placeholder.svg"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>
        <h2
          id="catalog-quick-view-title"
          style={{
            fontSize: 18,
            fontWeight: 400,
            color: T.txt,
            margin: "0 0 4px",
          }}
        >
          {product.sku}
        </h2>
        {product.name && (
          <p
            style={{
              fontSize: 16,
              color: T.txt,
              margin: "0 0 16px",
              lineHeight: 1.5,
            }}
          >
            {product.name}
          </p>
        )}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px 20px",
            marginBottom: 24,
          }}
        >
          <Info label="品类" value={product.categoryName || ""} />
          {product.material && <Info label="材质" value={product.material} />}
          {product.craft && <Info label="工艺" value={product.craft} />}
          {product.weight && <Info label="重量" value={product.weight} />}
          {product.size && <Info label="规格" value={product.size} />}
          {product.series && <Info label="系列" value={product.series} />}
        </div>
        {product.salesMode === "DIRECT_PURCHASE" && product.price && product.price > 0 ? (
          <p style={{ margin: "0 0 12px", color: T.txt, fontSize: 15 }}>
            ¥{product.price.toLocaleString()} 起
          </p>
        ) : null}
        {product.salesMode === "DIRECT_PURCHASE" && product.isAvailableForPurchase === false ? (
          <p role="status" style={{ margin: "0 0 12px", color: T.sec, fontSize: 13 }}>
            已售罄，作品仍可浏览
          </p>
        ) : null}
        <CatalogProductAction
          product={product}
          selected={sel}
          onToggle={handleToggle}
        />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: 10, letterSpacing: "0.08em", color: T.light }}>
        {label}
      </span>
      <p style={{ fontSize: 13, color: T.txt, margin: "2px 0 0" }}>{value}</p>
    </div>
  );
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
   组件：选款托盘 + 提交弹窗
   ══════════════════════════════════════ */
function SelectionTray({ products }: { products: CatalogProduct[] }) {
  const ids = useSelectionStore((s) => s.selectedIds);
  const clear = useSelectionStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    email: "",
    wechat: "",
    message: "",
    privacyConsent: false,
  });
  const account = (() => {
    try {
      return JSON.parse(localStorage.getItem("customer") || "null") as {
        name?: string;
        phone?: string;
      } | null;
    } catch {
      return null;
    }
  })();
  const isSignedIn = Boolean(
    localStorage.getItem("customerToken") && account?.phone,
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!ids.size) return null;

  const selected = products.filter((p) => ids.has(p.id));
  const thumbs = selected.slice(0, 4);

  const handleSubmit = async () => {
    if (!isSignedIn && !form.customerName.trim()) {
      message.warning("请填写您的称呼");
      return;
    }
    if (!isSignedIn && !/^1[3-9]\d{9}$/.test(form.phone.trim())) {
      message.warning("请填写正确的手机号码");
      return;
    }
    if (selected.length === 0) {
      message.warning("请至少选择一款作品");
      return;
    }
    if (!form.privacyConsent) {
      message.warning("请阅读并同意隐私说明");
      return;
    }
    setSubmitting(true);
    try {
      await selectionInquiryApi.submit({
        customerName: isSignedIn ? undefined : form.customerName.trim(),
        phone: isSignedIn ? undefined : form.phone.trim(),
        email: form.email.trim() || undefined,
        wechat: form.wechat.trim() || undefined,
        message: form.message.trim() || undefined,
        privacyConsent: form.privacyConsent,
        items: selected.map((p) => ({
          productId: p.id,
          productNameSnapshot: p.name || p.sku,
          productSkuSnapshot: p.sku,
          productImageSnapshot: p.images?.[0] || "",
        })),
      });
      trackSubmitSelection(selected.length);
      message.success(
        `已提交 ${selected.length} 款作品的选款咨询，我们的珠宝顾问将尽快与您联系`,
      );
      clear();
      setOpen(false);
      setForm({
        customerName: "",
        phone: "",
        email: "",
        wechat: "",
        message: "",
        privacyConsent: false,
      });
    } catch {
      message.error("提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 40,
    border: `1px solid ${T.line}`,
    padding: "0 12px",
    fontSize: 13,
    color: T.txt,
    background: T.bg,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <>
      {/* 底部托盘 */}
      <button
        type="button"
        aria-label={`查看已选 ${ids.size} 款并提交选款咨询`}
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 80,
          display: "flex",
          alignItems: "center",
          gap: 14,
          paddingInline: 20,
          height: 48,
          background: T.txt,
          maxWidth: "calc(100vw - 32px)",
          cursor: "pointer",
          borderRadius: 4,
          border: 0,
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <div
          className="tray-thumbs"
          style={{ display: "flex", gap: 6, alignItems: "center" }}
        >
          {thumbs.map((p) => (
            <div
              key={p.id}
              style={{
                width: 32,
                height: 32,
                background: T.imgBg,
                overflow: "hidden",
                flexShrink: 0,
                borderRadius: 2,
              }}
            >
              <SecureImage
                src={p.images?.[0] || getListingImage(p as any)}
                alt={p.sku}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          ))}
        </div>
        <span style={{ fontSize: 12, color: "#FFFFFF" }}>
          已选 {ids.size} 款
        </span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
          提交选款咨询 →
        </span>
      </button>

      {/* 提交弹窗 */}
      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99,
              background: "rgba(0,0,0,0.25)",
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="selection-inquiry-title"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              zIndex: 100,
              background: T.bg,
              width: "min(480px, 92vw)",
              padding: "32px 28px 28px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
            }}
          >
            <button
              type="button"
              autoFocus
              aria-label="关闭选款咨询"
              onClick={() => setOpen(false)}
              style={{
                position: "absolute",
                top: 16,
                right: 20,
                background: "none",
                border: 0,
                cursor: "pointer",
                fontSize: 18,
                color: T.sec,
                lineHeight: 1,
                minWidth: 36,
                minHeight: 36,
              }}
            >
              ✕
            </button>

            <h2
              id="selection-inquiry-title"
              style={{
                fontSize: 16,
                fontWeight: 400,
                color: T.txt,
                margin: "0 0 4px",
              }}
            >
              提交选款咨询
            </h2>
            <p style={{ fontSize: 12, color: T.sec, margin: "0 0 20px" }}>
              已选 {selected.length}{" "}
              款作品，请填写联系方式，珠宝顾问将为您提供一对一服务
            </p>

            {/* 已选作品缩略图 */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 20,
                flexWrap: "wrap",
              }}
            >
              {selected.slice(0, 6).map((p) => (
                <div
                  key={p.id}
                  style={{
                    width: 52,
                    height: 52,
                    background: T.imgBg,
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  <SecureImage
                    src={p.images?.[0] || getListingImage(p as any)}
                    alt={p.sku}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                </div>
              ))}
              {selected.length > 6 && (
                <span
                  style={{ fontSize: 11, color: T.sec, alignSelf: "center" }}
                >
                  +{selected.length - 6} 款
                </span>
              )}
            </div>

            {/* 表单 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {isSignedIn ? (
                <div
                  style={{
                    padding: "12px 14px",
                    background: T.bgWarm,
                    fontSize: 12,
                    color: T.sec,
                    lineHeight: 1.7,
                  }}
                >
                  将使用账户资料：{account?.name || "海川贵宾"} ·{" "}
                  {account?.phone}
                </div>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="sel-name"
                      style={{
                        fontSize: 12,
                        color: T.txt,
                        display: "block",
                        marginBottom: 4,
                      }}
                    >
                      称呼 <span style={{ color: "#8C3F3B" }}>*</span>
                    </label>
                    <input
                      id="sel-name"
                      value={form.customerName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, customerName: e.target.value }))
                      }
                      placeholder="您的称呼"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sel-phone"
                      style={{
                        fontSize: 12,
                        color: T.txt,
                        display: "block",
                        marginBottom: 4,
                      }}
                    >
                      手机号 <span style={{ color: "#8C3F3B" }}>*</span>
                    </label>
                    <input
                      id="sel-phone"
                      value={form.phone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      placeholder="方便我们联系您"
                      inputMode="numeric"
                      maxLength={11}
                      style={inputStyle}
                    />
                  </div>
                </>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label
                    htmlFor="sel-email"
                    style={{
                      fontSize: 12,
                      color: T.txt,
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    邮箱
                  </label>
                  <input
                    id="sel-email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    placeholder="选填"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label
                    htmlFor="sel-wechat"
                    style={{
                      fontSize: 12,
                      color: T.txt,
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    微信
                  </label>
                  <input
                    id="sel-wechat"
                    value={form.wechat}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, wechat: e.target.value }))
                    }
                    placeholder="选填"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="sel-message"
                  style={{
                    fontSize: 12,
                    color: T.txt,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  备注
                </label>
                <textarea
                  id="sel-message"
                  value={form.message}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, message: e.target.value }))
                  }
                  placeholder="预算范围、佩戴需求、特殊要求等"
                  rows={3}
                  style={{
                    ...inputStyle,
                    height: 72,
                    padding: "8px 12px",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                marginTop: 16,
                cursor: "pointer",
                fontSize: 12,
                color: T.sec,
                lineHeight: 1.6,
              }}
            >
              <input
                type="checkbox"
                checked={form.privacyConsent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, privacyConsent: e.target.checked }))
                }
                style={{ marginTop: 2, accentColor: T.txt }}
              />
              <span>
                我已阅读并同意
                <Link
                  to="/privacy"
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: T.txt, textDecoration: "underline" }}
                >
                  隐私说明
                </Link>
                ，提交的信息仅用于选款咨询与顾问联系。
              </span>
            </label>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                width: "100%",
                height: 44,
                marginTop: 20,
                background: submitting ? T.sec : T.txt,
                border: "none",
                cursor: submitting ? "not-allowed" : "pointer",
                fontSize: 14,
                color: "#FFFFFF",
                letterSpacing: "0.04em",
              }}
            >
              {submitting ? "提交中…" : `提交选款咨询（${selected.length} 款）`}
            </button>
          </div>
        </>
      )}
    </>
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
      style={{
        position: "fixed",
        top: HEADER_H,
        left: 0,
        right: 0,
        zIndex: 40,
        background: "rgba(255,255,255,0.95)",
        borderBottom: `1px solid ${T.line}`,
      }}
    >
      <div
        style={{
          maxWidth: 1560,
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

type CatalogSuggestion = { type: "品类" | "材质" | "作品" | "货号"; value: string };

function getCatalogSuggestions(
  query: string,
  products: CatalogProduct[],
  categories: RealCategory[],
  materials: string[],
): CatalogSuggestion[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const suggestions: CatalogSuggestion[] = [];
  const seen = new Set<string>();
  const add = (type: CatalogSuggestion["type"], value: string | undefined) => {
    const clean = value?.trim();
    if (!clean || seen.has(clean.toLocaleLowerCase())) return;
    seen.add(clean.toLocaleLowerCase());
    suggestions.push({ type, value: clean });
  };
  const visitCategories = (nodes: RealCategory[]) => {
    for (const category of nodes) {
      if (category.name.toLocaleLowerCase().includes(needle)) add("品类", category.name);
      if (category.children?.length) visitCategories(category.children);
    }
  };
  visitCategories(categories);
  for (const material of materials) {
    if (material.toLocaleLowerCase().includes(needle)) add("材质", material);
  }
  for (const product of products) {
    if (product.sku.toLocaleLowerCase().includes(needle)) add("货号", product.sku);
    if (product.name?.toLocaleLowerCase().includes(needle)) add("作品", product.name);
  }
  return suggestions.slice(0, 8);
}

function CatalogSearch({
  query,
  products,
  categories,
  materials,
  onSearch,
}: {
  query: string;
  products: CatalogProduct[];
  categories: RealCategory[];
  materials: string[];
  onSearch: (value: string) => void;
}) {
  const listboxId = useId();
  const [draft, setDraft] = useState(query);
  const [focused, setFocused] = useState(false);
  const { history, addToHistory, removeOne, clearAll } = useSearchHistory();
  const suggestions = useMemo(
    () => getCatalogSuggestions(draft, products, categories, materials),
    [categories, draft, materials, products],
  );

  useEffect(() => setDraft(query), [query]);

  const submit = (value: string) => {
    const clean = value.trim();
    setDraft(clean);
    onSearch(clean);
    if (clean) {
      addToHistory(clean);
      trackSearch(clean);
    }
    setFocused(false);
  };
  const showSuggestions = focused && draft.trim() && suggestions.length > 0;
  const showHistory = focused && !draft.trim() && history.length > 0;

  return (
    <div className="catalog-search" aria-label="选款搜索">
      <p className="catalog-search__eyebrow">SEARCH THE COLLECTION</p>
      <h2 className="catalog-search__title">查找作品</h2>
      <div className="catalog-search__field">
        <form
            className="catalog-search__form"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              submit(draft);
            }}
          >
            <label className="sr-only" htmlFor="catalog-search-input">
              关键词或货号
            </label>
            <input
              id="catalog-search-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => window.setTimeout(() => setFocused(false), 120)}
              placeholder="输入关键词或货号"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(showSuggestions || showHistory)}
              aria-controls={showSuggestions || showHistory ? listboxId : undefined}
              className="catalog-search__input"
            />
            <div className="catalog-search__actions">
              {draft ? (
                <button
                  type="button"
                  className="catalog-search__clear"
                  aria-label="清除关键词"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setDraft("");
                    onSearch("");
                  }}
                >
                  ×
                </button>
              ) : null}
              <button type="submit" className="catalog-search__submit">
                <span>搜索</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
        </form>
        <AnimatePresence>
            {showSuggestions || showHistory ? (
              <motion.div
                id={listboxId}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                role="listbox"
                className="catalog-search__suggestions"
              >
                {showSuggestions
                  ? suggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.type}-${suggestion.value}`}
                        type="button"
                        role="option"
                        aria-selected="false"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => submit(suggestion.value)}
                        style={{ display: "flex", width: "100%", gap: 14, padding: "12px 16px", border: 0, borderBottom: `1px solid ${T.line}`, background: "none", color: T.txt, cursor: "pointer", textAlign: "left" }}
                      >
                        <span style={{ minWidth: 32, color: T.light, fontSize: 10 }}>{suggestion.type}</span>
                        <span style={{ fontSize: 13 }}>{suggestion.value}</span>
                      </button>
                    ))
                  : (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", color: T.light, fontSize: 10 }}>
                          <span>最近搜索</span>
                          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={clearAll} style={{ border: 0, background: "none", color: T.sec, cursor: "pointer", fontSize: 11 }}>清除记录</button>
                        </div>
                        {history.slice(0, 5).map((item) => (
                          <div key={item} style={{ display: "grid", gridTemplateColumns: "1fr 44px", borderTop: `1px solid ${T.line}` }}>
                            <button type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => submit(item)} style={{ minHeight: 44, border: 0, background: "none", padding: "12px 16px", color: T.txt, cursor: "pointer", textAlign: "left", fontSize: 13 }}>{item}</button>
                            <button type="button" aria-label={`删除搜索记录 ${item}`} onMouseDown={(event) => event.preventDefault()} onClick={() => removeOne(item)} style={{ border: 0, background: "none", color: T.light, cursor: "pointer" }}>×</button>
                          </div>
                        ))}
                      </>
                    )}
              </motion.div>
            ) : null}
        </AnimatePresence>
      </div>
      <p className="catalog-search__hint">支持作品名称、品类、材质或货号</p>
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
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const selCount = selectedIds.size;
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
  const { products: selectedProducts } = useProductData(selectedQuery, {
    subscribe: false,
    loadCategories: false,
  });
  const selectionProducts = useMemo(() => {
    const byId = new Map<number, CatalogProduct>();
    for (const product of [...selectedProducts, ...mergedProducts]) {
      byId.set(product.id, product);
    }
    return Array.from(byId.values());
  }, [mergedProducts, selectedProducts]);

  useEffect(() => {
    if (!apiLoading && params.page > tp && tp > 0) update("page", String(tp));
  }, [apiLoading, tp, params.page, update]);
  const [stickyVisible, setStickyVisible] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editorPreview) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { rootMargin: `-${HEADER_H}px 0px 0px 0px`, threshold: 0 },
    );
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
      {!editorPreview ? <SelectionTray products={selectionProducts} /> : null}
    </div>
  );
}
