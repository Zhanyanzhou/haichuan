import { useId, type RefObject } from "react";
import { WEIGHT_RANGES } from "@/data/catalogData";
import type { CatalogFilterValues } from "./CatalogFilters";
import useCatalogDialog from "./useCatalogDialog";

export function getCatalogPriceError(
  minPrice: string,
  maxPrice: string,
): string {
  const amounts = [minPrice.trim(), maxPrice.trim()];
  if (amounts.some((amount) => amount && !/^\d+(?:\.\d{1,2})?$/.test(amount))) {
    return "请输入非负金额，最多保留两位小数";
  }
  if (
    amounts.some(
      (amount) =>
        amount &&
        (!Number.isFinite(Number(amount)) ||
          Number(amount) > Number.MAX_SAFE_INTEGER / 100),
    )
  ) {
    return "金额超出支持范围";
  }
  if (amounts.every(Boolean) && Number(amounts[0]) > Number(amounts[1])) {
    return "最高价不能低于最低价";
  }
  return "";
}

export function CatalogPriceInputs({
  minPrice,
  maxPrice,
  onMinPrice,
  onMaxPrice,
  errorId,
}: {
  minPrice: string;
  maxPrice: string;
  onMinPrice: (value: string) => void;
  onMaxPrice: (value: string) => void;
  errorId?: string;
}) {
  return (
    <div className="catalog-price-inputs">
      <label>
        <span aria-hidden="true">¥</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label="最低价"
          aria-invalid={Boolean(errorId)}
          aria-describedby={errorId}
          value={minPrice}
          placeholder="最低价"
          maxLength={20}
          onChange={(event) => onMinPrice(event.target.value)}
        />
      </label>
      <span aria-hidden="true">—</span>
      <label>
        <span aria-hidden="true">¥</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label="最高价"
          aria-invalid={Boolean(errorId)}
          aria-describedby={errorId}
          value={maxPrice}
          placeholder="最高价"
          maxLength={20}
          onChange={(event) => onMaxPrice(event.target.value)}
        />
      </label>
    </div>
  );
}

export default function FilterDrawer({
  values,
  materialOptions,
  craftOptions,
  sizeOptions,
  onChange,
  onApply,
  onClose,
  total,
  loading,
  returnFocusRef,
}: {
  values: CatalogFilterValues;
  materialOptions: string[];
  craftOptions: string[];
  sizeOptions: string[];
  onChange: (values: CatalogFilterValues) => void;
  onApply: () => void;
  onClose: () => void;
  total: number | null;
  loading: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const errorId = useId();
  const priceError = getCatalogPriceError(values.minPrice, values.maxPrice);
  const { dialogRef, initialFocusRef } = useCatalogDialog(
    onClose,
    returnFocusRef,
  );
  const toggle = (
    key: "materials" | "crafts" | "weights" | "sizes",
    value: string,
  ) => {
    const selected = values[key];
    onChange({
      ...values,
      [key]: selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    });
  };

  return (
    <>
      <div
        className="catalog-filter-drawer__backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="catalog-filter-drawer"
      >
        <div className="catalog-filter-drawer__header">
          <h3 id={titleId}>筛选作品</h3>
          <button
            ref={initialFocusRef}
            type="button"
            aria-label="关闭筛选"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="catalog-filter-drawer__body">
          <p className="catalog-filter-drawer__hint">
            同类条件可多选，选择后查看作品。
          </p>
          <FilterGroup
            title="材质"
            options={materialOptions}
            selected={values.materials}
            onToggle={(value) => toggle("materials", value)}
          />
          <FilterGroup
            title="工艺"
            options={craftOptions}
            selected={values.crafts}
            onToggle={(value) => toggle("crafts", value)}
          />
          <FilterGroup
            title="重量"
            options={WEIGHT_RANGES}
            selected={values.weights}
            onToggle={(value) => toggle("weights", value)}
          />
          <FilterGroup
            title="规格"
            options={sizeOptions}
            selected={values.sizes}
            onToggle={(value) => toggle("sizes", value)}
          />
          <fieldset className="catalog-drawer-filter-group">
            <legend>价格区间</legend>
            <CatalogPriceInputs
              minPrice={values.minPrice}
              maxPrice={values.maxPrice}
              errorId={priceError ? errorId : undefined}
              onMinPrice={(minPrice) => onChange({ ...values, minPrice })}
              onMaxPrice={(maxPrice) => onChange({ ...values, maxPrice })}
            />
            <p className="catalog-price-note">
              按公开售价或定制参考起价筛选，定制最终金额以确认方案后的报价为准。
            </p>
            {priceError && (
              <p id={errorId} className="catalog-filter-error" role="alert">
                {priceError}
              </p>
            )}
          </fieldset>
        </div>
        <div className="catalog-filter-drawer__footer">
          <p role="status" aria-live="polite" aria-busy={loading}>
            {priceError
              ? "请先修正价格区间"
              : loading
                ? "正在统计符合条件的作品…"
                : total === null
                  ? "暂时无法预览数量，可应用条件后重试"
                  : `符合条件的作品共 ${total} 款`}
          </p>
          <div className="catalog-filter-drawer__actions">
            <button
              type="button"
              onClick={() =>
                onChange({
                  materials: [],
                  crafts: [],
                  weights: [],
                  sizes: [],
                  minPrice: "",
                  maxPrice: "",
                })
              }
            >
              重置
            </button>
            <button
              type="button"
              className="catalog-filter-apply"
              disabled={Boolean(priceError) || loading}
              onClick={onApply}
            >
              {total === null ? "应用筛选" : `查看 ${total} 款作品`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const available = Array.from(new Set([...options, ...selected]));
  if (!available.length) return null;
  return (
    <fieldset className="catalog-drawer-filter-group">
      <legend>{title}</legend>
      <div className="catalog-drawer-filter-group__values">
        {available.map((option) => (
          <label className="catalog-filter-check" key={option}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
