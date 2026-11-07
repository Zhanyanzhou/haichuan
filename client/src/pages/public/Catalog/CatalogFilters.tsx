import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { RealCategory } from "@/hooks/useProductData";
import { catalogTokens as T } from "./catalogTokens";
import { getPrimaryCats, getRealSubs } from "./catalogCategories";
import { WEIGHT_RANGES } from "@/data/catalogData";
import {
  CatalogPriceInputs,
  getCatalogPriceError,
} from "./CatalogFilterDrawer";
import "./catalogFilters.css";

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
        <div className="catalog-category-nav__items">
          <button
            type="button"
            className="catalog-category-nav__item"
            aria-pressed={!active}
            onClick={() => onChange("")}
          >
            全部
            {!active ? <span aria-hidden="true" /> : null}
          </button>
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
          maxWidth: 1440,
          marginInline: "auto",
          display: "flex",
          alignItems: "center",
          minHeight: 48,
          gap: "clamp(24px, 3vw, 40px)",
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {active ? (
          <L2Btn active={false} onClick={() => onChange("")}>
            全部款式
          </L2Btn>
        ) : null}
        {subs.map((s) => {
          const id = String(s.id);
          const selected = active === id;
          return (
            <L2Btn
              key={s.id}
              active={selected}
              onClick={() => onChange(selected ? "" : id)}
            >
              {s.name}
            </L2Btn>
          );
        })}
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
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        minHeight: 44,
        padding: 0,
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
      {active ? (
        <span
          style={{
            position: "absolute",
            bottom: 6,
            left: 0,
            right: 0,
            height: 1,
            background: T.txt,
          }}
        />
      ) : null}
    </button>
  );
}

export type CatalogFilterValues = {
  materials: string[];
  crafts: string[];
  weights: string[];
  sizes: string[];
  minPrice: string;
  maxPrice: string;
};

