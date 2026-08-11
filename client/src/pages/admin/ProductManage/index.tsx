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
  Modal,
} from "antd";
import {
  DownOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { categoryApi, productApi } from "@/services/api";
import { getMaterialLabel } from "@/utils/material";
import { formatPrice } from "@/utils/format";
import { getThumbnailImage } from "@/utils/productImage";
import { productPlaceholder } from "@/utils/placeholder";
import type { Category, Product, ProductStatus } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import "./ProductManage.css";

type ProductListItem = Product & {
  totalStock?: number;
  publishedAt?: string | null;
  completeness?: {
    score: number;
    isComplete: boolean;
  };
};

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
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeStatus, setActiveStatus] = useState<ProductStatus | undefined>();
  const [titleKeyword, setTitleKeyword] = useState("");
  const [codeKeyword, setCodeKeyword] = useState("");
  const [merchantCodeKeyword, setMerchantCodeKeyword] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [categoryOptions, setCategoryOptions] = useState<
    { value: number; label: string }[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [creating, setCreating] = useState(false);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [qualityScope, setQualityScope] = useState<
    "all" | "incomplete" | "complete"
  >("all");
  const [sortBy, setSortBy] = useState<"updatedAt" | "sortOrder">(
    "updatedAt",
  );

  const keyword = titleKeyword || codeKeyword || merchantCodeKeyword;
  const productIdSearch = codeKeyword
    .split(/[，,\s]+/)
    .map((id) => id.trim())
    .filter(Boolean);
  const isProductIdSearch =
    productIdSearch.length > 0 && productIdSearch.every((id) => /^\d+$/.test(id));
  const hasFilters = Boolean(
    titleKeyword || codeKeyword || merchantCodeKeyword || categoryId || activeStatus || qualityScope !== "all",
  );
  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        if (qualityScope === "all") return true;
        const score = product.completeness?.score ?? 0;
        return qualityScope === "complete" ? score >= 100 : score < 100;
      }),
    [products, qualityScope],
  );
  const qualityIssueCount = useMemo(
    () =>
      products.filter((product) => (product.completeness?.score ?? 0) < 100)
        .length,
    [products],
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
    } finally {
      setCategoriesLoaded(true);
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
        const params: Record<string, unknown> = { page: p, pageSize, sortBy };
        const s = overrides?.status ?? activeStatus;
        if (s) params.status = s;
        const cid = overrides?.categoryId ?? categoryId;
        if (cid) params.categoryId = cid;
        const kw = overrides?.keyword ?? debouncedKeyword;
        if (isProductIdSearch && !titleKeyword && !merchantCodeKeyword) {
          params.ids = productIdSearch.join(",");
        } else if (kw) {
          params.keyword = kw;
        }
        const response = await productApi.getList(params);
        const data = unwrapResponse<{ list: ProductListItem[]; total: number }>(
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
    [
      activeStatus,
      categoryId,
      debouncedKeyword,
      isProductIdSearch,
      merchantCodeKeyword,
      page,
      pageSize,
      productIdSearch,
      sortBy,
      titleKeyword,
    ],
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
    setMerchantCodeKeyword("");
    setCategoryId(undefined);
    setActiveStatus(undefined);
    setQualityScope("all");
    setSortBy("updatedAt");
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

  // 彻底删除：调用后端 DELETE（deletedAt 软删、不可恢复），激活原本零调用的 productApi.delete
  const realDelete = async (product: Product) => {
    try {
      await productApi.delete(product.id);
      message.success(`已彻底删除「${product.name}」`);
      setSelectedIds((ids) => ids.filter((id) => id !== product.id));
      await Promise.all([
        loadProducts(products.length === 1 && page > 1 ? page - 1 : page),
        loadCounts(),
      ]);
    } catch (requestError: any) {
      console.error("彻底删除失败:", requestError);
      message.error(requestError?.message || "彻底删除失败");
    }
  };

  // 危险/不可逆操作统一走 Modal.confirm（Dropdown 嵌套 Popconfirm 会因 menu 关闭而失效）
  const confirmArchive = (product: Product) =>
    Modal.confirm({
      title: "移入回收站",
      content: `将「${product.name}」移入回收站？之后可从回收站恢复。`,
      okText: "移入",
      cancelText: "取消",
      onOk: () => deleteProduct(product),
    });

  const confirmRestore = (product: Product) =>
    Modal.confirm({
      title: "恢复商品",
      content: `将「${product.name}」恢复到仓库中？恢复后不会自动上架，需在「仓库中」手动上架。`,
      okText: "恢复",
      cancelText: "取消",
      onOk: () => changeStatus(product.id, "OFFLINE"),
    });

  const confirmRealDelete = (product: Product) =>
    Modal.confirm({
      title: "彻底删除",
      content: `「${product.name}」将被永久删除，此操作不可恢复。`,
      okText: "确认删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => realDelete(product),
    });

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

  const openCreate = useCallback(async () => {
    if (creating) return;
    // 分类异步加载，未就绪时禁止创建（否则 categoryOptions 为空会被误判为「无分类」）
    if (!categoriesLoaded) {
      message.warning("分类数据加载中，请稍候再点");
      return;
    }
    // 新建即建草稿：立即创建一条 DRAFT 商品拿到 ID，进入编辑页后主图/视频上传立即可用，
    // 不再出现 disabled 的空表单状态。categoryId 用分类列表第一个占位（进编辑页后可改）。
    if (categoryOptions.length === 0) {
      message.warning("请先在「分类管理」创建分类后再新增商品");
      return;
    }
    setCreating(true);
    try {
      // code 用 Date.now base36（与 ProductEditor.generateCode / cloneProduct 一致），
      // DB 唯一约束冲突（409）时重新生成重试一次（极小概率，并发/快速点击可能撞）。
      const tryCreate = async (): Promise<number> => {
        const code = `HC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const res = await productApi.create({
          name: "未命名商品",
          code,
          categoryId: categoryOptions[0].value,
          status: "DRAFT",
        });
        const created = unwrapResponse<Product>(res);
        if (!created?.id) throw new Error("创建草稿失败：服务端未返回商品 ID");
        return created.id;
      };
      let id: number;
      try {
        id = await tryCreate();
      } catch (err: any) {
        if (err?.response?.status === 409) {
          id = await tryCreate();
        } else {
          throw err;
        }
      }
      navigate(`/admin/products/${id}/edit`);
    } catch (error: any) {
      console.error("创建草稿失败:", error);
      message.error(error?.message || "创建草稿失败，请重试");
    } finally {
      setCreating(false);
    }
  }, [categoryOptions, categoriesLoaded, creating, navigate]);

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

  const columns = [
      {
        title: "商品名称",
        key: "product",
        width: 330,
        render: (_: unknown, product: ProductListItem) => {
          const image = getThumbnailImage(product as any);
          return (
            <div className="product-manage__product-cell">
              <img
                src={image || productPlaceholder(product.id, product.name)}
                alt=""
                className="product-manage__thumbnail"
                onError={(event) => {
                  event.currentTarget.src = productPlaceholder(
                    product.id,
                    product.name,
                  );
                }}
              />
              <div className="product-manage__product-copy">
                <button
                  type="button"
                  onClick={() => openEdit(product)}
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
        title: "价格",
        key: "price",
        width: 110,
        render: (_: unknown, product: ProductListItem) => (
          <span className="product-manage__price">
            {formatPrice(product.price)}
          </span>
        ),
      },
      {
        title: "质量分",
        key: "completeness",
        width: 130,
        render: (_: unknown, product: ProductListItem) => {
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
        width: 78,
        render: (_: unknown, product: ProductListItem) => product.totalStock ?? "—",
      },
      {
        title: "累计销量",
        key: "sales",
        width: 108,
        render: (_: unknown, product: ProductListItem) => product.salesCount || 0,
      },
      {
        title: "30日销量",
        key: "monthlySales",
        width: 108,
        render: () => <span className="product-manage__muted-value">—</span>,
      },
      {
        title: "创建时间",
        key: "created",
        width: 165,
        render: (_: unknown, product: ProductListItem) => formatDate(product.createdAt),
      },
      {
        title: "发布时间",
        key: "published",
        width: 165,
        render: (_: unknown, product: ProductListItem) =>
          product.publishedAt ? formatDate(product.publishedAt) : "—",
      },
      {
        title: "状态",
        key: "status",
        width: 92,
        render: (_: unknown, product: ProductListItem) => {
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
          <Space className="product-manage__row-actions" size={10} wrap>
            <Button
              type="link"
              size="small"
              className="product-manage__action-link"
              onClick={() => openEdit(product)}
            >
              编辑商品
            </Button>
            <Button
              type="link"
              size="small"
              className="product-manage__action-link"
              onClick={() => void cloneProduct(product)}
            >
              复制
            </Button>
            {product.status === "ARCHIVED" ? (
              /* 回收站商品：恢复到仓库 + 彻底删除（不可恢复） */
              <Dropdown
                overlayClassName="product-manage__dropdown"
                menu={{
                  items: [
                    {
                      key: "restore",
                      label: "恢复到仓库",
                      onClick: () => confirmRestore(product),
                    },
                    {
                      key: "realDelete",
                      danger: true,
                      label: "彻底删除",
                      onClick: () => confirmRealDelete(product),
                    },
                  ],
                }}
              >
                <Button type="link" size="small" className="product-manage__action-link">
                  回收站操作 <DownOutlined />
                </Button>
              </Dropdown>
            ) : (
              /* 正常商品：上架/下架 + 移入回收站（去掉了原来和移入回收站语义重复的「删除」） */
              <>
                {product.status === "PUBLISHED" ? (
                  <Button
                    type="link"
                    size="small"
                    className="product-manage__action-link"
                    onClick={() => void changeStatus(product.id, "OFFLINE")}
                  >
                    下架
                  </Button>
                ) : (
                  <Button
                    type="link"
                    size="small"
                    className="product-manage__action-link"
                    onClick={() => void changeStatus(product.id, "PUBLISHED")}
                  >
                    上架
                  </Button>
                )}
                <Dropdown
                  overlayClassName="product-manage__dropdown"
                  menu={{
                    items: [
                      {
                        key: "archive",
                        label: "移入回收站",
                        onClick: () => confirmArchive(product),
                      },
                    ],
                  }}
                >
                  <Button type="link" size="small" className="product-manage__action-link">
                    更多 <DownOutlined />
                  </Button>
                </Dropdown>
              </>
            )}
          </Space>
        ),
      },
  ];

  const tabs = [
    { key: "all", label: `全部 (${counts.all ?? total})` },
    ...statuses.map((status) => ({
      key: status,
      label: `${statusMeta[status].label} (${counts[status] ?? 0})`,
    })),
  ];

  return (
    <div className="product-manage">
      <div className="product-manage__tabs" role="tablist" aria-label="商品状态">
        {tabs.map((tab) => {
          const selected = (activeStatus || "all") === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`product-manage__tab${selected ? " is-active" : ""}`}
              onClick={() => {
                setActiveStatus(
                  tab.key === "all" ? undefined : (tab.key as ProductStatus),
                );
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          );
        })}
        <button
          type="button"
          className="product-manage__tab"
          onClick={() => message.info("当前没有违规商品")}
        >
          违规 (0)
        </button>
        <Dropdown
          overlayClassName="product-manage__dropdown"
          menu={{
            items: [
              {
                key: "violation",
                label: "违规商品 (0)",
                onClick: () => message.info("当前没有违规商品"),
              },
            ],
          }}
        >
          <Button type="text" className="product-manage__more-tab" aria-label="更多商品状态">
            ···
          </Button>
        </Dropdown>
      </div>

      <button
        type="button"
        className="product-manage__quality-notice"
        onClick={() => {
          setQualityScope("incomplete");
          setIsAdvancedOpen(true);
        }}
      >
        质量分/属性问题商品 ({qualityIssueCount}) <InfoCircleOutlined aria-hidden="true" />
      </button>

      <div className="product-manage__filters">
        <div className="product-manage__filter-fields">
          <Input
            placeholder="商品标题"
            value={titleKeyword}
            allowClear
            onChange={(event) => setTitleKeyword(event.target.value)}
            onPressEnter={search}
          />
          <Input
            placeholder="商品ID，多个ID以逗号或空格分隔"
            value={codeKeyword}
            allowClear
            onChange={(event) => setCodeKeyword(event.target.value)}
            onPressEnter={search}
          />
          <Input
            placeholder="商家编码"
            value={merchantCodeKeyword}
            allowClear
            onChange={(event) => setMerchantCodeKeyword(event.target.value)}
            onPressEnter={search}
          />
          <Select
            placeholder="质量分筛选　请选择"
            value={qualityScope}
            onChange={setQualityScope}
            popupClassName="product-manage__quality-dropdown"
            options={[
              { value: "all", label: "全部质量分" },
              { value: "incomplete", label: "待完善（低于 100 分）" },
              { value: "complete", label: "完整（100 分）" },
            ]}
          />
        </div>
        <div className="product-manage__filter-actions">
          <Space size={8}>
            <Button type="primary" className="product-manage__search-button" onClick={search}>
              搜索
            </Button>
            <Button className="product-manage__secondary-button" onClick={resetFilters}>重置</Button>
          </Space>
          <Space className="product-manage__filter-more" size={4}>
            <Dropdown
              overlayClassName="product-manage__dropdown"
              menu={{
                selectable: true,
                selectedKeys: [sortBy],
                items: [
                  { key: "updatedAt", label: "按最近更新排序" },
                  { key: "sortOrder", label: "按自定义排序" },
                ],
                onClick: ({ key }) => {
                  setSortBy(key as "updatedAt" | "sortOrder");
                  setPage(1);
                },
              }}
            >
              <Button type="text" className="product-manage__text-button">
                排序 <DownOutlined />
              </Button>
            </Dropdown>
            <Button
              type="text"
              className="product-manage__text-button"
              onClick={() => setIsAdvancedOpen((value) => !value)}
            >
              {isAdvancedOpen ? "收起" : "展开"} <DownOutlined rotate={isAdvancedOpen ? 180 : 0} />
            </Button>
          </Space>
        </div>
      </div>

      {isAdvancedOpen && (
        <div className="product-manage__advanced-filters">
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
          <span>质量分筛选基于当前列表返回的商品资料完整度。</span>
        </div>
      )}

      <div className="product-manage__toolbar">
        <Space className="product-manage__toolbar-actions" wrap size={12}>
          <Button
            type="primary"
            className="product-manage__publish-button"
            icon={<PlusOutlined />}
            onClick={() => void openCreate()}
            loading={creating}
            disabled={!categoriesLoaded}
          >
            发布商品
          </Button>
          <Button className="product-manage__secondary-button" onClick={() => message.info("商品装修功能将接入商品编辑页")}>商品装修</Button>
          <Button
            className="product-manage__secondary-button"
            onClick={() => {
              if (selectedIds.length !== 1) {
                message.info("请选择一件商品后进入编辑页管理 SKU");
                return;
              }
              const selected = products.find((product) => product.id === Number(selectedIds[0]));
              if (selected) openEdit(selected);
            }}
          >
            SKU管理
          </Button>
          <Dropdown
            overlayClassName="product-manage__dropdown"
            menu={{
              items: [
                {
                  key: "published",
                  label: "批量上架",
                  onClick: () => void changeSelectedStatus("PUBLISHED"),
                },
                {
                  key: "offline",
                  label: "批量下架",
                  onClick: () => void changeSelectedStatus("OFFLINE"),
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
            <Button className="product-manage__secondary-button" disabled={!selectedIds.length}>
              更多批量操作 <DownOutlined />
            </Button>
          </Dropdown>
          <span className="product-manage__selected-count">已选 {selectedIds.length} 件</span>
        </Space>
        <span className="product-manage__total-count">共 {qualityScope === "all" ? total : visibleProducts.length} 件商品</span>
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
          dataSource={visibleProducts}
          columns={columns}
          pagination={false}
          className="product-manage__table"
          scroll={{ x: 1500 }}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: setSelectedIds,
          }}
          locale={{
            emptyText: hasFilters
              ? "没有符合当前筛选条件的商品"
              : "暂无商品，点击“新增商品”开始添加",
          }}
        />
      )}

      {!error && total > 0 && (
        <div className="product-manage__pagination">
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
