import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Key } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  App as AntdApp,
  Button,
  Dropdown,
  Input,
  Pagination,
  Result,
  Select,
  Space,
} from "antd";
import {
  DownOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  categoryApi,
  productApi,
  type ProductAdminQuery,
} from "@/services/api";
import type { Category, Product, ProductStatus } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import {
  ADMIN_COPY,
  getSafeAdminErrorMessage,
} from "@/constants/adminCopy";
import ProductManageTable from "./ProductManageTable";
import {
  statusMeta,
  statuses,
  type ProductListItem,
} from "./productManageModel";
import "./ProductManage.css";

type ProductActionError = { status?: number };

function reportUnexpectedProductActionError(error: unknown, action: string) {
  const status = (error as ProductActionError | undefined)?.status;
  if (status && status >= 400 && status < 500) return;

  console.error(`${action}发生未知异常`, {
    status: status ?? null,
    errorType: error instanceof Error ? error.name : typeof error,
  });
}

function getProductActionErrorMessage(error: unknown, action: string): string {
  const requestError = error as ProductActionError | undefined;
  const status = requestError?.status;

  if (status === 401 || status === 403 || status === 409) {
    return `${action}未完成：${getSafeAdminErrorMessage(error, "商品状态已变化，请重新加载后再试。")}`;
  }
  if (status === 404) {
    return `${action}未完成：商品不存在或已被其他人处理，请刷新列表确认最新状态。`;
  }
  if (status === 422) {
    return `${action}未完成：商品未达到发布条件，请打开商品编辑页按提示补全资料。`;
  }
  if (status === 400) {
    return `${action}未完成：提交内容不符合要求，请重新加载并检查商品资料后再试。`;
  }
  if (status && status >= 500) {
    return `${action}未完成：服务端暂时无法处理，请稍后重试；若持续失败，请联系管理员。`;
  }
  return `${action}未完成：网络连接或服务发生异常，请检查网络后重试。`;
}

