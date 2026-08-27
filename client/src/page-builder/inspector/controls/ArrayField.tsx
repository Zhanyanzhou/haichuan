/**
 * ArrayField.tsx — 条目列表控件（卡片/证书/步骤等一对多内容）。
 *
 * 结构沿用专属面板已验证的「条目导航 + 当前条目字段」模式：
 * 左侧条目列表（序号+摘要，可切换），右侧当前条目字段编辑，
 * 底部增删与排序。条目字段通过 FieldRenderer 递归渲染（复用全部基础控件）。
 */
import { useState } from "react";
import FieldRenderer from "../FieldRenderer";
import type {
  ArrayFieldDef,
  InspectorContext,
} from "../schema/types";
import type { PuckProps } from "../../types";

interface ArrayFieldProps {
  def: ArrayFieldDef;
  value: unknown;
  ctx: InspectorContext;
  onChange: (next: PuckProps[]) => void;
  moduleType?: string;
}

export default function ArrayField({
  def,
  value,
  ctx,
  onChange,
  moduleType,
}: ArrayFieldProps) {
  const items: PuckProps[] = Array.isArray(value)
    ? value.filter((item): item is PuckProps => Boolean(
        item && typeof item === "object" && !Array.isArray(item),
      ))
    : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const safeIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));
  const activeItem = items[safeIndex] ?? null;
  const atMax = def.maxItems !== undefined && items.length >= def.maxItems;

  const updateItem = (patch: PuckProps) => {
    if (!activeItem) return;
    onChange(
      items.map((item, index) =>
        index === safeIndex ? { ...item, ...patch } : item,
      ),
    );
  };

  const addItem = () => {
    if (atMax) return;
    onChange([...items, { ...(def.defaultItem ?? {}) }]);
    setActiveIndex(items.length);
  };

  const removeItem = (index: number) => {
    if (items.length <= (def.minItems ?? 1)) return;
    onChange(items.filter((_, i) => i !== index));
    setActiveIndex(Math.max(0, Math.min(index, items.length - 2)));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setActiveIndex(target);
  };

  return (
    <div className="homepage-editor__inspector-field">
      <label>
        {def.label}
        <span className="homepage-editor__inspector-count">
          {items.length} 项
          {def.maxItems ? ` / 上限 ${def.maxItems}` : ""}
        </span>
      </label>
      {def.hint ? (
        <span className="homepage-editor__inspector-hint">{def.hint}</span>
      ) : null}

      <nav className="homepage-editor__item-nav" aria-label={def.label}>
        {items.map((item, index) => (
          <button
            key={index}
            type="button"
            className={`homepage-editor__item-nav-button${index === safeIndex ? " is-active" : ""}`}
            aria-current={index === safeIndex ? "true" : undefined}
            aria-label={`编辑${def.itemLabel} ${index + 1}${def.itemSummary ? `：${def.itemSummary(item)}` : ""}`}
            onClick={() => setActiveIndex(index)}
          >
            <span className="homepage-editor__item-nav-index">{index + 1}</span>
            <span className="homepage-editor__item-nav-name">
              {def.itemSummary ? def.itemSummary(item) : `第 ${index + 1} 项`}
            </span>
          </button>
        ))}
      </nav>

      {activeItem ? (
        <div className="homepage-editor__item-fields">
          {def.itemFields
            .filter(
              (field) =>
                (!field.visibleWhen || field.visibleWhen({ ...ctx, props: activeItem })) &&
                (!field.device ||
                  field.device === "shared" ||
                  field.device === ctx.device),
            )
            .map((field, fieldIndex) => (
              <FieldRenderer
                key={field.key || fieldIndex}
                def={field}
                ctx={{ ...ctx, props: activeItem }}
                update={updateItem}
                moduleType={moduleType}
              />
            ))}

          <div className="homepage-editor__carousel-item-actions">
            <button type="button" aria-label={`上移${def.itemLabel} ${safeIndex + 1}`} disabled={safeIndex === 0} onClick={() => moveItem(safeIndex, -1)}>
              上移
            </button>
            <button type="button" aria-label={`下移${def.itemLabel} ${safeIndex + 1}`} disabled={safeIndex === items.length - 1} onClick={() => moveItem(safeIndex, 1)}>
              下移
            </button>
            <button
              type="button"
              aria-label={`删除${def.itemLabel} ${safeIndex + 1}`}
              disabled={items.length <= (def.minItems ?? 1)}
              onClick={() => removeItem(safeIndex)}
            >
              删除
            </button>
          </div>
        </div>
      ) : null}

      <div className="homepage-editor__carousel-add" role="status" aria-live="polite">
        <button type="button" disabled={atMax} onClick={addItem}>
          添加{def.itemLabel}
        </button>
      </div>
    </div>
  );
}
