import { useCallback, useEffect, useMemo, useState } from "react";
import type { Key } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Dropdown,
  Input,
  Pagination,
  Progress,
  Result,
  Select,
  Space,
  Table,
  Tag,
  message,
} from "antd";
import {
  DownOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { categoryApi, productApi } from "@/services/api";
import { getMaterialLabel } from "@/utils/material";
import { formatPrice } from "@/utils/format";
import { getThumbnailImage } from "@/utils/productImage";
import { productPlaceholder } from "@/utils/placeholder";
import type { Category, Product, ProductStatus } from "@/types";
import ScifiButton from "@/components/ui/ScifiButton";
import { unwrapResponse } from "@/utils/unwrap";

const statusMeta: Record<ProductStatus, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "default" },
  PUBLISHED: { label: "出售中", color: "green" },
  OFFLINE: { label: "仓库中", color: "gold" },
  ARCHIVED: { label: "回收站", color: "default" },
};

const statuses: ProductStatus[] = ["PUBLISHED", "OFFLINE", "DRAFT", "ARCHIVED"];

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value)
    .toLocaleString("zh-CN", { hour12: false })
    .replace(/\//g, "-");
}

export default function ProductManage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeStatus, setActiveStatus] = useState<ProductStatus | undefined>();
  const [titleKeyword, setTitleKeyword] = useState("");
  const [codeKeyword, setCodeKeyword] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [categoryOptions, setCategoryOptions] = useState<
    { value: number; label: string }[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [debouncedKeyword, setDebouncedKeyword] = useState("");

  const keyword = titleKeyword || codeKeyword;
  const hasFilters = Boolean(
    titleKeyword || codeKeyword || categoryId || activeStatus,
  );

  const loadCategories = useCallback(async () => {
    try {
      const response = await categoryApi.getTree();
      const options: { value: number; label: string }[] = [];
      const walk = (nodes: Category[], parentLabel = "") => {
        nodes.forEach((node) => {
          const label = parentLabel
            ? `${parentLabel} / ${node.name}`
            : node.name;
          options.push({ value: node.id, label });
          if (node.children?.length) walk(node.children, label);
        });
      };
      walk(unwrapResponse<Category[]>(response) || []);
      setCategoryOptions(options);
    } catch (err: any) {
      console.error("加载分类失败:", err);
      message.error(err?.message || "分类数据加载失败，请刷新页面重试");
      setCategoryOptions([]);
    }
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const response = await productApi.getCounts();
      const data = unwrapResponse<Record<string, number>>(response);
      setCounts(data || {});
    } catch (err: any) {
      console.error("加载统计数量失败:", err);
      message.error(err?.message || "商品统计数量加载失败，请刷新页面重试");
      setCounts({});
    }
  }, []);

  const loadProducts = useCallback(
    async (
      targetPage?: number,
      overrides?: {
        status?: ProductStatus;
        categoryId?: number;
        keyword?: string;
      },
    ) => {
      setLoading(true);
      setError(null);
      try {
        const p = targetPage ?? page;
        const params: Record<string, unknown> = { page: p, pageSize };
        const s = overrides?.status ?? activeStatus;
        if (s) params.status = s;
        const cid = overrides?.categoryId ?? categoryId;
        if (cid) params.categoryId = cid;
        const kw = overrides?.keyword ?? debouncedKeyword;
        if (kw) params.keyword = kw;
        const response = await productApi.getList(params);
        const data = unwrapResponse<{ list: Product[]; total: number }>(
          response,
        );
        setProducts(data?.list || []);
        setTotal(data?.total || 0);
      } catch (requestError: any) {
        setError(
          requestError?.message || "商品数据加载失败，请检查服务后重试。",
        );
        setProducts([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [activeStatus, categoryId, debouncedKeyword, page, pageSize],
  );

  useEffect(() => {
    void loadCategories();
    void loadCounts();
  }, [loadCategories, loadCounts]);

  // 关键词防抖：输入即时回显，请求延后 450ms，避免每次按键都打请求
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 450);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const resetFilters = () => {
    setTitleKeyword("");
    setCodeKeyword("");
    setCategoryId(undefined);
    setActiveStatus(undefined);
    setPage(1);
  };

  const search = () => {
    setPage(1);
    void loadProducts(1, { keyword });
  };

  const changeStatus = async (id: number, status: ProductStatus) => {
    try {
      await productApi.updateStatus(id, status);
      message.success(
        status === "PUBLISHED"
          ? "商品已上架"
          : status === "OFFLINE"
            ? "商品已移入仓库"
            : "商品状态已更新",
      );
      await Promise.all([loadProducts(), loadCounts()]);
    } catch (requestError: any) {
      console.error("更新商品状态失败:", requestError);
      message.error(requestError?.message || "状态更新失败");
    }
  };

  const deleteProduct = async (product: Product) => {
    try {
      await productApi.updateStatus(product.id, "ARCHIVED");
      message.success(`已将「${product.name}」移入回收站`);
      setSelectedIds((ids) => ids.filter((id) => id !== product.id));
      await Promise.all([
        loadProducts(products.length === 1 && page > 1 ? page - 1 : page),
        loadCounts(),
      ]);
    } catch (requestError: any) {
      console.error("移入回收站失败:", requestError);
      message.error(requestError?.message || "移入回收站失败");
    }
  };

  const changeSelectedStatus = async (status: ProductStatus) => {
    if (!selectedIds.length) {
      message.warning("请先选择商品，再进行批量操作");
      return;
    }
    try {
      await Promise.all(
        selectedIds.map((id) => productApi.updateStatus(Number(id), status)),
      );
      message.success(`已处理 ${selectedIds.length} 件商品`);
      setSelectedIds([]);
      await Promise.all([loadProducts(), loadCounts()]);
    } catch (requestError: any) {
      console.error("批量更新状态失败:", requestError);
      message.error(requestError?.message || "批量操作失败，请稍后重试");
    }
  };

  const batchDelete = async () => {
    if (!selectedIds.length) {
      message.warning("请先选择商品，再进行批量删除");
      return;
    }
    try {
      await Promise.all(
        selectedIds.map((id) =>
          productApi.updateStatus(Number(id), "ARCHIVED"),
        ),
      );
      message.success(`已将 ${selectedIds.length} 件商品移入回收站`);
      setSelectedIds([]);
      await Promise.all([loadProducts(), loadCounts()]);
    } catch (requestError: any) {
      console.error("批量移入回收站失败:", requestError);
      message.error(requestError?.message || "批量操作失败，请稍后重试");
    }
  };

  const openCreate = useCallback(() => {
    navigate("/admin/products/new");
  }, [navigate]);

  const openEdit = useCallback(
    (product: Product) => {
      navigate(`/admin/products/${product.id}/edit`);
    },
    [navigate],
  );

  const cloneProduct = async (product: Product) => {
    try {
      const newCode = `HC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const pick = <K extends keyof Product>(key: K) => product[key];
      const created = unwrapResponse<Product>(
        await productApi.create({
          name: `${product.name}（副本）`,
          code: newCode,
          categoryId: pick("categoryId"),
          materialType: pick("materialType"),
          shortDescription: pick("shortDescription"),
          description: pick("description"),
          goldWeight: pick("goldWeight"),
          weight: pick("weight"),
          size: pick("size"),
          price: pick("price"),
          priceMin: pick("priceMin"),
          priceMax: pick("priceMax"),
          craftFee: pick("craftFee"),
          gemInfo: pick("gemInfo"),
          craftTechnique: pick("craftTechnique"),
          sortOrder: pick("sortOrder"),
          salesMode: pick("salesMode"),
          status: "DRAFT" as const,
          isHot: pick("isHot"),
          isNew: pick("isNew"),
          isRecommended: pick("isRecommended"),
          isLimited: pick("isLimited"),
          isCustom: pick("isCustom"),
        }),
      );
      if (created?.id) {
        // 复制子资源：图片（共用文件源）、证书、标签、启用中的 SKU
        const suffix = Date.now().toString(36).toUpperCase().slice(-4);
        const subTasks: Promise<unknown>[] = [
          ...(product.images || []).map((img) =>
            productApi.addImage(created.id, {
              url: img.url,
              type: img.type,
              sortOrder: img.sortOrder,
              isVideo: img.isVideo,
            }),
          ),
          ...(product.certificates || []).map((cert) =>
            productApi.addCertificate(created.id, {
              certType: cert.certType,
              certNumber: cert.certNumber,
              certImage: cert.certImage,
              expireDate: cert.expireDate,
            }),
          ),
          ...(product.skus || [])
            .filter((s) => s.isActive)
            .map((sku, i) =>
              productApi.createSku(created.id, {
                skuCode: `${sku.skuCode}-${suffix}${i}`.slice(0, 100),
                material: sku.material,
                size: sku.size,
                goldWeight: sku.goldWeight,
                price: sku.price,
                stock: sku.stock,
                safetyStock: sku.safetyStock,
                isActive: true,
              }),
            ),
          productApi.updateTags(
            created.id,
            (product.tags || []).map((t) => t.tagName),
          ),
        ];
        const results = await Promise.allSettled(subTasks);
        const failedCount = results.filter(
          (r) => r.status === "rejected",
        ).length;
        message.success(
          failedCount === 0
            ? `已复制为「${created.name}」`
            : `已复制为「${created.name}」，但 ${failedCount} 项子资源复制失败，请在编辑页核对`,
        );
        navigate(`/admin/products/${created.id}/edit`);
        void loadProducts();
        void loadCounts();
      } else {
        message.error("复制失败：服务端未返回有效的商品数据，请重试");
      }
    } catch (requestError: any) {
      console.error("复制商品失败:", requestError);
      message.error(requestError?.message || "复制失败");
    }
  };

  const columns = useMemo(
    () => [
      {
        title: "商品名称",
        key: "product",
        width: 380,
        render: (_: unknown, product: Product) => {
          const image = getThumbnailImage(product as any);
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img
                src={image || productPlaceholder(product.id, product.name)}
                alt=""
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 4,
                  objectFit: "cover",
                  background: "#f5f5f5",
                }}
                onError={(event) => {
                  event.currentTarget.src = productPlaceholder(
                    product.id,
                    product.name,
                  );
                }}
              />
              <div style={{ minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => openEdit(product)}
                  style={{
                    border: 0,
                    padding: 0,
                    background: "transparent",
                    color: "#262626",
                    fontWeight: 500,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  {product.name}
                </button>
                <div style={{ marginTop: 5, color: "#8c8c8c", fontSize: 12 }}>
                  货号：{product.code}
                </div>
                <div style={{ marginTop: 3, color: "#8c8c8c", fontSize: 12 }}>
                  {product.category?.name || "未分类"} ·{" "}
                  {getMaterialLabel(product.materialType)}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        title: "价格",
        key: "price",
        width: 135,
        render: (_: unknown, product: Product) => (
          <span style={{ color: product.price ? "#c2410c" : "#8c8c8c" }}>
            {formatPrice(product.price)}
          </span>
        ),
      },
      {
        title: "完整度",
        key: "completeness",
        width: 90,
        render: (_: unknown, product: any) => {
          const c = product.completeness;
          return c ? (
            <Progress
              size="small"
              percent={c.score}
              status={c.isComplete ? "success" : "active"}
              format={() => `${c.score}%`}
            />
          ) : (
            "—"
          );
        },
      },
      {
        title: "库存",
        key: "stock",
        width: 90,
        render: (_: unknown, product: any) => product.totalStock ?? "—",
      },
      {
        title: "累计销量",
        key: "sales",
        width: 120,
        render: (_: unknown, product: Product) => product.salesCount || 0,
      },
      {
        title: "浏览量",
        key: "views",
        width: 105,
        render: (_: unknown, product: Product) => product.viewCount || 0,
      },
      {
        title: "创建时间",
        key: "created",
        width: 175,
        render: (_: unknown, product: Product) => formatDate(product.createdAt),
      },
      {
        title: "状态",
        key: "status",
        width: 105,
        render: (_: unknown, product: Product) => {
          const meta = statusMeta[product.status as ProductStatus] || { label: product.status || "未知状态", color: "default" as const };
          return <Tag color={meta.color}>{meta.label}</Tag>;
        },
      },
      {
        title: "操作",
        key: "actions",
        fixed: "right" as const,
        width: 210,
        render: (_: unknown, product: Product) => (
          <Space size={8} wrap>
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              onClick={() => openEdit(product)}
            >
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              style={{ padding: 0 }}
              onClick={() => void cloneProduct(product)}
            >
              复制
            </Button>
            {product.status !== "PUBLISHED" && product.status !== "ARCHIVED" ? (
              <Button
                type="link"
                size="small"
                style={{ padding: 0 }}
                onClick={() => void changeStatus(product.id, "PUBLISHED")}
              >
                上架
              </Button>
            ) : product.status === "PUBLISHED" ? (
              <Button
                type="link"
                size="small"
                style={{ padding: 0 }}
                onClick={() => void changeStatus(product.id, "OFFLINE")}
              >
                下架
              </Button>
            ) : null}
            <Dropdown
              menu={{
                items: [
                  {
                    key: "archive",
                    label: (
                      <span
                        onClick={() =>
                          void changeStatus(product.id, "ARCHIVED")
                        }
                      >
                        移入回收站
                      </span>
                    ),
                  },
                  {
                    key: "delete",
                    danger: true,
                    label: (
                      <span onClick={() => void deleteProduct(product)}>
                        删除
                      </span>
                    ),
                  },
                ],
              }}
            >
              <Button type="link" size="small" style={{ padding: 0 }}>
                更多 <DownOutlined />
              </Button>
            </Dropdown>
          </Space>
        ),
      },
    ],
    [openEdit],
  );

  const tabs = [
    { key: "all", label: `全部 (${counts.all ?? total})` },
    ...statuses.map((status) => ({
      key: status,
      label: `${statusMeta[status].label} (${counts[status] ?? 0})`,
    })),
  ];

  return (
    <div style={{ padding: "18px 26px 48px", maxWidth: 1800 }}>
      <div
        style={{
          display: "flex",
          gap: 28,
          height: 45,
          alignItems: "flex-start",
          borderBottom: "1px solid #e8e8e8",
          marginBottom: 20,
        }}
      >
        {tabs.map((tab) => {
          const selected = (activeStatus || "all") === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveStatus(
                  tab.key === "all" ? undefined : (tab.key as ProductStatus),
                );
                setPage(1);
              }}
              style={{
                height: 45,
                padding: "0 2px",
                border: 0,
                borderBottom: selected
                  ? "2px solid #1677ff"
                  : "2px solid transparent",
                background: "transparent",
                color: selected ? "#1677ff" : "#595959",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(180px, 1fr) minmax(180px, 1fr) minmax(160px, 1fr) minmax(180px, 1fr) auto auto",
          gap: 10,
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <Input
          placeholder="商品标题"
          value={titleKeyword}
          allowClear
          onChange={(event) => setTitleKeyword(event.target.value)}
          onPressEnter={search}
        />
        <Input
          placeholder="商品ID、货号"
          value={codeKeyword}
          allowClear
          onChange={(event) => setCodeKeyword(event.target.value)}
          onPressEnter={search}
        />
        <Select
          placeholder="店铺分类"
          value={categoryId}
          onChange={(value) => {
            setCategoryId(value);
            setPage(1);
          }}
          allowClear
          showSearch
          optionFilterProp="label"
          options={categoryOptions}
        />
        <Button type="primary" onClick={search}>
          搜索
        </Button>
        <Button onClick={resetFilters}>重置</Button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <Space wrap>
          <ScifiButton variant="gold" onClick={openCreate}>
            <PlusOutlined /> 新增商品
          </ScifiButton>
          <Button
            disabled={!selectedIds.length}
            onClick={() => void changeSelectedStatus("OFFLINE")}
          >
            批量下架
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: "published",
                  label: "批量上架",
                  onClick: () => void changeSelectedStatus("PUBLISHED"),
                },
                {
                  key: "delete",
                  label: "移入回收站",
                  danger: true,
                  onClick: () => void batchDelete(),
                },
              ],
            }}
          >
            <Button disabled={!selectedIds.length}>
              更多批量操作 <DownOutlined />
            </Button>
          </Dropdown>
          {selectedIds.length > 0 && (
            <span style={{ color: "#595959", fontSize: 13 }}>
              已选 {selectedIds.length} 件
            </span>
          )}
        </Space>
        <span style={{ color: "#595959", fontSize: 13 }}>
          共 {total} 件商品
        </span>
      </div>

      {error ? (
        <Result
          status="error"
          title="商品加载失败"
          subTitle={error}
          extra={
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void loadProducts()}
            >
              重新加载
            </Button>
          }
        />
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={products}
          columns={columns}
          pagination={false}
          scroll={{ x: 1400 }}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: setSelectedIds,
          }}
          locale={{
            emptyText: hasFilters
              ? "没有符合当前筛选条件的商品"
              : "暂无商品，点击“新增商品”开始添加",
          }}
          style={{ background: "#fff" }}
        />
      )}

      {!error && total > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            paddingTop: 18,
          }}
        >
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            showQuickJumper
            showTotal={(value) => `共 ${value} 件商品`}
            onChange={(nextPage, nextSize) => {
              setPage(nextPage);
              setPageSize(nextSize);
            }}
          />
        </div>
      )}
    </div>
  );
}
