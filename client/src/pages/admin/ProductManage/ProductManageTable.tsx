import type { Key } from "react";
import {
  Button,
  Dropdown,
  Progress,
  Space,
  Table,
  Tag,
  Tooltip,
  type TableColumnsType,
} from "antd";
import { DownOutlined } from "@ant-design/icons";
import { SecureImage } from "@/components/common/SecureImage";
import { getAdminEmptyText } from "@/constants/adminCopy";
import type { Product, ProductStatus } from "@/types";
import { formatPrice } from "@/utils/format";
import { getMaterialLabel } from "@/utils/material";
import { getThumbnailImage } from "@/utils/productImage";
import { productPlaceholder } from "@/utils/placeholder";
import {
  completenessFieldLabels,
  formatProductDate,
  salesModeLabels,
  statusMeta,
  type ProductListItem,
} from "./productManageModel";

type ProductManageTableProps = {
  products: ProductListItem[];
  loading: boolean;
  selectedIds: Key[];
  batchProcessing: boolean;
  pendingProductId: number | null;
  hasFilters: boolean;
  canGovernPublic: boolean;
  onSelectionChange: (keys: Key[]) => void;
  onOpenEdit: (product: Product) => void;
  onClone: (product: Product) => void | Promise<void>;
  onRequestStatusChange: (
    product: Product,
    status: ProductStatus,
  ) => void;
  onConfirmArchive: (product: Product) => void;
  onConfirmRestore: (product: Product) => void;
  onSubmitForReview: (product: Product) => void;
};