export default function ProductManage() {
  const { message, modal } = AntdApp.useApp();
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
  const [pendingProductId, setPendingProductId] = useState<number | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const productRequestIdRef = useRef(0);
  const [sortBy, setSortBy] = useState<
    NonNullable<ProductAdminQuery["sortBy"]>
  >("updated_desc");

  const keyword = titleKeyword || codeKeyword;
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
  const hasFilters = Boolean(titleKeyword || codeKeyword || categoryId || activeStatus);
  // 资料完整度为后端计算字段（非 DB 列）；这里只展示当前页统计，不伪装成全量筛选。
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
    } catch (error: unknown) {
      reportUnexpectedProductActionError(error, "加载分类");
      message.error(
        getSafeAdminErrorMessage(
          error,
          "分类数据加载失败，请刷新页面后重试。",
        ),
      );
      setCategoryOptions([]);
    } finally {
      setCategoriesLoaded(true);
    }
  }, [message]);

  const loadCounts = useCallback(async () => {
    try {
      const response = await productApi.getCounts();
      const data = unwrapResponse<Record<string, number>>(response);
      setCounts(data || {});
    } catch (error: unknown) {
      reportUnexpectedProductActionError(error, "加载统计数量");
      message.error(
        getSafeAdminErrorMessage(
          error,
          "商品统计数量加载失败，请刷新页面后重试。",
        ),
      );
      setCounts({});
    }
  }, [message]);

  const loadProducts = useCallback(
    async (
      targetPage?: number,
      overrides?: {
        status?: ProductStatus;
        categoryId?: number;
        keyword?: string;
      },
    ) => {
      const requestId = ++productRequestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const p = targetPage ?? page;
        const params: ProductAdminQuery = { page: p, pageSize, sortBy };
        const s = overrides?.status ?? activeStatus;
        if (s) params.status = s;
        const cid = overrides?.categoryId ?? categoryId;
        if (cid) params.categoryId = cid;
        const kw = overrides?.keyword ?? debouncedKeyword;
        if (isProductIdSearch && !titleKeyword) {
          params.ids = productIdSearch.join(",");
        } else if (kw) {
          params.keyword = kw;
        }
        const response = await productApi.getList(params);
        const data = unwrapResponse<{ list: ProductListItem[]; total: number }>(
          response,
        );
        if (requestId !== productRequestIdRef.current) return;
        setProducts(data?.list || []);
        setTotal(data?.total || 0);
      } catch (requestError: unknown) {
        if (requestId !== productRequestIdRef.current) return;
        setError(
          getSafeAdminErrorMessage(
            requestError,
            "商品数据加载失败，请检查网络后重新加载。",
          ),
        );
        setProducts([]);
        setTotal(0);
      } finally {
        if (requestId === productRequestIdRef.current) setLoading(false);
      }
    },
    [
      activeStatus,
      categoryId,
      debouncedKeyword,
      isProductIdSearch,
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
    setCategoryId(undefined);
    setActiveStatus(undefined);
    setSortBy("updated_desc");
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
      reportUnexpectedProductActionError(requestError, "更新商品状态");
      message.error(getProductActionErrorMessage(requestError, "商品状态更新"));
    } finally {
      setPendingProductId(null);
    }
  };

  const requestStatusChange = (product: Product, status: ProductStatus) => {
    if (status !== "OFFLINE") {
      void changeStatus(product.id, status);
      return;
    }
    modal.confirm({
      title: "确认下架这个商品？",
      content: `下架「${product.name}」后，商品将移入仓库并停止对客户展示；商品资料、SKU 和库存不会删除。`,
      okText: "确认下架",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => changeStatus(product.id, status),
    });
  };

  const archiveProduct = async (product: Product) => {
    if (pendingProductId !== null) return;
    setPendingProductId(product.id);
    try {
      await productApi.archive(product.id);
      await refreshAfterRowsLeave([product.id]);
      message.success(`已将「${product.name}」移入回收站，可在回收站中恢复。`);
    } catch (requestError: unknown) {
      reportUnexpectedProductActionError(requestError, "移入回收站");
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
      reportUnexpectedProductActionError(requestError, "恢复商品");
      message.error(getProductActionErrorMessage(requestError, "恢复商品"));
      throw requestError;
    } finally {
      setPendingProductId(null);
    }
  };

  // 危险/不可逆操作统一走 App 上下文 modal（Dropdown 嵌套 Popconfirm 会因 menu 关闭而失效）
  const confirmArchive = (product: Product) =>
    modal.confirm({
      title: "移入回收站",
      content: `将「${product.name}」移入回收站？之后可从回收站恢复。`,
      okText: "移入",
      cancelText: "取消",
      onOk: () => archiveProduct(product),
    });

  const confirmRestore = (product: Product) =>
    modal.confirm({
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

  const requestSelectedStatusChange = (status: ProductStatus) => {
    if (status !== "OFFLINE") {
      void changeSelectedStatus(status);
      return;
    }
    if (!selectedIds.length) {
      message.warning("请先选择商品，再进行批量操作");
      return;
    }
    modal.confirm({
      title: "确认批量下架？",
      content: `将选中的 ${selectedIds.length} 件商品移入仓库并停止对客户展示；商品资料、SKU 和库存不会删除。`,
      okText: "确认下架",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => changeSelectedStatus("OFFLINE"),
    });
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
    modal.confirm({
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
  }, [categoriesLoaded, message, navigate]);

  const openEdit = useCallback(
    (product: Product) => {
      navigate(`/admin/products/${product.id}/edit`);
    },
    [navigate],
  );

  const cloneProduct = async (product: Product) => {
    try {
      const source = unwrapResponse<Product>(await productApi.getById(product.id));
      const newCode = `HC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const suffix = Date.now().toString(36).toUpperCase().slice(-4);
      const pick = <K extends keyof Product>(key: K) => source[key];
      const activeSkus = (source.skus || []).filter((sku) => sku.isActive);
      const created = unwrapResponse<Product>(
        await productApi.create({
          name: `${source.name}（副本）`,
          code: newCode,
          categoryId: pick("categoryId"),
          materialType: pick("materialType"),
          shortDescription: pick("shortDescription"),
          description: pick("description"),
          goldWeight: pick("goldWeight"),
          weight: pick("weight"),
          size: pick("size"),
          craftFee: pick("craftFee"),
          gemInfo: pick("gemInfo"),
          craftTechnique: pick("craftTechnique"),
          sortOrder: pick("sortOrder"),
          salesMode: pick("salesMode"),
          inventoryPolicy: pick("inventoryPolicy") || "STANDARD",
          visibility: pick("visibility"),
          purchaseRegion: pick("purchaseRegion"),
          fulfillmentType: pick("fulfillmentType"),
          dispatchTime: pick("dispatchTime"),
          shippingTemplateId: pick("shippingTemplateId"),
          deliveryMethods: pick("deliveryMethods"),
          requiresInsuredShipping: pick("requiresInsuredShipping"),
          requiresSignature: pick("requiresSignature"),
          includesCertificate: pick("includesCertificate"),
          packageType: pick("packageType"),
          customLeadTime: pick("customLeadTime"),
          ...(activeSkus.length > 0 ? {
            skus: activeSkus.map((sku, index) => ({
              skuCode: `${sku.skuCode}-${suffix}${index}`.slice(0, 100),
              material: sku.material,
              size: sku.size,
              goldWeight: sku.goldWeight,
              price: sku.price,
              isActive: true,
            })),
          } : {}),
          status: "DRAFT" as const,
          isHot: pick("isHot"),
          isNew: pick("isNew"),
          isRecommended: pick("isRecommended"),
          isLimited: pick("isLimited"),
          isCustom: pick("isCustom"),
        }),
      );
      if (created?.id) {
        // SKU 已在创建事务中复制并建立零库存记录；其余子资源继续沿用现有接口。
        const subTasks: Promise<unknown>[] = [
          ...(source.images || []).map((img) =>
            productApi.addImage(created.id, {
              url: img.url,
              storageKey: img.storageKey ?? undefined,
              type: img.type,
              sortOrder: img.sortOrder,
              isVideo: img.isVideo,
              width: img.width ?? undefined,
              height: img.height ?? undefined,
              mimeType: img.mimeType ?? undefined,
              fileSize: img.fileSize ?? undefined,
            }),
          ),
          ...(source.certificates || []).map((cert) =>
            productApi.addCertificate(created.id, {
              certType: cert.certType,
              certNumber: cert.certNumber,
              certImage: cert.certImage,
              expireDate: cert.expireDate,
            }),
          ),
          productApi.updateTags(
            created.id,
            (source.tags || []).map((t) => t.tagName),
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
    } catch (requestError: unknown) {
      reportUnexpectedProductActionError(requestError, "复制商品");
      message.error(
        getSafeAdminErrorMessage(
          requestError,
          "商品复制失败，请稍后重试。",
        ),
      );
    }
  };

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

      <div className="product-manage__quality-notice">
        当前页资料不完整商品（{qualityIssueCount}） <InfoCircleOutlined aria-hidden="true" />
      </div>

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
                  { key: "updated_desc", label: "按最近更新排序" },
                  { key: "sortOrder", label: "按自定义排序" },
                ],
                onClick: ({ key }) => {
                  setSortBy(
                    key as NonNullable<ProductAdminQuery["sortBy"]>,
                  );
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
          <span>资料完整度按当前页返回的商品信息展示；直接购买商品还会检查 SKU、库存和提取方式。</span>
        </div>
      )}

      <div className="product-manage__toolbar">
        <Space className="product-manage__toolbar-actions" wrap size={12}>
          <Button
            type="primary"
            className="product-manage__publish-button"
            icon={<PlusOutlined />}
            onClick={() => void openCreate()}
            disabled={!categoriesLoaded}
          >
            新建商品
          </Button>
          <Dropdown
            overlayClassName="product-manage__dropdown"
            menu={{
              items: [
                {
                  key: "published",
                  label: "批量上架",
                  disabled: batchProcessing || activeStatus === "ARCHIVED",
                  onClick: () => requestSelectedStatusChange("PUBLISHED"),
                },
                {
                  key: "offline",
                  label: "批量下架",
                  disabled: batchProcessing || activeStatus === "ARCHIVED",
                  onClick: () => requestSelectedStatusChange("OFFLINE"),
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
        <span className="product-manage__total-count">共 {total} 件商品</span>
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
        <ProductManageTable
          products={visibleProducts}
          loading={loading}
          selectedIds={selectedIds}
          batchProcessing={batchProcessing}
          pendingProductId={pendingProductId}
          hasFilters={hasFilters}
          onSelectionChange={setSelectedIds}
          onOpenEdit={openEdit}
          onClone={cloneProduct}
          onRequestStatusChange={requestStatusChange}
          onConfirmArchive={confirmArchive}
          onConfirmRestore={confirmRestore}
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