export function Toolbar({
  values,
  materialOptions,
  craftOptions,
  sizeOptions,
  sort,
  total,
  selCount,
  loading,
  onChange,
  onSort,
  onOpenFilter,
}: {
  values: CatalogFilterValues;
  materialOptions: string[];
  craftOptions: string[];
  sizeOptions: string[];
  sort: string;
  total: number;
  selCount: number;
  loading: boolean;
  onChange: (changes: Partial<CatalogFilterValues>) => void;
  onSort: (sort: string) => void;
  onOpenFilter: (trigger: HTMLButtonElement) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const [minPrice, setMinPrice] = useState(values.minPrice);
  const [maxPrice, setMaxPrice] = useState(values.maxPrice);
  const [priceError, setPriceError] = useState("");
  const moreId = useId();
  const priceErrorId = useId();
  useEffect(() => {
    setMinPrice(values.minPrice);
    setMaxPrice(values.maxPrice);
    setPriceError("");
  }, [values.minPrice, values.maxPrice]);
  const filterCount =
    values.materials.length +
    values.crafts.length +
    values.weights.length +
    values.sizes.length +
    Number(Boolean(values.minPrice || values.maxPrice));
  const priceSelected = sort === "price_asc" || sort === "price_desc";

  return (
    <section className="catalog-filter-tools" aria-label="筛选与排序">
      <div className="catalog-filter-tools__inner">
        <div className="catalog-sort-bar">
          <div
            className="catalog-sort-bar__summary"
            role="status"
            aria-live="polite"
            aria-busy={loading}
          >
            {loading ? "正在查找作品…" : `共 ${total} 款作品`}
            {selCount > 0 && <span>已选 {selCount}</span>}
          </div>
          <div className="catalog-sort-bar__controls">
            <button
              type="button"
              className="catalog-sort-bar__filter catalog-sort-bar__desktop-filter"
              aria-expanded={filtersOpen}
              aria-controls={filtersId}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <FilterIcon />
              筛选{filterCount > 0 ? ` · ${filterCount}` : ""}
              <span aria-hidden="true">{filtersOpen ? "−" : "+"}</span>
            </button>
            <button
              type="button"
              className="catalog-sort-bar__filter catalog-sort-bar__mobile-filter"
              onClick={(event) => onOpenFilter(event.currentTarget)}
            >
              <FilterIcon />
              筛选{filterCount > 0 ? ` · ${filterCount}` : ""}
            </button>
            <label className="catalog-sort-bar__sort">
              <span className="catalog-visually-hidden">作品排序</span>
              <select value={sort} onChange={(event) => onSort(event.target.value)}>
                <option value="recommended">综合排序</option>
                <option value="newest">新品优先</option>
                <option value="sku">款号升序</option>
                <option value="price_asc">价格从低到高</option>
                <option value="price_desc">价格从高到低</option>
                <option value="sales" disabled>销量（暂未开放）</option>
              </select>
            </label>
          </div>
        </div>
        {priceSelected && (
          <p className="catalog-price-note catalog-price-note--scope">
            按公开售价或定制参考起价排序，定制最终金额以确认方案后的报价为准
          </p>
        )}
        <div id={filtersId} className="catalog-filter-panel" hidden={!filtersOpen}>
          <div className="catalog-attribute-rows">
            <AttributeRow
              title="材质"
              options={materialOptions}
              selected={values.materials}
              onChange={(materials) => onChange({ materials })}
            />
            <AttributeRow
              title="工艺"
              options={craftOptions}
              selected={values.crafts}
              onChange={(crafts) => onChange({ crafts })}
            />
            <AttributeRow
              title="重量"
              options={WEIGHT_RANGES}
              selected={values.weights}
              onChange={(weights) => onChange({ weights })}
            />
            <div id={moreId} hidden={!moreOpen}>
              <AttributeRow
                title="规格"
                options={sizeOptions}
                selected={values.sizes}
                onChange={(sizes) => onChange({ sizes })}
              />
            </div>
            <div className="catalog-filter-tools__extras">
              {sizeOptions.length > 0 && (
                <button
                  type="button"
                  className="catalog-filter-tools__more"
                  aria-expanded={moreOpen}
                  aria-controls={moreId}
                  onClick={() => setMoreOpen(!moreOpen)}
                >
                  {moreOpen ? "收起条件" : "更多条件"}{" "}
                  <span aria-hidden="true">{moreOpen ? "−" : "+"}</span>
                </button>
              )}
              <button
                type="button"
                className="catalog-filter-tools__more"
                onClick={(event) => onOpenFilter(event.currentTarget)}
              >
                全部筛选
              </button>
            </div>
          </div>
          <form
            className="catalog-sort-bar__price"
            aria-label="价格区间"
            onSubmit={(event) => {
              event.preventDefault();
              const error = getCatalogPriceError(minPrice, maxPrice);
              setPriceError(error);
              if (!error)
                onChange({
                  minPrice: minPrice.trim(),
                  maxPrice: maxPrice.trim(),
                });
            }}
          >
            <span className="catalog-attribute-row__title">价格</span>
            <CatalogPriceInputs
              minPrice={minPrice}
              maxPrice={maxPrice}
              errorId={priceError ? priceErrorId : undefined}
              onMinPrice={setMinPrice}
              onMaxPrice={setMaxPrice}
            />
            <button type="submit">确定</button>
            {priceError && (
              <span
                id={priceErrorId}
                className="catalog-filter-error"
                role="alert"
              >
                {priceError}
              </span>
            )}
          </form>
          <p className="catalog-price-note">
            按公开售价或定制参考起价筛选，定制最终金额以确认方案后的报价为准
          </p>
        </div>
      </div>
    </section>
  );
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M3 7h7m4 0h7M3 17h11m4 0h3M10 4v6m4 4v6" />
    </svg>
  );
}

