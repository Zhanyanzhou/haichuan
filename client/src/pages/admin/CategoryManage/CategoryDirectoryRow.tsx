import { useState, type DragEvent, type MutableRefObject } from "react";
import { Button } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, CaretDownOutlined, CaretRightOutlined, EditOutlined, HolderOutlined } from "@ant-design/icons";
import { countManageableProducts, countProductsRecursive, hasUnclassifiedProducts, type CatTreeNode } from "./categoryManageModel";

export default function CategoryDirectoryRow({
  node, parentPath, index, siblings, branch, sorting, canReorder, saving, hasPendingOrder,
  selected, onSelect, onEdit, onMove, drag,
}: Readonly<{
  node: CatTreeNode;
  parentPath: string[];
  index: number;
  siblings: CatTreeNode[];
  branch?: { id: string; expanded: boolean; onToggle: () => void };
  sorting: boolean;
  canReorder: boolean;
  saving: boolean;
  hasPendingOrder: boolean;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onMove: (node: CatTreeNode, index: number) => void;
  drag: MutableRefObject<CatTreeNode | null>;
}>) {
  const [dropEdge, setDropEdge] = useState<"before" | "after" | null>(null);
  const linked = countProductsRecursive(node);
  const manageableCount = countManageableProducts(node);
  const count = manageableCount ?? linked;
  const historical = Math.max(0, linked - count);
  const sameName = siblings.some((sibling) => sibling.id !== node.id && sibling.name === node.name);
  const root = parentPath.length === 0;
  const directCount = node.manageableProductCount;
  const showSplit = root && !node.isUncategorized && directCount !== undefined && manageableCount !== undefined
    && (!!node.children?.length || directCount > 0);
  const actionsDisabled = saving || hasPendingOrder;
  const reorderDisabled = saving || !canReorder;

  function getDropPosition(event: DragEvent<HTMLDivElement>) {
    const moved = drag.current;
    if (reorderDisabled || !moved || moved.id === node.id) return null;
    const from = siblings.findIndex((sibling) => sibling.id === moved.id);
    if (from < 0) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY >= rect.top + rect.height / 2;
    const target = index + Number(after) - Number(from < index);
    if (target === from) return null;
    return { moved, after, target };
  }
  const label = (
    <span className="cat-row__label">
      {parentPath.length > 1 ? <span className="cat-row__path">{parentPath.slice(1).join(" / ")} /</span> : null}
      <strong>{node.name}</strong>
      {branch && !branch.expanded && hasUnclassifiedProducts(node) ? (
        <span className="cat-row__path">待归类 {directCount} 件</span>
      ) : null}
      {sameName ? <span className="cat-row__position">第 {index + 1} 位</span> : null}
    </span>
  );

  return (
    <div
      className={`cat-row ${root ? "cat-row--root" : "cat-row--child"}${selected ? " cat-row--selected" : ""}${sorting ? " cat-row--sorting" : ""}`}
      data-drop-edge={dropEdge ?? undefined}
      onDragOver={(event) => {
        const position = getDropPosition(event);
        setDropEdge(position ? (position.after ? "after" : "before") : null);
        if (!position) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setDropEdge(null);
        }
      }}
      onDrop={(event) => {
        const position = getDropPosition(event);
        setDropEdge(null);
        if (!position) return;
        event.preventDefault();
        drag.current = null;
        onMove(position.moved, position.target);
      }}
    >
        {branch ? <Button
          type="text"
          className="cat-row__expand"
          icon={branch.expanded ? <CaretDownOutlined aria-hidden="true" /> : <CaretRightOutlined aria-hidden="true" />}
          aria-label={`${branch.expanded ? "收起" : "展开"}「${node.name}」的下级分类`}
          aria-expanded={branch.expanded}
          aria-controls={branch.id}
          onClick={branch.onToggle}
        /> : null}
        <button
          type="button"
          className="cat-row__select"
          disabled={saving}
          aria-current={selected ? "true" : undefined}
          aria-controls="category-products-preview"
          aria-description={showSplit ? `已归二级 ${count - directCount} 件，未分类 ${directCount} 件`
            : root ? undefined : `所属分类：${parentPath.join(" / ")}`}
          aria-label={`查看「${node.name}」的商品（${count} 件${historical ? `，另有 ${historical} 件历史关联` : ""}）`}
          onClick={onSelect}
        >
          {label}
          <span className={`cat-row__quantity${count === 0 ? " cat-row__quantity--zero" : ""}`}>{count} 件</span>
        </button>
        {canReorder ? (
          <span
            className="cat-row__grip"
            draggable={!reorderDisabled}
            title="拖动调整同级顺序"
            aria-hidden="true"
            onDragStart={(event) => {
              drag.current = node;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(node.id));
            }}
            onDragEnd={() => { drag.current = null; }}
          ><HolderOutlined /></span>
        ) : null}
        {canReorder ? (
          <div className="cat-row__manage">
            <Button type="text" icon={<ArrowUpOutlined />} aria-label={`上移「${node.name}」`} disabled={reorderDisabled || index === 0} onClick={() => onMove(node, index - 1)} />
            <Button type="text" icon={<ArrowDownOutlined />} aria-label={`下移「${node.name}」`} disabled={reorderDisabled || index === siblings.length - 1} onClick={() => onMove(node, index + 1)} />
          </div>
        ) : !sorting && !node.isUncategorized ? (
          <div className="cat-row__manage">
            <Button
              type="text"
              className="cat-row__edit"
              icon={<EditOutlined aria-hidden="true" />}
              disabled={actionsDisabled}
              aria-label={`编辑「${node.name}」`}
              title="编辑分类"
              onClick={onEdit}
            />
          </div>
        ) : null}
    </div>
  );
}
