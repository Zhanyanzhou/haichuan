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
  maxProducts?: number;
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
  maxProducts = 8,
}: ProductIdsFieldProps) {
  const ids = useMemo(() => normalizeIds(value), [value]);
  const [selectedRows, setSelectedRows] = useState<ProductRow[]>([]);
  const [results, setResults] = useState<ProductRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSelectedLoading(ids.length > 0);
    setSelectedError(false);

    fetchProductsByIds(ids)
      .then((rows) => {
        if (cancelled) return;
        const productById = new Map(rows.map((row) => [row.id, row]));
        setSelectedRows(ids.flatMap((id) => {
          const row = productById.get(id);
          return row ? [row] : [];
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedRows([]);
          setSelectedError(ids.length > 0);
        }
      })
      .finally(() => {
        if (!cancelled) setSelectedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ids]);

  useEffect(() => {
    let cancelled = false;
    const normalizedQuery = query.trim();
    // 空关键词拉取全量商品列表（点开即展示全部商品）；有关键词时防抖搜索
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError(false);
        fetchProductList({
          query: normalizedQuery,
          pageSize: normalizedQuery ? 20 : 200,
        })
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
      },
      normalizedQuery ? 220 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const emit = (nextIds: number[]) => {
    onChange([...new Set(nextIds)]);
  };

  const addProduct = (id: number) => {
    if (readOnly || ids.includes(id) || ids.length >= maxProducts) return;
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
      <div className="homepage-editor__product-picker-method">
        <span aria-hidden="true" />
        <div>
          <strong>手动选择商品</strong>
          <small>默认展示全部商品，可输入名称或货号搜索；按当前顺序展示。</small>
        </div>
      </div>
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
          <div className="homepage-editor__product-picker-note">正在加载商品</div>
        ) : error ? (
          <div className="homepage-editor__product-picker-note is-error">
            商品加载失败
          </div>
        ) : results.length > 0 ? (
          results.map((product) => {
            const selected = ids.includes(product.id);
            return (
              <button
                key={product.id}
                type="button"
                disabled={readOnly || selected || ids.length >= maxProducts}
                className="homepage-editor__product-picker-row"
                onClick={() => addProduct(product.id)}
              >
                <img src={product.image} alt="" loading="lazy" />
                <span>
                  <strong>{product.name}</strong>
                  <small>{product.code || product.category || "未设置货号"}</small>
                </span>
                <em>{selected ? "已选" : ids.length >= maxProducts ? "已达上限" : product.priceLabel}</em>
              </button>
            );
          })
        ) : (
          <div className="homepage-editor__product-picker-note">
            {query.trim() ? "没有找到匹配商品" : "暂无商品，请先在「商品管理」上传商品"}
          </div>
        )}
      </div>

      <div className="homepage-editor__product-picker-selected">
        <div className="homepage-editor__product-picker-title">
          已选商品 · 顺序即发布顺序
          <span>{ids.length}/{maxProducts} 件</span>
        </div>

        {selectedLoading ? (
          <div className="homepage-editor__product-picker-note">正在加载已选商品</div>
        ) : selectedError ? (
          <div className="homepage-editor__product-picker-note is-error">已选商品加载失败，请稍后重试</div>
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
        {!selectedLoading && !selectedError && ids.length > selectedRows.length ? (
          <div className="homepage-editor__product-picker-note is-error">
            有 {ids.length - selectedRows.length} 件商品已失效，请移除后再发布
          </div>
        ) : null}
      </div>
    </div>
  );
}
