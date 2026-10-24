import { Alert, Empty, Input, Tree } from "antd";
import type { Key } from "react";
import ScifiButton from "@/components/ui/ScifiButton";
import { ADMIN_COPY, getAdminEmptyText } from "@/constants/adminCopy";
import {
  visibleProductCount,
  type CatTreeDataNode,
  type CatTreeNode,
  type CategoryDropInfo,
} from "./categoryManageModel";

type CategoryTreePanelProps = {
  treeData: CatTreeDataNode[];
  keyword: string;
  selectedKeys: number[];
  expandedKeys: number[];
  reordering: boolean;
  loadError: boolean;
  onKeywordChange: (value: string) => void;
  onRefresh: () => void | Promise<void>;
  onSelect: (keys: Key[]) => void;
  onExpand: (keys: Key[]) => void;
  onDrop: (info: CategoryDropInfo) => void;
};

function TreeTitle({
  node,
  selected,
  busy,
}: Readonly<{
  node: CatTreeNode;
  selected: boolean;
  busy: boolean;
}>) {
  const count = visibleProductCount(node);

  return (
    <div
      className={`cat-tree-title is-l${node.level}${selected ? " is-selected" : ""}${busy ? " is-busy" : ""}`}
    >
      {node.icon ? <span className="cat-tree-title__icon">{node.icon}</span> : null}
      <span className={`cat-tree-title__name cat-tree-title__name--l${node.level}`}>
        {node.name}
      </span>
      <span className="cat-tree-title__count">{count} 件</span>
    </div>
  );
}

export default function CategoryTreePanel({
  treeData,
  keyword,
  selectedKeys,
  expandedKeys,
  reordering,
  loadError,
  onKeywordChange,
  onRefresh,
  onSelect,
  onExpand,
  onDrop,
}: CategoryTreePanelProps) {
  return (
    <aside className="cat-manage__tree">
      <div className="cat-manage__search">
        <Input.Search
          allowClear
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="搜索分类名称"
          size="middle"
        />
      </div>
      <div className="cat-manage__tree-widget">
        {loadError ? (
          <Empty
            description="分类加载失败，请稍后重试。"
            style={{ margin: "32px 0" }}
          >
            <ScifiButton
              variant="outline"
              size="sm"
              onClick={() => void onRefresh()}
            >
              {ADMIN_COPY.actions.retry}
            </ScifiButton>
          </Empty>
        ) : treeData.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={getAdminEmptyText("分类", Boolean(keyword))}
            style={{ margin: "32px 0" }}
          />
        ) : (
          <>
            {reordering && (
              <Alert
                type="info"
                showIcon
                message="正在保存排序…"
                style={{ margin: "0 4px 8px" }}
              />
            )}
            <Tree
              treeData={treeData}
              draggable
              blockNode
              selectedKeys={selectedKeys}
              expandedKeys={expandedKeys}
              onExpand={onExpand}
              onSelect={onSelect}
              onDrop={onDrop}
              titleRender={(dataNode) => {
                const node = (dataNode as CatTreeDataNode).node;
                if (!node) return null;
                return (
                  <TreeTitle
                    node={node}
                    selected={selectedKeys[0] === node.id}
                    busy={reordering}
                  />
                );
              }}
            />
          </>
        )}
      </div>
    </aside>
  );
}
