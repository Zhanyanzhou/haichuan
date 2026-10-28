import { useEffect, useMemo, useState } from "react";
import { App as AntdApp, Button, Input, Modal, Popconfirm, Select } from "antd";
import { RightOutlined } from "@ant-design/icons";
import { ADMIN_COPY } from "@/constants/adminCopy";
import { CategoryImageUpload } from "./CategoryFormModal";
import {
  categoryMoveOptions,
  countProductsRecursive,
  getParentName,
  orderedSiblings,
  subtreeIds,
  visibleProductCount,
  type CatTreeNode,
} from "./categoryManageModel";

type CategoryDetailPanelProps = {
  node: CatTreeNode;
  tree: CatTreeNode[];
  keyword: string;
  reordering: boolean;
  saving: boolean;
  onAddStyle: (name: string) => Promise<boolean>;
  onDelete: (moveTo?: number) => void;
  onMove: (parentId: number) => void;
  onOpen: (id: number) => void;
  onShift: (direction: -1 | 1) => void;
  onRename: (name: string) => void;
  onCoverChange: (url: string) => void;
  onViewProducts: () => void;
};

export default function CategoryDetailPanel({
  node,
  tree,
  keyword,
  reordering,
  saving,
  onAddStyle,
  onDelete,
  onMove,
  onOpen,
  onShift,
  onRename,
  onCoverChange,
  onViewProducts,
}: Readonly<CategoryDetailPanelProps>) {
  const { modal } = AntdApp.useApp();
  const [name, setName] = useState(node.name);
  const [styleName, setStyleName] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTo, setMoveTo] = useState<number | null>(null);
  useEffect(() => {
    setName(node.name);
  }, [node.name]);
  const parentId = node.parentId;
  const parentName = getParentName(tree, parentId);
  const directProductCount = node._count?.products ?? 0;
  const childCount =
    node.level === 1
      ? (node.children?.length ?? node._count?.children ?? 0)
      : (node._count?.children ?? 0);
  const productCount = visibleProductCount(node);
  const trimmedName = name.trim();
  const nameChanged = trimmedName !== node.name && trimmedName.length > 0;
  const trimmedStyleName = styleName.trim();
  const siblings = orderedSiblings(tree, parentId ?? null);
  const siblingIndex = siblings.findIndex((item) => item.id === node.id);
  const busy = reordering || saving;
  const positionLabel =
    siblingIndex >= 0 ? `第 ${siblingIndex + 1} 位，共 ${siblings.length} 个` : "";
  const productsInScope = countProductsRecursive(node);
  const moveOptions = useMemo(
    () => categoryMoveOptions(tree, new Set(subtreeIds(node))),
    [node, tree],
  );
  const needsMove = productsInScope > 0;
  const deleteBlocked = needsMove && moveOptions.length === 0;
  const deleteReason = deleteBlocked
    ? "商品必须留在一个分类里。请先新建另一个分类，再删除这个。"
    : "";
  const query = keyword.trim().toLowerCase();
  const styles = orderedSiblings(tree, node.id);
  const visibleStyles =
    !query || node.name.toLowerCase().includes(query)
      ? styles
      : styles.filter(
          (child) =>
            child.name.toLowerCase().includes(query) ||
            child.slug.toLowerCase().includes(query),
        );

  const requestMove = (nextParentId: number) => {
    if (!nextParentId || nextParentId === parentId) return;
    const nextParent = tree.find((category) => category.id === nextParentId);
    modal.confirm({
      title: `把「${node.name}」改到「${nextParent?.name ?? "新品类"}」下？`,
      content: "这个款式会改到新品类下面。商品仍属于这个款式，不会被删除。",
      okText: "改到这个品类",
      cancelText: ADMIN_COPY.actions.cancel,
      onOk: () => onMove(nextParentId),
    });
  };

  const addStyle = async () => {
    if (!trimmedStyleName) return;
    const created = await onAddStyle(trimmedStyleName);
    if (created) setStyleName("");
  };

  return (
    <div className="cat-detail">
      <div className="cat-detail__hero">
        <div className="cat-detail__cover-card">
          <div className="cat-detail__cover-frame">
            {node.coverImage ? (
              <img src={node.coverImage} alt={`${node.name}的封面`} />
            ) : (
              <span>无封面</span>
            )}
          </div>
          <div className="cat-detail__cover-actions">
            <CategoryImageUpload
              value={node.coverImage || undefined}
              announce={false}
              preview={false}
              onChange={onCoverChange}
            />
            {node.coverImage ? (
              <Button size="small" disabled={saving} onClick={() => onCoverChange("")}>
                移除封面
              </Button>
            ) : null}
          </div>
          <p className="cat-detail__caption">
            {node.coverImage
              ? "首页专题会使用这张图。"
              : "首页专题需要封面。导航和商品不受影响。"}
          </p>
        </div>

        <div className="cat-detail__hero-main">
          <div className="cat-detail__status-row">
            {node.level === 1 ? (
              <span className="cat-detail__meta">品类</span>
            ) : (
              <button
                type="button"
                className="cat-detail__crumb"
                disabled={busy || !parentId}
                onClick={() => parentId && onOpen(parentId)}
              >
                {parentName}下的款式
              </button>
            )}
          </div>

          <div className="cat-detail__name-edit">
            <Input
              aria-label="分类名称"
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
            {nameChanged ? (
              <Button
                type="primary"
                disabled={saving}
                onClick={() => onRename(trimmedName)}
              >
                保存名称
              </Button>
            ) : null}
          </div>

          <div className="cat-detail__facts">
            <div className="cat-detail__fact">
              <div className="cat-detail__fact-value">
                <span className="cat-detail__products-count">{productCount}</span>
                <span className="cat-detail__fact-unit">件</span>
              </div>
              <p className="cat-detail__caption">
                {productCount === 0
                  ? `还没有商品。到商品资料里把分类选成「${node.name}」。`
                  : node.level === 1 && childCount > 0
                    ? `含 ${childCount} 个款式，本级 ${directProductCount} 件`
                    : "只计这个款式"}
              </p>
              <Button size="small" type="link" icon={<RightOutlined />} onClick={onViewProducts}>
                查看商品列表
              </Button>
            </div>
            <div className="cat-detail__fact">
              <div className="cat-detail__fact-label">前台顺序</div>
              <p className="cat-detail__caption">{positionLabel}</p>
              <div className="cat-detail__fact-actions">
                <Button
                  size="small"
                  disabled={busy || siblingIndex <= 0}
                  onClick={() => onShift(-1)}
                >
                  上移
                </Button>
                <Button
                  size="small"
                  disabled={busy || siblingIndex < 0 || siblingIndex >= siblings.length - 1}
                  onClick={() => onShift(1)}
                >
                  下移
                </Button>
              </div>
            </div>
          </div>

          <div className="cat-detail__danger">
            {deleteBlocked ? (
              <Button danger disabled>
                删除分类
              </Button>
            ) : needsMove ? (
              <Button
                danger
                disabled={busy}
                onClick={() => {
                  setMoveTo(null);
                  setMoveOpen(true);
                }}
              >
                删除分类
              </Button>
            ) : (
              <Popconfirm
                title={`删除「${node.name}」？`}
                description={
                  childCount > 0
                    ? "这个分类和下面的款式会一起从列表消失，可以按相同名称重新创建。"
                    : "删除后会从列表里消失，可以按相同名称重新创建。商品不会被删除。"
                }
                okText="删除分类"
                okButtonProps={{ danger: true }}
                cancelText={ADMIN_COPY.actions.cancel}
                onConfirm={() => onDelete()}
              >
                <Button danger disabled={busy}>
                  删除分类
                </Button>
              </Popconfirm>
            )}
            {deleteReason ? (
              <p className="cat-detail__blocked">{deleteReason}</p>
            ) : null}
            <Modal
              title={`删除「${node.name}」？`}
              open={moveOpen}
              okText="删除分类"
              okButtonProps={{ danger: true, disabled: moveTo == null || busy }}
              cancelText={ADMIN_COPY.actions.cancel}
              confirmLoading={busy}
              onCancel={() => setMoveOpen(false)}
              onOk={() => {
                if (moveTo == null) return;
                setMoveOpen(false);
                onDelete(moveTo);
              }}
            >
              <p>
                {`下面的款式会一起删除。${productsInScope} 件商品会改到所选分类，商品本身不会删除。`}
              </p>
              <Select
                showSearch
                optionFilterProp="label"
                aria-label="商品改到"
                placeholder="选择商品要改去的分类"
                style={{ width: "100%" }}
                value={moveTo ?? undefined}
                options={moveOptions}
                onChange={(value) => setMoveTo(value)}
              />
            </Modal>
          </div>
        </div>
      </div>

      {node.level === 1 ? (
        <section className="cat-detail__section">
          <div className="cat-detail__section-title">款式</div>
          {childCount === 0 ? (
            <p className="cat-detail__products-label">还没有款式。在下面填写名称即可添加。</p>
          ) : visibleStyles.length === 0 ? (
            <p className="cat-detail__products-label">没有名称匹配的款式。</p>
          ) : (
            <div className="cat-detail__children">
              {visibleStyles.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  className="cat-detail__child"
                  onClick={() => onOpen(child.id)}
                >
                  <span className="cat-detail__child-name">{child.name}</span>
                  <span className="cat-detail__child-meta">
                    <span>{visibleProductCount(child)} 件</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="cat-detail__add">
            <Input
              aria-label="款式名称"
              placeholder="例如：如意"
              value={styleName}
              maxLength={100}
              disabled={saving}
              onChange={(event) => setStyleName(event.target.value)}
              onPressEnter={() => void addStyle()}
            />
            <Button
              size="small"
              type="primary"
              disabled={!trimmedStyleName || saving}
              onClick={() => void addStyle()}
            >
              添加款式
            </Button>
          </div>
        </section>
      ) : (
        <section className="cat-detail__section">
          <div className="cat-detail__section-title">所属品类</div>
          <Select
            aria-label="所属品类"
            value={node.parentId ?? undefined}
            disabled={busy}
            style={{ maxWidth: 280, width: "100%" }}
            options={tree
              .filter((category) => category.level === 1)
              .map((category) => ({ value: category.id, label: category.name }))}
            onChange={(parentId) => requestMove(parentId)}
          />
        </section>
      )}
    </div>
  );
}