export default function ProductManageTable({
  products,
  loading,
  selectedIds,
  batchProcessing,
  pendingProductId,
  hasFilters,
  canGovernPublic,
  onSelectionChange,
  onOpenEdit,
  onClone,
  onRequestStatusChange,
  onConfirmArchive,
  onConfirmRestore,
  onSubmitForReview,
}: ProductManageTableProps) {
  const columns: TableColumnsType<ProductListItem> = [
      {
        title: "商品名称",
        key: "product",
        width: 330,
        render: (_: unknown, product: ProductListItem) => {
          const image = getThumbnailImage(product);
          return (
            <div className="product-manage__product-cell">
              <SecureImage
                src={image}
                fallback={productPlaceholder(product.id, product.name)}
                alt=""
                className="product-manage__thumbnail"
                tokenKind="staff"
              />
              <div className="product-manage__product-copy">
                <button
                  type="button"
                  onClick={() => onOpenEdit(product)}
                  className="product-manage__product-name"
                >
                  {product.name}
                </button>
                <div className="product-manage__product-meta">
                  货号：{product.code}
                </div>
                <div className="product-manage__product-meta">
                  {product.category?.name || "未分类"} ·{" "}
                  {getMaterialLabel(product.materialType)}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        title: "SKU 最低价",
        key: "price",
        width: 110,
        render: (_: unknown, product: ProductListItem) => (
          <span className="product-manage__price">
            {Number(product.price) > 0 ? formatPrice(product.price) : "—"}
          </span>
        ),
      },
      {
        title: "资料完整度",
        key: "completeness",
        width: 130,
        render: (_: unknown, product: ProductListItem) => {
          const c = product.completeness;
          const missing = c?.missingFields?.map((field) => completenessFieldLabels[field] || field) || [];
          return c ? (
            <Tooltip title={c.isComplete ? "资料已完整" : missing.length ? `待补充：${missing.join("、")}` : "仍有资料待补充"}>
              <Progress
                size="small"
                percent={c.score}
                status={c.isComplete ? "success" : "active"}
                format={() => `${c.score}%`}
              />
            </Tooltip>
          ) : (
            "—"
          );
        },
      },
      {
        title: "库存",
        key: "stock",
        width: 190,
        render: (_: unknown, product: ProductListItem) => (
          <Space size={4} wrap>
            <span>{product.totalStock ?? "—"}</span>
            {product.salesMode === "DIRECT_PURCHASE" && product.totalStock === 0 && (
              <Tag color="default">售罄 / 不可加入购物车</Tag>
            )}
          </Space>
        ),
      },
      {
        title: "累计销量",
        key: "sales",
        width: 108,
        render: (_: unknown, product: ProductListItem) => product.salesCount || 0,
      },
      {
        title: "销售方式",
        key: "salesMode",
        width: 120,
        render: (_: unknown, product: ProductListItem) => (
          <div>
            <div>{salesModeLabels[product.salesMode || ""] || "—"}</div>
            <span className="product-manage__product-meta">
              {product.inventoryPolicy === "SINGLE_UNIT" ? "一物一件" : "标准库存"}
            </span>
          </div>
        ),
      },
      {
        title: "创建时间",
        key: "created",
        width: 165,
        render: (_: unknown, product: ProductListItem) => formatProductDate(product.createdAt),
      },
      {
        title: "发布时间",
        key: "published",
        width: 165,
        render: (_: unknown, product: ProductListItem) =>
          product.publishedAt ? formatProductDate(product.publishedAt) : "—",
      },
      {
        title: "状态",
        key: "status",
        width: 92,
        render: (_: unknown, product: ProductListItem) => {
          if (product.reviewStatus === "IN_REVIEW") {
            return <Tag color="blue">审核中</Tag>;
          }
          const meta = statusMeta[product.status as ProductStatus] || { label: product.status || "未知状态", color: "default" as const };
          return <Tag color={meta.color}>{meta.label}</Tag>;
        },
      },
      {
        title: "操作",
        key: "actions",
        fixed: "right" as const,
        width: 210,
        render: (_: unknown, product: ProductListItem) => {
          const rowPending = pendingProductId === product.id;
          const reviewLocked = product.reviewStatus === "IN_REVIEW";
          return (
          <Space className="product-manage__row-actions" size={10} wrap>
            {product.status === "ARCHIVED" ? (
              /* 回收站商品只读：仅提供查看与恢复为草稿，不提供编辑/发布/下架/软删除等操作 */
              <>
                <Button
                  type="link"
                  size="small"
                  className="product-manage__action-link"
                  onClick={() => onOpenEdit(product)}
                  disabled={rowPending}
                >
                  查看
                </Button>
                <Button
                  type="link"
                  size="small"
                  className="product-manage__action-link"
                  onClick={() => onConfirmRestore(product)}
                  loading={rowPending}
                  disabled={pendingProductId !== null && !rowPending}
                >
                  恢复草稿
                </Button>
              </>
            ) : (
              /* 正常商品：编辑/复制 + 上架下架 + 移入回收站（去掉了原来和移入回收站语义重复的「删除」） */
              <>
                <Button
                  type="link"
                  size="small"
                  className="product-manage__action-link"
                  onClick={() => onOpenEdit(product)}
                  disabled={rowPending}
                >
                  {reviewLocked ? "查看审核" : "编辑商品"}
                </Button>
                <Button
                  type="link"
                  size="small"
                  className="product-manage__action-link"
                  onClick={() => void onClone(product)}
                  disabled={rowPending}
                >
                  复制
                </Button>
                {canGovernPublic && reviewLocked ? (
                  <>
                    <Button
                      type="link"
                      size="small"
                      className="product-manage__action-link"
                      onClick={() => onRequestStatusChange(product, "PUBLISHED")}
                      loading={rowPending}
                      disabled={pendingProductId !== null && !rowPending}
                    >
                      通过并上架
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      className="product-manage__action-link"
                      onClick={() => onRequestStatusChange(product, "DRAFT")}
                      loading={rowPending}
                      disabled={pendingProductId !== null && !rowPending}
                    >
                      退回修改
                    </Button>
                  </>
                ) : canGovernPublic && product.status === "PUBLISHED" ? (
                  <Button
                    type="link"
                    size="small"
                    className="product-manage__action-link"
                    onClick={() => onRequestStatusChange(product, "OFFLINE")}
                    loading={rowPending}
                    disabled={pendingProductId !== null && !rowPending}
                  >
                    下架
                  </Button>
                ) : canGovernPublic ? (
                  <Button
                    type="link"
                    size="small"
                    className="product-manage__action-link"
                    onClick={() => onRequestStatusChange(product, "PUBLISHED")}
                    loading={rowPending}
                    disabled={pendingProductId !== null && !rowPending}
                  >
                    上架
                  </Button>
                ) : product.status === "DRAFT" && !reviewLocked ? (
                  <Button
                    type="link"
                    size="small"
                    className="product-manage__action-link"
                    onClick={() => onSubmitForReview(product)}
                    loading={rowPending}
                    disabled={pendingProductId !== null && !rowPending}
                  >
                    提交审核
                  </Button>
                ) : null}
                {!reviewLocked && (canGovernPublic || product.status === "DRAFT") ? <Dropdown
                  overlayClassName="product-manage__dropdown"
                  disabled={pendingProductId !== null}
                  menu={{
                    items: [
                      {
                        key: "archive",
                        label: "移入回收站",
                        disabled: pendingProductId !== null,
                        onClick: () => onConfirmArchive(product),
                      },
                    ],
                  }}
                >
                  <Button type="link" size="small" className="product-manage__action-link" loading={rowPending}>
                    更多 <DownOutlined />
                  </Button>
                </Dropdown> : null}
              </>
            )}
          </Space>
          );
        },
      },
  ];

  return (
    <Table
      rowKey="id"
      loading={loading}
      dataSource={products}
      columns={columns}
      pagination={false}
      className="product-manage__table"
      scroll={{ x: 1500 }}
      rowSelection={{
        selectedRowKeys: selectedIds,
        onChange: onSelectionChange,
        getCheckboxProps: (product) => ({
          disabled: batchProcessing || pendingProductId !== null || (!canGovernPublic && product.reviewStatus === "IN_REVIEW"),
        }),
      }}
      locale={{
        emptyText: hasFilters
          ? getAdminEmptyText("商品", true)
          : "暂无商品，点击“新建商品”开始添加。",
      }}
    />
  );
}
