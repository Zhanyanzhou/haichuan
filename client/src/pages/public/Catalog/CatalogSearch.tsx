import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CatalogProduct } from "@/data/catalogData";
import type { RealCategory } from "@/hooks/useProductData";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { trackSearch } from "@/hooks/useAnalytics";
import { catalogTokens as T } from "./catalogTokens";

type CatalogSuggestion = {
  type: "品类" | "材质" | "作品" | "货号";
  value: string;
};

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
      if (category.name.toLocaleLowerCase().includes(needle)) {
        add("品类", category.name);
      }
      if (category.children?.length) visitCategories(category.children);
    }
  };
  visitCategories(categories);
  for (const material of materials) {
    if (material.toLocaleLowerCase().includes(needle)) add("材质", material);
  }
  for (const product of products) {
    if (product.sku.toLocaleLowerCase().includes(needle)) add("货号", product.sku);
    if (product.name?.toLocaleLowerCase().includes(needle)) {
      add("作品", product.name);
    }
  }
  return suggestions.slice(0, 8);
}

type CatalogSearchProps = {
  query: string;
  products: CatalogProduct[];
  categories: RealCategory[];
  materials: string[];
  onSearch: (value: string) => void;
};

export default function CatalogSearch({
  query,
  products,
  categories,
  materials,
  onSearch,
}: CatalogSearchProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimerRef = useRef<number | null>(null);
  const [draft, setDraft] = useState(query);
  const [focused, setFocused] = useState(false);
  const { history, addToHistory, removeOne, clearAll } = useSearchHistory();
  const suggestions = useMemo(
    () => getCatalogSuggestions(draft, products, categories, materials),
    [categories, draft, materials, products],
  );

  const cancelPendingBlur = () => {
    if (blurTimerRef.current === null) return;
    window.clearTimeout(blurTimerRef.current);
    blurTimerRef.current = null;
  };

  useEffect(() => setDraft(query), [query]);
  useEffect(() => () => cancelPendingBlur(), []);

  const submit = (value: string) => {
    const clean = value.trim();
    cancelPendingBlur();
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
            ref={inputRef}
            id="catalog-search-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => {
              cancelPendingBlur();
              setFocused(true);
            }}
            onBlur={() => {
              cancelPendingBlur();
              blurTimerRef.current = window.setTimeout(() => {
                blurTimerRef.current = null;
                setFocused(false);
              }, 120);
            }}
            placeholder="搜索作品名称或编号"
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
                  cancelPendingBlur();
                  setDraft("");
                  onSearch("");
                  setFocused(true);
                  inputRef.current?.focus();
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
              {showSuggestions ? (
                suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.type}-${suggestion.value}`}
                    type="button"
                    role="option"
                    aria-selected="false"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => submit(suggestion.value)}
                    style={{
                      display: "flex",
                      width: "100%",
                      gap: 14,
                      padding: "12px 16px",
                      border: 0,
                      borderBottom: `1px solid ${T.line}`,
                      background: "none",
                      color: T.txt,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ minWidth: 32, color: T.light, fontSize: 10 }}>
                      {suggestion.type}
                    </span>
                    <span style={{ fontSize: 13 }}>{suggestion.value}</span>
                  </button>
                ))
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 16px",
                      color: T.light,
                      fontSize: 10,
                    }}
                  >
                    <span>最近搜索</span>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={clearAll}
                      style={{
                        border: 0,
                        background: "none",
                        color: T.sec,
                        cursor: "pointer",
                        fontSize: 11,
                      }}
                    >
                      清除记录
                    </button>
                  </div>
                  {history.slice(0, 5).map((item) => (
                    <div
                      key={item}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 44px",
                        borderTop: `1px solid ${T.line}`,
                      }}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected="false"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => submit(item)}
                        style={{
                          minHeight: 44,
                          border: 0,
                          background: "none",
                          padding: "12px 16px",
                          color: T.txt,
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: 13,
                        }}
                      >
                        {item}
                      </button>
                      <button
                        type="button"
                        aria-label={`删除搜索记录 ${item}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => removeOne(item)}
                        style={{
                          border: 0,
                          background: "none",
                          color: T.light,
                          cursor: "pointer",
                        }}
                      >
                        ×
                      </button>
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
