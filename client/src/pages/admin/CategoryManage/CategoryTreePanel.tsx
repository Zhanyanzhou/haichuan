import { useRef, useState, type ReactElement } from "react";
import { Button, Input } from "antd";
import { PlusOutlined, SearchOutlined, SwapOutlined } from "@ant-design/icons";
import { AdminEmptyState } from "@/components/common/AdminDataStates";
import CategoryDirectoryRow from "./CategoryDirectoryRow";
import { filterTree, findNode, hasUnclassifiedProducts, matchesCategoryQuery, sortCategories, subtreeIds, type CatTreeNode } from "./categoryManageModel";

type CategoryTreePanelProps = {
  tree: CatTreeNode[];
  keyword: string;
  hasPendingOrder: boolean;
  saving: boolean;
  selectedId?: number;
  selectedUnclassified: boolean;
  onKeywordChange: (value: string) => void;
  onCreate: () => void;
  onCancelSort: () => void;
  onSaveSort: () => Promise<boolean>;
  onMove: (node: CatTreeNode, index: number) => void;
  onSelect: (node: CatTreeNode, unclassified?: boolean) => void;
  onEdit: (node: CatTreeNode) => void;
};

export default function CategoryTreePanel({
  tree, keyword, hasPendingOrder, saving, selectedId, selectedUnclassified, onKeywordChange, onCreate,
  onCancelSort, onSaveSort, onMove, onSelect, onEdit,
}: Readonly<CategoryTreePanelProps>) {
  const drag = useRef<CatTreeNode | null>(null);
  const sortButton = useRef<HTMLButtonElement>(null);
  const [sortMode, setSortMode] = useState(false);
  const [branchChoices, setBranchChoices] = useState<Record<number, boolean>>({});
  const query = keyword.trim();
  const matches = filterTree(tree, query);
  const roots = sortCategories(tree);
  const regularRoots = roots.filter((node) => !node.isUncategorized);
  const activeRootId = selectedId === undefined ? undefined : roots.find((root) => findNode([root], selectedId))?.id;
  const canAdjustOrder = !query && (regularRoots.length > 1 || regularRoots.some(function hasSiblings(node): boolean {
    return (node.children?.length ?? 0) > 1 || !!node.children?.some(hasSiblings);
  }));
  const sorting = sortMode && !query;

  function exitSort() {
    setSortMode(false);
    drag.current = null;
    requestAnimationFrame(() => sortButton.current?.focus());
  }

  function row(node: CatTreeNode, siblings: CatTreeNode[], index: number, parentPath: string[],
    branch?: { id: string; expanded: boolean; onToggle: () => void }) {
    return <CategoryDirectoryRow
      node={node}
      parentPath={parentPath}
      index={index}
      siblings={siblings}
      branch={branch}
      sorting={sorting}
      canReorder={sorting && !node.isUncategorized && siblings.length > 1}
      saving={saving}
      hasPendingOrder={hasPendingOrder}
      selected={node.id === selectedId && !selectedUnclassified}
      onSelect={() => onSelect(node)}
      onEdit={() => onEdit(node)}
      onMove={onMove}
      drag={drag}
    />;
  }

  function descendants(nodes: CatTreeNode[], filtered: CatTreeNode[], parentPath: string[]): ReactElement[] {
    const siblings = sortCategories(nodes);
    return siblings.flatMap((node, index) => {
      const match = filtered.find((entry) => entry.id === node.id);
      if (!match) return [];
      return [
        <li key={node.id}>{row(node, siblings, index, parentPath)}</li>,
        ...descendants(node.children ?? [], match.children ?? [], [...parentPath, node.name]),
      ];
    });
  }

  return (
    <section className="cat-list" aria-label="分类列表">
      <header className="cat-list__header">
        <div className="cat-list__heading">
          <h1>分类管理</h1>
          <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} disabled={saving || sorting} onClick={onCreate}>新建分类</Button>
        </div>
        <div className="cat-list__toolbar">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              value={keyword}
              aria-label="搜索品类或款式"
              placeholder="搜索品类或款式"
              disabled={sorting}
              onChange={(event) => onKeywordChange(event.target.value)}
            />
            <Button ref={sortButton} icon={<SwapOutlined rotate={90} aria-hidden="true" />}
              disabled={saving || hasPendingOrder || (!canAdjustOrder && !sorting)} aria-pressed={sorting}
              aria-describedby={query || sorting ? "cat-order-hint" : undefined}
              onClick={() => sorting ? exitSort() : setSortMode(true)}>调整选款中心顺序</Button>
        </div>
        {query ? <p className="cat-list__order-hint" id="cat-order-hint">清空搜索后可调整顺序。</p> : null}
        {sorting ? (
          <div className="cat-list__pending-order">
            <p id="cat-order-hint">仅可调整同级分类。保存后更新选款中心顺序。</p>
            {hasPendingOrder ? <span role="status">顺序已调整，尚未保存</span> : null}
            <div className="cat-row__actions">
              <Button disabled={saving} onClick={() => {
                if (hasPendingOrder) onCancelSort();
                exitSort();
              }}>{hasPendingOrder ? "取消" : "退出排序"}</Button>
              {hasPendingOrder ? <Button type="primary" loading={saving} onClick={async () => {
                if (await onSaveSort()) exitSort();
              }}>保存顺序</Button> : null}
            </div>
          </div>
        ) : null}
      </header>
      {matches.length ? (
          <ul className="cat-list__tree" aria-label="品类及款式">
            {roots.map((root) => {
              const match = matches.find((node) => node.id === root.id);
              if (!match) return null;
              const showUnclassified = hasUnclassifiedProducts(root)
                && (matchesCategoryQuery(root, query) || "未分类".includes(query));
              const hasBranch = showUnclassified || !!match.children?.length;
              const expanded = !!query || (branchChoices[root.id] ?? root.id === activeRootId);
              const branchId = `cat-branch-${root.id}`;
              const branch = hasBranch && !query ? {
                id: branchId, expanded,
                onToggle: () => setBranchChoices((choices) => ({ ...choices, [root.id]: !expanded })),
              } : undefined;
              const unclassifiedCurrent = root.id === selectedId && selectedUnclassified;
              return (
                <li key={root.id} className="cat-tree-group">
                  {row(root, root.isUncategorized ? [] : regularRoots, regularRoots.indexOf(root), [], branch)}
                  {hasBranch ? (
                    <ul id={branchId} hidden={!expanded} aria-label={`「${root.name}」的下级分类`}>
                      {expanded && showUnclassified ? (
                        <li className={`cat-row cat-row--child cat-row--unclassified${unclassifiedCurrent ? " cat-row--selected" : ""}${sorting ? " cat-row--sorting" : ""}`}>
                          <button type="button" className="cat-row__select" disabled={saving}
                            aria-current={unclassifiedCurrent ? "true" : undefined}
                            aria-controls="category-products-preview"
                            aria-label={`查看「${root.name} / 未分类」的商品（${root.manageableProductCount} 件）`}
                            onClick={() => onSelect(root, true)}>
                            <span className="cat-row__label"><strong>未分类</strong></span>
                            <span className="cat-row__quantity">{root.manageableProductCount} 件</span>
                          </button>
                        </li>
                      ) : null}
                      {expanded ? descendants(root.children ?? [], match.children ?? [], [root.name]) : null}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
      ) : <AdminEmptyState subject="分类" kind={query ? "filtered" : "initial"} />}
      <footer className="cat-list__footer" aria-live="polite">
        {query
          ? `匹配 ${matches.length} 个品类。`
          : `${regularRoots.length} 个品类 · ${regularRoots.reduce((total, node) => total + subtreeIds(node).length - 1, 0)} 个下级分类`}
      </footer>
    </section>
  );
}