function AttributeRow({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [multiple, setMultiple] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const multiTriggerRef = useRef<HTMLButtonElement>(null);
  const multiOptionsId = useId();
  const closeMultiple = () => {
    setMultiple(false);
    multiTriggerRef.current?.ownerDocument.defaultView?.requestAnimationFrame(() => {
      multiTriggerRef.current?.focus({ preventScroll: true });
    });
  };
  const selectionKey = JSON.stringify([selected, options]);
  useEffect(() => {
    setMultiple(false);
  }, [selectionKey]);
  const available = Array.from(new Set([...options, ...selected]));
  if (!available.length) return null;
  const current = multiple ? draft : selected;
  return (
    <div
      className="catalog-attribute-row"
      role="group"
      aria-label={`${title}筛选`}
      onKeyDown={(event) => {
        if (!multiple || event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        closeMultiple();
      }}
    >
      <span className="catalog-attribute-row__title">{title}</span>
      <div id={multiOptionsId} className="catalog-attribute-row__body">
        <div className="catalog-attribute-row__values">
          <button
            type="button"
            aria-pressed={!current.length}
            onClick={() => (multiple ? setDraft([]) : onChange([]))}
          >
            不限
          </button>
          {available.map((option) =>
            multiple ? (
              <label key={option} className="catalog-filter-check">
                <input
                  type="checkbox"
                  checked={draft.includes(option)}
                  onChange={() =>
                    setDraft(
                      draft.includes(option)
                        ? draft.filter((value) => value !== option)
                        : [...draft, option],
                    )
                  }
                />
                {option}
              </label>
            ) : (
              <button
                type="button"
                key={option}
                aria-pressed={selected.includes(option)}
                onClick={() => onChange([option])}
              >
                {option}
              </button>
            ),
          )}
        </div>
        {multiple && (
          <div className="catalog-attribute-row__actions">
            <button
              type="button"
              className="catalog-filter-apply"
              onClick={() => {
                onChange(draft);
                closeMultiple();
              }}
            >
              确定
            </button>
            <button type="button" onClick={closeMultiple}>
              取消
            </button>
          </div>
        )}
      </div>
      <button
        ref={multiTriggerRef}
        type="button"
        className="catalog-attribute-row__multi"
        aria-expanded={multiple}
        aria-controls={multiOptionsId}
        onClick={() => {
          if (multiple) {
            closeMultiple();
            return;
          }
          setDraft(selected);
          setMultiple(true);
        }}
      >
        多选
      </button>
    </div>
  );
}

export function ActiveFilters({
  values,
  priceOnly,
  onChange,
  onClearAll,
  onClearPriceScope,
}: {
  values: CatalogFilterValues;
  priceOnly: boolean;
  onChange: (changes: Partial<CatalogFilterValues>) => void;
  onClearAll: () => void;
  onClearPriceScope: () => void;
}) {
  const groups = [
    { key: "materials" as const, label: "材质" },
    { key: "crafts" as const, label: "工艺" },
    { key: "weights" as const, label: "重量" },
    { key: "sizes" as const, label: "规格" },
  ];
  const hasPrice = Boolean(values.minPrice || values.maxPrice);
  if (!priceOnly && !hasPrice && !groups.some(({ key }) => values[key].length))
    return null;
  return (
    <div className="catalog-filter-summary" aria-label="已选筛选条件">
      <div className="catalog-filter-summary__inner">
        <span className="catalog-filter-summary__title">已选条件</span>
        {groups.flatMap(({ key, label }) =>
          values[key].map((value) => (
            <FilterTag
              key={`${key}-${value}`}
              label={`${label} · ${value}`}
              onRemove={() =>
                onChange({
                  [key]: values[key].filter((item) => item !== value),
                })
              }
            />
          )),
        )}
        {hasPrice && (
          <FilterTag
            label={`价格 · ¥${values.minPrice || "0"}—${values.maxPrice ? `¥${values.maxPrice}` : "不限"}`}
            onRemove={() => onChange({ minPrice: "", maxPrice: "" })}
          />
        )}
        {priceOnly && (
          <FilterTag label="仅看已标价作品" onRemove={onClearPriceScope} />
        )}
        <button
          type="button"
          className="catalog-filter-summary__clear"
          onClick={onClearAll}
        >
          清除筛选
        </button>
      </div>
    </div>
  );
}

function FilterTag({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className="catalog-filter-tag"
      aria-label={`移除筛选 ${label}`}
      onClick={onRemove}
    >
      <span>{label}</span>
      <span aria-hidden="true">×</span>
    </button>
  );
}
