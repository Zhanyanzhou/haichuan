import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  const historyId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(query);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { history, addToHistory, removeOne, clearAll } = useSearchHistory();
  const suggestions = useMemo(
    () => getCatalogSuggestions(draft, products, categories, materials),
    [categories, draft, materials, products],
  );

  useEffect(() => setDraft(query), [query]);
  useEffect(() => setActiveIndex(-1), [draft, suggestions]);

  const submit = (value: string) => {
    const clean = value.trim();
    setDraft(clean);
    onSearch(clean);
    if (clean) {
      addToHistory(clean);
      trackSearch(clean);
    }
    inputRef.current?.focus({ preventScroll: true });
    setActiveIndex(-1);
    setOpen(false);
  };
  const showSuggestions = open && Boolean(draft.trim()) && suggestions.length > 0;
  const showHistory = open && !draft.trim() && history.length > 0;
  const popupOpen = Boolean(showSuggestions || showHistory);

  const closePopup = () => {
    inputRef.current?.focus({ preventScroll: true });
    setActiveIndex(-1);
    setOpen(false);
  };

  const moveActiveSuggestion = (direction: 1 | -1) => {
    if (!showSuggestions) return;
    setActiveIndex((current) => {
      if (current < 0) return direction === 1 ? 0 : suggestions.length - 1;
      return (current + direction + suggestions.length) % suggestions.length;
    });
  };

  return (
    <div className="catalog-search" aria-label="选款搜索">
      <p className="catalog-search__eyebrow">SEARCH THE COLLECTION</p>
      <h2 className="catalog-search__title">查找作品</h2>
      <div
        className="catalog-search__field"
        onFocusCapture={() => setOpen(true)}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
          setActiveIndex(-1);
          setOpen(false);
        }}
        onKeyDownCapture={(event) => {
          if (event.key !== "Escape" || !popupOpen) return;
          event.preventDefault();
          event.stopPropagation();
          closePopup();
        }}
      >
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
            onChange={(event) => {
              setDraft(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && showSuggestions) {
                event.preventDefault();
                moveActiveSuggestion(1);
              } else if (event.key === "ArrowUp" && showSuggestions) {
                event.preventDefault();
                moveActiveSuggestion(-1);
              } else if (event.key === "Enter" && showSuggestions && activeIndex >= 0) {
                event.preventDefault();
                submit(suggestions[activeIndex].value);
              }
            }}
            placeholder="搜索作品名称或编号"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={Boolean(showSuggestions)}
            aria-controls={showSuggestions ? listboxId : undefined}
            aria-activedescendant={
              showSuggestions && activeIndex >= 0
                ? `${listboxId}-option-${activeIndex}`
                : undefined
            }
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
                  setActiveIndex(-1);
                  setOpen(true);
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
        {showSuggestions ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label="搜索建议"
            className="catalog-search__suggestions"
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.value}`}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => submit(suggestion.value)}
                style={{
                  display: "flex",
                  width: "100%",
                  gap: 14,
                  padding: "12px 16px",
                  border: 0,
                  borderBottom: `1px solid ${T.line}`,
                  background: index === activeIndex ? T.bgWarm : "none",
                  color: T.txt,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ minWidth: 32, color: T.sec, fontSize: 12 }}>
                  {suggestion.type}
                </span>
                <span style={{ fontSize: 13 }}>{suggestion.value}</span>
              </button>
            ))}
          </div>
        ) : showHistory ? (
          <section
            id={historyId}
            aria-label="最近搜索"
            className="catalog-search__suggestions"
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 16px",
                color: T.sec,
                fontSize: 12,
              }}
            >
              <span>最近搜索</span>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  clearAll();
                  inputRef.current?.focus({ preventScroll: true });
                }}
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
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {history.slice(0, 5).map((item) => (
                <li
                  key={item}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 44px",
                    borderTop: `1px solid ${T.line}`,
                  }}
                >
                  <button
                    type="button"
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
                    onClick={() => {
                      removeOne(item);
                      inputRef.current?.focus({ preventScroll: true });
                    }}
                    style={{
                      border: 0,
                      background: "none",
                      color: T.sec,
                      cursor: "pointer",
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <p className="catalog-search__hint">支持作品名称、品类、材质或货号</p>
    </div>
  );
}
