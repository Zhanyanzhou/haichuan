import { useState, type ReactNode } from "react";
import type { RealCategory } from "@/hooks/useProductData";
import { catalogTokens as T } from "./catalogTokens";
import { catNameById, getPrimaryCats, getRealSubs } from "./catalogCategories";

export { default as FilterDrawer } from "./CatalogFilterDrawer";
/* ══════════════════════════════════════
   组件：一级类目（真实分类）
   ══════════════════════════════════════ */
export function PrimaryNav({
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
export function SecondaryNav({
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
        className="catalog-secondary-nav__inner"
        style={{
          maxWidth: 1280,
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
  children: ReactNode;
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
export function Toolbar({
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
          <span style={{ color: T.sec, fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 }}>{total} 件作品</span>
          <div className="catalog-toolbar__spacer" style={{ flex: 1 }} />
          <div className="catalog-toolbar__material" style={{ position: "relative" }}>
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
            aria-label="作品排序方式"
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

/* ══════════════════════════════════════
   组件：当前筛选标签
   ══════════════════════════════════════ */
export function ActiveFilters({
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
        className="catalog-active-filters__inner"
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
