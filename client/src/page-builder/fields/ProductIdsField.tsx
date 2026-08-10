import { useEffect, useMemo, useState } from "react";
import {
  fetchProductList,
  fetchProductsByIds,
  type ProductRow,
} from "../data-sources/productSource";

type ProductIdsFieldProps = {
  value?: number[];
  onChange: (value: number[]) => void;
  readOnly?: boolean;
};

function normalizeIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export default function ProductIdsField({
  value,
  onChange,
  readOnly,
}: ProductIdsFieldProps) {
  const ids = useMemo(() => normalizeIds(value), [value]);
  const [selectedRows, setSelectedRows] = useState<ProductRow[]>([]);
  const [results, setResults] = useState<ProductRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSelectedLoading(ids.length > 0);

    fetchProductsByIds(ids)
      .then((rows) => {
        if (!cancelled) setSelectedRows(rows);
      })
      .catch(() => {
        if (!cancelled) setSelectedRows([]);
      })
      .finally(() => {
        if (!cancelled) setSelectedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ids.join(",")]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(false);
      fetchProductList({ query })
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setError(true);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const emit = (nextIds: number[]) => {
    onChange([...new Set(nextIds)]);
  };

  const addProduct = (id: number) => {
    if (readOnly || ids.includes(id)) return;
    emit([...ids, id]);
  };

  const removeProduct = (id: number) => {
    if (readOnly) return;
    emit(ids.filter((item) => item !== id));
  };

  const moveProduct = (id: number, direction: -1 | 1) => {
    if (readOnly) return;
    const currentIndex = ids.indexOf(id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    const nextIds = [...ids];
    [nextIds[currentIndex], nextIds[nextIndex]] = [
      nextIds[nextIndex],
      nextIds[currentIndex],
    ];
    onChange(nextIds);
  };

  return (
    <div className="homepage-editor__product-picker">
      <div className="homepage-editor__product-picker-search">
        <input
          value={query}
          disabled={readOnly}
          placeholder="搜索商品名称或货号"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="homepage-editor__product-picker-results">
        {loading ? (
          <div className="homepage-editor__product-picker-note">正在搜索商品</div>
        ) : error ? (
          <div className="homepage-editor__product-picker-note is-error">
            商品搜索失败
          </div>
        ) : results.length > 0 ? (
          results.map((product) => {
            const selected = ids.includes(product.id);
            return (
              <button
                key={product.id}
                type="button"
                disabled={readOnly || selected}
                className="homepage-editor__product-picker-row"
                onClick={() => addProduct(product.id)}
              >
                <img src={product.image} alt="" loading="lazy" />
                <span>
                  <strong>{product.name}</strong>
                  <small>{product.code || product.category || "未设置货号"}</small>
                </span>
                <em>{selected ? "已选" : product.priceLabel}</em>
              </button>
            );
          })
        ) : (
          <div className="homepage-editor__product-picker-note">
            没有找到匹配商品
          </div>
        )}
      </div>

      <div className="homepage-editor__product-picker-selected">
        <div className="homepage-editor__product-picker-title">
          已选商品
          <span>{ids.length} 件</span>
        </div>

        {selectedLoading ? (
          <div className="homepage-editor__product-picker-note">正在加载已选商品</div>
        ) : selectedRows.length > 0 ? (
          selectedRows.map((product, index) => (
            <div
              key={product.id}
              className="homepage-editor__product-picker-selected-row"
            >
              <img src={product.image} alt="" loading="lazy" />
              <span>
                <strong>{product.name}</strong>
                <small>{product.code || product.priceLabel}</small>
              </span>
              <div>
                <button
                  type="button"
                  disabled={readOnly || index === 0}
                  onClick={() => moveProduct(product.id, -1)}
                >
                  上移
                </button>
                <button
                  type="button"
                  disabled={readOnly || index === selectedRows.length - 1}
                  onClick={() => moveProduct(product.id, 1)}
                >
                  下移
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => removeProduct(product.id)}
                >
                  移除
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="homepage-editor__product-picker-note">
            暂未选择商品
          </div>
        )}
      </div>
    </div>
  );
}
