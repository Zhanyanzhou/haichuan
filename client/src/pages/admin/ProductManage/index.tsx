import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Key } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { SecureImage } from "@/components/common/SecureImage";
import { productPlaceholder } from "@/utils/placeholder";
import type { Category, Product, ProductStatus } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import { ADMIN_COPY, getAdminEmptyText } from "@/constants/adminCopy";
import "./ProductManage.css";

type ProductListItem = Product & {
  totalStock?: number;
  publishedAt?: string | null;
  completeness?: {
    score: number;
    isComplete: boolean;
  };
};

type ProductActionError = Error & { status?: number };

function getProductActionErrorMessage(error: unknown, action: string): string {
  const requestError = error as ProductActionError | undefined;
  const status = requestError?.status;
  const serverMessage = requestError?.message?.trim();

  if (status === 401) return `${action}未完成：登录已失效，请重新登录后再试。`;
  if (status === 403) return `${action}未完成：当前账号没有操作权限，请联系管理员处理。`;
  if (status === 404) {
    return `${action}未完成：商品不存在或已被其他人处理，请刷新列表确认最新状态。`;
  }
  if (status === 400 || status === 409) {
    return `${action}未完成：${serverMessage || "商品存在关联数据或状态冲突"}。请刷新列表确认后再试。`;
  }
  if (status && status >= 500) {
    return `${action}未完成：服务端暂时无法处理，请稍后重试；若持续失败，请联系管理员。`;
  }
  return `${action}未完成：网络连接或服务发生异常，请检查网络后重试。`;
}

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
  const [searchParams] = useSearchParams();
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
  // 支持来自分类管理「查看商品列表」的跳转：挂载时从 URL 读取 categoryId 预筛一次。
  // 用 lazy initializer 直接作为初始值，避免额外 effect 进入 loadProducts 依赖链造成 double 请求 / 429 风险。
  const [categoryId, setCategoryId] = useState<number | undefined>(() => {
    const cid = searchParams.get("categoryId");
    return cid && /^\d+$/.test(cid) ? Number(cid) : undefined;
  });
  const [categoryOptions, setCategoryOptions] = useState<
    { value: number; label: string }[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingProductId, setPendingProductId] = useState<number | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [qualityScope, setQualityScope] = useState<
    "all" | "incomplete" | "complete"
  >("all");
  const [sortBy, setSortBy] = useState<"updatedAt" | "sortOrder">(
    "updatedAt",
  );

  const keyword = titleKeyword || codeKeyword || merchantCodeKeyword;
  // 必须用 useMemo 稳定引用：productIdSearch 被放进 loadProducts 的 useCallback 依赖，
  // 若每渲染都重建数组，会让 loadProducts 引用每次都变，触发数据获取 useEffect 无限循环（撞 60次/分限流 → 429 风暴）。
  const productIdSearch = useMemo(
    () =>
      codeKeyword
        .split(/[，,\s]+/)
        .map((id) => id.trim())
        .filter(Boolean),
    [codeKeyword],
  );
  const isProductIdSearch =
    productIdSearch.length > 0 && productIdSearch.every((id) => /^\d+$/.test(id));
  const hasFilters = Boolean(
    titleKeyword || codeKeyword || merchantCodeKeyword || categoryId || activeStatus,
  );
  // 质量分为后端计算字段（非 DB 列），无法在 findAll 做 where 过滤；
  // 前端对当前页 filter 会导致 total/分页计数不一致（误导）。
  // 因此 qualityScope 不再作为列表过滤，仅用于「质量分统计」徽标展示（统计当前页）。
  const visibleProducts = products;
  const qualityIssueCount = useMemo(
    () =>
      products.filter((product) => (product.completeness?.score ?? 0) < 100)
        .length,
    [products],
  );

  const loadCategories = useCallback(async () => {
    try {
      // 管理端分类树：返回全部分类（公开树 /categories/tree 只含有公开商品的分类，商品清空后会变空）
      const response = await categoryApi.getManageTree();
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

  // latest-ref：effect 只在真实筛选/分页条件变化时触发，不依赖 loadProducts 引用。
  // 否则 useCallback 依赖里任何派生值（productIdSearch / isProductIdSearch 等）抖动
  // → effect 重跑 → 请求 → setState → 重建 loadProducts → effect 再重跑，
  // 撞 60 次/分限流形成 429 死循环。
  const loadProductsRef = useRef(loadProducts);
  loadProductsRef.current = loadProducts;
  useEffect(() => {
    void loadProductsRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sortBy, activeStatus, categoryId, debouncedKeyword]);

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

  const refreshAfterRowsLeave = async (affectedIds: number[]) => {
    const affected = new Set(affectedIds);
    const remainingProducts = products.filter((product) => !affected.has(product.id));
    const affectedOnPage = products.length - remainingProducts.length;

    setSelectedIds((ids) => ids.filter((id) => !affected.has(Number(id))));
    setProducts(remainingProducts);
    setTotal((current) => Math.max(0, current - affectedOnPage));

    if (remainingProducts.length === 0 && page > 1) {
      setLoading(true);
      setPage((current) => Math.max(1, current - 1));
      await loadCounts();
      return;
    }
    await Promise.all([loadProducts(page), loadCounts()]);
  };

  const changeStatus = async (id: number, status: ProductStatus) => {
    if (pendingProductId !== null) return;
    setPendingProductId(id);
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
    } catch (requestError: unknown) {
      console.error("更新商品状态失败:", requestError);
      message.error(getProductActionErrorMessage(requestError, "商品状态更新"));
    } finally {
      setPendingProductId(null);
    }
  };

  const archiveProduct = async (product: Product) => {
    if (pendingProductId !== null) return;
    setPendingProductId(product.id);
    try {
      await productApi.archive(product.id);
      await refreshAfterRowsLeave([product.id]);
      message.success(`已将「${product.name}」移入回收站，可在回收站中恢复。`);
    } catch (requestError: unknown) {
      console.error("移入回收站失败:", requestError);
      message.error(getProductActionErrorMessage(requestError, "移入回收站"));
      throw requestError;
    } finally {
      setPendingProductId(null);
    }
  };

  const restoreProduct = async (product: Product) => {
    if (pendingProductId !== null) return;
    setPendingProductId(product.id);
    try {
      await productApi.restore(product.id);
      await refreshAfterRowsLeave([product.id]);
      message.success(`已恢复「${product.name}」为草稿，可重新编辑后发布。`);
    } catch (requestError: unknown) {
      console.error("恢复商品失败:", requestError);
      message.error(getProductActionErrorMessage(requestError, "恢复商品"));
      throw requestError;
    } finally {
      setPendingProductId(null);
    }
  };

  // 危险/不可逆操作统一走 Modal.confirm（Dropdown 嵌套 Popconfirm 会因 menu 关闭而失效）
  const confirmArchive = (product: Product) =>
    Modal.confirm({
      title: "移入回收站",
      content: `将「${product.name}」移入回收站？之后可从回收站恢复。`,
      okText: "移入",
      cancelText: "取消",
      onOk: () => archiveProduct(product),
    });

  const confirmRestore = (product: Product) =>
    Modal.confirm({
      title: "恢复草稿",
      content: `将「${product.name}」恢复为草稿？恢复后可重新编辑并发布。`,
      okText: "恢复草稿",
      cancelText: "取消",
      onOk: () => restoreProduct(product),
    });

  // 有限并发执行批量操作，逐条汇总成功/失败，避免 Promise.all 整体失败 + 大量并发触发 429。
  const runBatch = async (
    ids: Key[],
    action: (id: number) => Promise<unknown>,
  ): Promise<{
    succeeded: number[];
    failed: Array<{ id: number; error: unknown }>;
  }> => {
    const queue = ids.map((id) => Number(id));
    const failed: Array<{ id: number; error: unknown }> = [];
    const succeeded: number[] = [];
    let cursor = 0;
    const concurrency = 3;
    const worker = async () => {
      while (cursor < queue.length) {
        const current = queue[cursor++];
        try {
          await action(current);
          succeeded.push(current);
        } catch (error: unknown) {
          failed.push({ id: current, error });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    return { succeeded, failed };
  };

  const changeSelectedStatus = async (status: ProductStatus) => {
    if (!selectedIds.length) {
      message.warning("请先选择商品，再进行批量操作");
      return;
    }
    setBatchProcessing(true);
    try {
      message.loading({ content: `正在批量处理 ${selectedIds.length} 件商品…`, key: "batch-status", duration: 0 });
      const { succeeded, failed } = await runBatch(selectedIds, (id) => productApi.updateStatus(id, status));
      message.destroy("batch-status");
      if (failed.length === 0) {
        message.success(`已处理 ${succeeded.length} 件商品`);
      } else if (succeeded.length > 0) {
        message.warning(`成功 ${succeeded.length} 件，失败 ${failed.length} 件。${getProductActionErrorMessage(failed[0].error, "批量状态更新")}`);
      } else {
        message.error(getProductActionErrorMessage(failed[0]?.error, "批量状态更新"));
      }
      setSelectedIds([]);
      await Promise.all([loadProducts(), loadCounts()]);
    } finally {
      message.destroy("batch-status");
      setBatchProcessing(false);
    }
  };

  const batchArchive = async () => {
    if (!selectedIds.length) {
      message.warning("请先选择商品，再进行批量删除");
      return;
    }
    setBatchProcessing(true);
    try {
      message.loading({ content: `正在将 ${selectedIds.length} 件商品移入回收站…`, key: "batch-delete", duration: 0 });
      const { succeeded, failed } = await runBatch(selectedIds, (id) => productApi.archive(id));
      message.destroy("batch-delete");
      if (succeeded.length > 0) await refreshAfterRowsLeave(succeeded);
      if (failed.length === 0) {
        message.success(`已将 ${succeeded.length} 件商品移入回收站，可在回收站中恢复。`);
      } else if (succeeded.length > 0) {
        message.warning(`成功 ${succeeded.length} 件，失败 ${failed.length} 件。${getProductActionErrorMessage(failed[0].error, "批量移入回收站")}`);
      } else {
        message.error(getProductActionErrorMessage(failed[0]?.error, "批量移入回收站"));
      }
    } finally {
      message.destroy("batch-delete");
      setBatchProcessing(false);
    }
  };

  const confirmBatchArchive = () => {
    if (!selectedIds.length) {
      message.warning("请先选择商品，再进行批量删除");
      return;
    }
    Modal.confirm({
      title: "批量移入回收站",
      content: `将选中的 ${selectedIds.length} 件商品移入回收站？之后可逐件恢复。`,
      okText: "确认移入",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => batchArchive(),
    });
  };

  const openCreate = useCallback(() => {
    // 进入新建模式（/admin/products/new）：不预创建草稿，编辑器显示空表单，
    // 用户显式「保存草稿/创建商品」才落库，避免产生未命名商品垃圾数据。
    // 分类未加载仅提示（编辑器内部也会加载分类）；无分类时仍允许进入（保存时校验必填）。
    if (!categoriesLoaded) {
      message.warning("分类数据加载中，请稍候再点");
      return;
    }
    navigate("/admin/products/new");
  }, [categoriesLoaded, navigate]);

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
              // 副本 SKU 库存归零：后端 createSku 不复制原 SKU 的 stock/safetyStock（契约约定，
              // 复制库存需业务授权）。副本 stock=0，避免假数据；运营需在编辑页显式补库存。
              productApi.createSku(created.id, {
                skuCode: `${sku.skuCode}-${suffix}${i}`.slice(0, 100),
                material: sku.material,
                size: sku.size,
                goldWeight: sku.goldWeight,
                price: sku.price,
                stock: 0,
                safetyStock: 0,
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
            ? `已复制为「${created.name}」（SKU 库存已归零，请在编辑页补库存）`
            : `已复制为「${created.name}」，${failedCount} 项子资源复制失败；SKU 库存已归零，请在编辑页核对`,
        );
        navigate(`/admin/products/${created.id}/edit`);
        void loadProducts();
        void loadCounts();
      } else {
        message.error("复制失败：服务端未返回有效的商品数据，请重试");
      }
    } catch (requestError: any) {
      console.error("复制商品失败:", requestError);
      message.error(requestError?.message || "商品复制失败，请稍后重试。");
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
        render: (_: unknown, product: Product) => {
          const rowPending = pendingProductId === product.id;
          return (
          <Space className="product-manage__row-actions" size={10} wrap>
            {product.status === "ARCHIVED" ? (
              /* 回收站商品只读：仅提供查看与恢复为草稿，不提供编辑/发布/下架/软删除等操作 */
              <>
                <Button
                  type="link"
                  size="small"
                  className="product-manage__action-link"
                  onClick={() => openEdit(product)}
                  disabled={rowPending}
                >
                  查看
                </Button>
                <Button
                  type="link"
                  size="small"
                  className="product-manage__action-link"
                  onClick={() => confirmRestore(product)}
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
                  onClick={() => openEdit(product)}
                  disabled={rowPending}
                >
                  编辑商品
                </Button>
                <Button
                  type="link"
                  size="small"
                  className="product-manage__action-link"
                  onClick={() => void cloneProduct(product)}
                  disabled={rowPending}
                >
                  复制
                </Button>
                {product.status === "PUBLISHED" ? (
                  <Button
                    type="link"
                    size="small"
                    className="product-manage__action-link"
                    onClick={() => void changeStatus(product.id, "OFFLINE")}
                    loading={rowPending}
                    disabled={pendingProductId !== null && !rowPending}
                  >
                    下架
                  </Button>
                ) : (
                  <Button
                    type="link"
                    size="small"
                    className="product-manage__action-link"
                    onClick={() => void changeStatus(product.id, "PUBLISHED")}
                    loading={rowPending}
                    disabled={pendingProductId !== null && !rowPending}
                  >
                    上架
                  </Button>
                )}
                <Dropdown
                  overlayClassName="product-manage__dropdown"
                  disabled={pendingProductId !== null}
                  menu={{
                    items: [
                      {
                        key: "archive",
                        label: "移入回收站",
                        disabled: pendingProductId !== null,
                        onClick: () => confirmArchive(product),
                      },
                    ],
                  }}
                >
                  <Button type="link" size="small" className="product-manage__action-link" loading={rowPending}>
                    更多 <DownOutlined />
                  </Button>
                </Dropdown>
              </>
            )}
          </Space>
          );
        },
      },
  ];

  const tabs = [
    { key: "all", label: `全部（${counts.all ?? total}）` },
    ...statuses.map((status) => ({
      key: status,
      label: `${statusMeta[status].label}（${counts[status] ?? 0}）`,
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
          违规（0）
        </button>
        <Dropdown
          overlayClassName="product-manage__dropdown"
          menu={{
            items: [
              {
                key: "violation",
                label: "违规商品（0）",
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
        质量分/属性问题商品（{qualityIssueCount}） <InfoCircleOutlined aria-hidden="true" />
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
            placeholder="商品 ID，多个 ID 以逗号或空格分隔"
            value={codeKeyword}
            allowClear
            onChange={(event) => setCodeKeyword(event.target.value)}
            onPressEnter={search}
          />
          <Select
            placeholder="质量分统计（本页）"
            value={qualityScope}
            onChange={setQualityScope}
            popupClassName="product-manage__quality-dropdown"
            options={[
              { value: "all", label: "全部（本页统计）" },
              { value: "incomplete", label: "待完善 · 本页 N 项" },
              { value: "complete", label: "完整 · 本页 N 项" },
            ]}
          />
        </div>
        <div className="product-manage__filter-actions">
          <Space size={8}>
            <Button type="primary" className="product-manage__search-button" onClick={search}>
              {ADMIN_COPY.actions.search}
            </Button>
            <Button className="product-manage__secondary-button" onClick={resetFilters}>{ADMIN_COPY.actions.reset}</Button>
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
            新建商品
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
            SKU 管理
          </Button>
          <Dropdown
            overlayClassName="product-manage__dropdown"
            menu={{
              items: [
                {
                  key: "published",
                  label: "批量上架",
                  disabled: batchProcessing || activeStatus === "ARCHIVED",
                  onClick: () => void changeSelectedStatus("PUBLISHED"),
                },
                {
                  key: "offline",
                  label: "批量下架",
                  disabled: batchProcessing || activeStatus === "ARCHIVED",
                  onClick: () => void changeSelectedStatus("OFFLINE"),
                },
                {
                  key: "delete",
                  label: "移入回收站",
                  danger: true,
                  disabled: batchProcessing || activeStatus === "ARCHIVED",
                  onClick: confirmBatchArchive,
                },
              ],
            }}
          >
            <Button className="product-manage__secondary-button" disabled={!selectedIds.length || batchProcessing || pendingProductId !== null || activeStatus === "ARCHIVED"} loading={batchProcessing}>
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
              {ADMIN_COPY.actions.retry}
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
            getCheckboxProps: () => ({
              disabled: batchProcessing || pendingProductId !== null,
            }),
          }}
          locale={{
            emptyText: hasFilters
              ? getAdminEmptyText("商品", true)
              : "暂无商品，点击“新建商品”开始添加。",
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
