import { useEffect, useRef, useState } from "react";
import type { RealCategory } from "@/hooks/useProductData";
import { categoryApi } from "@/services/api";
import { getPrimaryCats, getRealSubs } from "./catalogCategories";
import { catalogTokens as T } from "./catalogTokens";

export function applyCategoryDrafts(
  nodes: RealCategory[],
  drafts: Record<number, string>,
): RealCategory[] {
  if (Object.keys(drafts).length === 0) return nodes;
  return nodes.map((node) => ({
    ...node,
    name: drafts[node.id] ?? node.name,
    children: node.children
      ? applyCategoryDrafts(node.children, drafts)
      : node.children,
  }));
}

export function collectCategoryNames(
  nodes: RealCategory[],
  names: Record<number, string> = {},
): Record<number, string> {
  for (const node of nodes) {
    names[node.id] = node.name;
    if (node.children?.length) collectCategoryNames(node.children, names);
  }
  return names;
}

type RenameCategory = (id: number, savedName: string, value: string) => void;

function useCanvasInlineEdit(onSelect: (id: string) => void) {
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!node) return;
    // 品类数据晚于首屏到达，所以监听绑在真正挂上的节点上。
    // Puck 在模块外壳上截断冒泡，React 根上的 onClick 收不到这次点击。
    const onPointerDown = (event: Event) => {
      event.stopPropagation();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (target && typeof (target as Element).closest === "function") {
        const control = (target as Element).closest<HTMLElement>(
          "[data-canvas-category-select]",
        );
        if (control) {
          onSelectRef.current(control.dataset.canvasCategorySelect ?? "");
        }
      }
      event.stopPropagation();
    };
    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("click", onClick);
    return () => {
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("click", onClick);
    };
  }, [node]);
  return setNode;
}

function CategoryNameControl({
  id,
  name,
  savedName,
  active,
  className,
  onSelect,
  onDraft,
  onRename,
}: Readonly<{
  id: number;
  name: string;
  savedName: string;
  active: boolean;
  className: string;
  onSelect: () => void;
  onDraft: (id: number, name: string | null) => void;
  onRename: RenameCategory;
}>) {
  const [value, setValue] = useState(name);
  const focused = useRef(false);
  const skipCommit = useRef(false);
  useEffect(() => {
    if (!focused.current) setValue(name);
  }, [name]);

  if (!active) {
    return (
      <button
        type="button"
        className={className}
        aria-pressed={false}
        data-canvas-category-select={id}
        onClick={onSelect}
      >
        {name}
      </button>
    );
  }

  return (
    <input
      className={`${className} catalog-canvas-category-input`}
      aria-label={`修改${savedName}`}
      value={value}
      autoFocus
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        onDraft(id, next);
      }}
      onBlur={() => {
        focused.current = false;
        if (skipCommit.current) {
          skipCommit.current = false;
          return;
        }
        onRename(id, savedName, value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          skipCommit.current = true;
          setValue(savedName);
          onDraft(id, null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function CatalogCanvasPrimary({
  categories,
  savedNames,
  active,
  note,
  onChange,
  onDraft,
  onRename,
}: Readonly<{
  categories: RealCategory[];
  savedNames: Record<number, string>;
  active: string;
  note: string;
  onChange: (id: string) => void;
  onDraft: (id: number, name: string | null) => void;
  onRename: RenameCategory;
}>) {
  const primary = getPrimaryCats(categories);
  const editRef = useCanvasInlineEdit(onChange);
  if (!primary.length) return null;
  return (
    <div
      ref={editRef}
      className="catalog-canvas-categories"
      data-canvas-inline-edit=""
      onPointerDown={(event) => event.stopPropagation()}
    >
      <nav className="catalog-category-nav" aria-label="作品品类">
        <div className="catalog-category-nav__inner">
          <div className="catalog-category-nav__items">
            <button
              type="button"
              className="catalog-category-nav__item"
              aria-pressed={!active}
              data-canvas-category-select=""
              onClick={() => onChange("")}
            >
              全部
              {!active ? <span aria-hidden="true" /> : null}
            </button>
            {primary.map((category) => {
              const id = String(category.id);
              const selected = active === id;
              return (
                <CategoryNameControl
                  key={category.id}
                  id={category.id}
                  name={category.name}
                  savedName={savedNames[category.id] ?? category.name}
                  active={selected}
                  className="catalog-category-nav__item"
                  onSelect={() => onChange(id)}
                  onDraft={onDraft}
                  onRename={onRename}
                />
              );
            })}
          </div>
        </div>
      </nav>
      <p className="catalog-canvas-categories__hint">
        {note || "点名称即可修改。改完后点到画布空白处，前台会一起更新。"}
      </p>
    </div>
  );
}

export function CatalogCanvasSecondary({
  categories,
  savedNames,
  parentId,
  active,
  onChange,
  onDraft,
  onRename,
}: Readonly<{
  categories: RealCategory[];
  savedNames: Record<number, string>;
  parentId: string;
  active: string;
  onChange: (id: string) => void;
  onDraft: (id: number, name: string | null) => void;
  onRename: RenameCategory;
}>) {
  const subs = getRealSubs(categories, Number(parentId));
  const editRef = useCanvasInlineEdit(onChange);
  if (!subs.length) return null;
  return (
    <div
      ref={editRef}
      className="catalog-canvas-categories"
      data-canvas-inline-edit=""
      onPointerDown={(event) => event.stopPropagation()}
    >
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
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        <button
          type="button"
          className="catalog-canvas-subitem"
          aria-pressed={!active}
          data-canvas-category-select=""
          onClick={() => onChange("")}
        >
          全部
        </button>
        {subs.map((category) => {
          const id = String(category.id);
          return (
            <CategoryNameControl
              key={category.id}
              id={category.id}
              name={category.name}
              savedName={savedNames[category.id] ?? category.name}
              active={active === id}
              className="catalog-canvas-subitem"
              onSelect={() => onChange(id)}
              onDraft={onDraft}
              onRename={onRename}
            />
          );
        })}
      </div>
    </div>
  );
}

export async function saveCanvasCategoryName(
  id: number,
  savedName: string,
  value: string,
): Promise<"unchanged" | "saved" | "failed"> {
  const next = value.trim();
  if (!next || next === savedName) return "unchanged";
  try {
    await categoryApi.update(id, { name: next });
    return "saved";
  } catch {
    return "failed";
  }
}
