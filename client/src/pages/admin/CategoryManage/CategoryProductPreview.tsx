import { useEffect, useImperativeHandle, useRef, useState, type ComponentRef, type Ref } from "react";
import { Link } from "react-router-dom";
import { App as AntdApp, Button, Checkbox, Pagination, Radio, Tag } from "antd";
import { ArrowRightOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/common/AdminDataStates";
import { SecureImage } from "@/components/common/SecureImage";
import { useAuthStore } from "@/store/authStore";
import { formatPrice } from "@/utils/format";
import { getMaterialLabel } from "@/utils/material";
import { getThumbnailImage } from "@/utils/productImage";
import { productPlaceholder } from "@/utils/placeholder";
import { statusMeta, type ProductListItem } from "../ProductManage/productManageModel";
import { categoryProductsPath, countManageableProducts, countProductsRecursive, getCategoryPath, subtreeIds, type CatTreeNode } from "./categoryManageModel";
import { useCategoryProductPage } from "./useCategoryProductPage";
import CategoryBatchMoveDialog from "./CategoryBatchMoveDialog";

const PAGE_SIZE = 12;
const MAX_SELECTION = 50;

type CategoryProductPreviewProps = {
  category: CatTreeNode;
  unclassified: boolean;
  tree: CatTreeNode[];
  titleRef: Ref<HTMLHeadingElement>;
  saving: boolean;
  batchSelectionCountRef: Ref<number>;
  onBatchBusyChange: (moving: boolean) => void;
  onBatchRefresh: () => Promise<void>;
  onViewProduct: (product: ProductListItem) => void;
};

export default function CategoryProductPreview({
  category, unclassified, tree, titleRef, saving, batchSelectionCountRef, onBatchBusyChange, onBatchRefresh, onViewProduct,
}: Readonly<CategoryProductPreviewProps>) {
  const { message } = AntdApp.useApp();
  const role = useAuthStore((state) => state.user?.role);
  const [selecting, setSelecting] = useState(false);
  const selectPage = useRef<ComponentRef<typeof Checkbox>>(null);
  const batchButton = useRef<HTMLButtonElement>(null);
  const [selection, setSelection] = useState<Map<number, ProductListItem>>(new Map());
  const [moveOpen, setMoveOpen] = useState(false);
  const [onlyDirect, setOnlyDirect] = useState(false);
  const hasChildren = !!category.children?.length;
  const isPrimaryCategory = category.level === 1 && !category.isUncategorized;
  const includeDescendants = hasChildren && !onlyDirect && !unclassified;
  const { page, setPage, result: current, reload } = useCategoryProductPage(category, PAGE_SIZE, includeDescendants);
  const path = getCategoryPath(tree, category.id);
  const pathLabel = path.map((node) => node.name).join(" / ") + (unclassified ? " / 未分类" : "");

  const data = current && "data" in current ? current.data : undefined;
  const directoryCount = includeDescendants ? countManageableProducts(category) : category.manageableProductCount;
  const manageableCount = data?.total ?? directoryCount;
  const directCount = category.manageableProductCount;
  const showBreakdown = includeDescendants && directCount !== undefined
    && manageableCount !== undefined && manageableCount === directoryCount && manageableCount >= directCount;
  const scopeLabel = category.isUncategorized ? "待分配分类"
    : includeDescendants ? "含下级分类"
      : unclassified ? "待归到二级类目" : hasChildren ? "仅本级" : "当前分类";
  const scopeSummary = showBreakdown
    ? isPrimaryCategory
      ? `已归二级 ${manageableCount - directCount} 件 · 未分类 ${directCount} 件`
      : `本级 ${directCount} 件 · 下级 ${manageableCount - directCount} 件`
    : scopeLabel;
  const linkedCount = includeDescendants ? countProductsRecursive(category) : (category._count?.products ?? 0);
  const historicalCount = directoryCount === undefined
    ? 0
    : Math.max(0, linkedCount - directoryCount);
  const productsByCategory = new Map<number, ProductListItem[]>();
  for (const product of data?.list ?? []) {
    const group = productsByCategory.get(product.categoryId) ?? [];
    group.push(product);
    productsByCategory.set(product.categoryId, group);
  }
  const order = new Set([...subtreeIds(category), ...productsByCategory.keys()]);
  const canMove = (product: ProductListItem) =>
    product.status !== "ARCHIVED" && product.reviewStatus !== "IN_REVIEW" &&
    (role !== "EDITOR" || product.status === "DRAFT");
  const pageCandidates = data?.list.filter(canMove) ?? [];
  const allPageSelected = pageCandidates.length > 0 && pageCandidates.every((product) => selection.has(product.id));
  const somePageSelected = pageCandidates.some((product) => selection.has(product.id));
  const batchUnavailable = saving ? "请先完成当前操作。"
    : !current ? "正在加载商品…"
      : "error" in current ? "请重新加载商品后再试。"
        : current.data.total === 0 ? "当前分类暂无商品。"
          : pageCandidates.length === 0 ? "本页没有可移动的商品。" : undefined;

  useImperativeHandle(batchSelectionCountRef, () => selection.size, [selection.size]);

  useEffect(() => {
    if (selecting) selectPage.current?.focus();
  }, [selecting]);

  function toggleSelection(products: ProductListItem[], checked: boolean) {
    const next = new Map(selection);
    for (const product of products) {
      if (checked) next.set(product.id, product);
      else next.delete(product.id);
    }
    if (next.size > MAX_SELECTION) {
      message.warning(`一次最多移动 ${MAX_SELECTION} 件商品。`);
      return;
    }
    setSelection(next);
  }

  return (
    <section className="cat-products" id="category-products-preview" aria-labelledby="category-products-title">
      <header className="cat-products__header">
        <div className="cat-products__path">
          <FolderOpenOutlined aria-hidden="true" />
          <span>{pathLabel}</span>
        </div>
        <div className="cat-products__title">
          <div>
            <h2 id="category-products-title" ref={titleRef} tabIndex={-1}>{unclassified ? "未分类" : category.name}的商品</h2>
            <p>
              {manageableCount === undefined ? "商品预览" : `共 ${manageableCount} 件商品`}
              {` · ${scopeSummary}`}
              {historicalCount > 0 ? ` · 另有 ${historicalCount} 件在回收站或已删除` : ""}
            </p>
          </div>
          {!selecting ? (
            <div className="cat-products__batch">
              <Button
                ref={batchButton}
                disabled={!!batchUnavailable}
                aria-describedby={batchUnavailable ? "category-batch-reason" : undefined}
                onClick={() => setSelecting(true)}
              >批量改分类</Button>
              {batchUnavailable ? <span id="category-batch-reason" className="cat-products__batch-reason">{batchUnavailable}</span> : null}
            </div>
          ) : null}
        </div>
        {(hasChildren && !isPrimaryCategory) || (data && data.total > PAGE_SIZE) ? (
          <div className="cat-products__scope">
            {hasChildren && !isPrimaryCategory ? (
              <Radio.Group aria-label="商品归属范围" value={onlyDirect ? "direct" : "branch"} disabled={saving || selecting}
                onChange={(event) => {
                  setOnlyDirect(event.target.value === "direct");
                  setPage(1);
                }}>
                <Radio.Button value="branch">本级及下级</Radio.Button>
                <Radio.Button value="direct">仅本级</Radio.Button>
              </Radio.Group>
            ) : null}
            {data && data.total > PAGE_SIZE ? (
              <span>当前显示第 {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + data.list.length} 件</span>
            ) : null}
          </div>
        ) : null}
        {unclassified && !!manageableCount ? (
          <p className="cat-products__scope-note">这些商品只归在「{category.name}」一级，可用「批量改分类」把它们归到对应的二级类目。</p>
        ) : null}
        {selecting ? (
          <div className="cat-batch-toolbar">
            <Checkbox
              ref={selectPage}
              checked={allPageSelected}
              indeterminate={somePageSelected && !allPageSelected}
              disabled={saving || !pageCandidates.length}
              onChange={(event) => toggleSelection(pageCandidates, event.target.checked)}
            >选择本页可移动商品</Checkbox>
            <span aria-live="polite">已选 {selection.size} 件</span>
            {!saving && batchUnavailable ? <span className="cat-products__batch-reason">{batchUnavailable}</span> : null}
            <div className="cat-row__actions">
              <Button disabled={saving} onClick={() => {
                setSelecting(false);
                setSelection(new Map());
                requestAnimationFrame(() => batchButton.current?.focus());
              }}>取消选择</Button>
              <Button type="primary" disabled={saving || !selection.size} onClick={() => setMoveOpen(true)}>选择目标分类</Button>
            </div>
          </div>
        ) : null}
      </header>

      {!current ? <AdminLoadingState subject="商品" compact /> : "error" in current ? (
        <AdminErrorState subject="商品" error={current.error} onRetry={reload} />
      ) : current.data.list.length === 0 ? (
        <AdminEmptyState subject="商品" description={historicalCount > 0
          ? `此分类关联的 ${historicalCount} 件商品均在回收站或已删除。`
          : "此分类范围内暂无可管理的商品。"} />
      ) : (
        <div className="cat-products__groups">
          {[...order].map((id) => {
            const products = productsByCategory.get(id);
            if (!products?.length) return null;
            const groupPath = getCategoryPath(tree, id).map((node) => node.name).join(" / ");
              const directGroup = isPrimaryCategory && id === category.id;
              const groupName = directGroup ? `${groupPath} / 未分类` : groupPath || products[0].category?.name || "商品所属分类待刷新";
            return (
              <div className="cat-products__group" key={id}>
                {includeDescendants ? (
                  <div className="cat-products__group-head">
                    <h3><FolderOpenOutlined aria-hidden="true" /> {directGroup ? "未分类" : groupName}</h3>
                    <span>{id === category.id && !isPrimaryCategory ? "直接归属本级 · " : ""}{data && data.total > PAGE_SIZE ? "本页 " : ""}{products.length} 件</span>
                  </div>
                ) : null}
                <ul className="cat-products__grid" aria-label={includeDescendants ? groupName : "商品预览"}>
                  {products.map((product) => (
                    <CategoryProductCard
                      key={product.id}
                      product={product}
                      onView={() => onViewProduct(product)}
                      selection={selecting ? {
                        checked: selection.has(product.id),
                        disabled: saving || !canMove(product),
                        onChange: (checked) => toggleSelection([product], checked),
                      } : undefined}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <footer className="cat-products__footer">
        <div className="cat-row__actions">
          <Link to={categoryProductsPath(category, undefined, includeDescendants)}>在商品管理中查看 <ArrowRightOutlined aria-hidden="true" /></Link>
          {historicalCount > 0 ? <Link to={categoryProductsPath(category, "ARCHIVED", includeDescendants)}>查看此分类回收站</Link> : null}
        </div>
        {data && data.total > PAGE_SIZE ? (
          <Pagination current={page} pageSize={PAGE_SIZE} total={data.total} showSizeChanger={false} size="small" onChange={setPage} />
        ) : null}
      </footer>
      {moveOpen ? (
        <CategoryBatchMoveDialog
          products={[...selection.values()]}
          tree={tree}
          onCancel={() => setMoveOpen(false)}
          onBusyChange={onBatchBusyChange}
          onApplied={async (completedIds, moved, failed) => {
            setSelection((currentSelection) => {
              const remaining = new Map(currentSelection);
              completedIds.forEach((id) => remaining.delete(id));
              return remaining;
            });
            if (failed === 0) {
              setMoveOpen(false);
              setSelecting(false);
              message.success(`已移动 ${moved} 件商品。`);
            } else if (moved > 0) {
              message.warning(`已移动 ${moved} 件，${failed} 件未移动。`);
            }
            if (moved > 0) await onBatchRefresh();
          }}
        />
      ) : null}
    </section>
  );
}

function CategoryProductCard({ product, onView, selection }: {
  product: ProductListItem;
  onView: () => void;
  selection?: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void };
}) {
  const status = product.reviewStatus === "IN_REVIEW"
    ? { label: "审核中", color: "blue" }
    : statusMeta[product.status] ?? { label: "未知状态", color: "default" };
  const cardContent = (
    <>
        <span className="cat-product__media">
          <SecureImage
            src={getThumbnailImage(product)}
            fallback={productPlaceholder(product.id, product.name)}
            alt=""
            tokenKind="staff"
            deferUntilVisible
            className="cat-product__image"
          />
        </span>
        <span className="cat-product__body">
          <strong className="cat-product__name">{product.name}</strong>
          <span className="cat-product__meta">款号 {product.code}</span>
          <span className="cat-product__meta">{getMaterialLabel(product.materialType)}</span>
          <span className="cat-product__status">
            <Tag color={status.color}>{status.label}</Tag>
            {Number(product.price) > 0 ? <span className="cat-product__meta">SKU 最低价 {formatPrice(product.price)}</span> : null}
          </span>
        </span>
    </>
  );
  return (
    <li className={`cat-product${selection?.checked ? " cat-product--checked" : ""}`}>
      {selection ? (
        <label className={`cat-product__link cat-product__choice${selection.disabled ? " cat-product__choice--disabled" : ""}`}>
          <span className="cat-product__checkbox">
            <input
              type="checkbox"
              aria-label={`选择商品「${product.name}」，款号 ${product.code}`}
              checked={selection.checked}
              disabled={selection.disabled}
              onChange={(event) => selection.onChange(event.target.checked)}
            />
          </span>
          {cardContent}
        </label>
      ) : (
        <button type="button" className="cat-product__link" onClick={onView}
          aria-label={`查看商品「${product.name}」，款号 ${product.code}`}>
          {cardContent}
        </button>
      )}
    </li>
  );
}
