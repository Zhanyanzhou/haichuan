import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Key } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  App as AntdApp,
  Button,
  Dropdown,
  Input,
  Pagination,
  Select,
  Space,
} from "antd";
import {
  DownOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  categoryApi,
  inventoryApi,
  productApi,
  type ProductAdminQuery,
} from "@/services/api";
import type { Category, Product, ProductStatus, SalesMode } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import { currentSessionEpoch, isCurrentSessionEpoch, StaleSessionResponseError } from "@/services/sessionEpoch";
import {
  ADMIN_COPY,
  getSafeAdminErrorMessage,
} from "@/constants/adminCopy";
import AdminPageHeader from "@/components/common/AdminPageHeader";
import {
  AdminErrorState,
  AdminLoadingState,
} from "@/components/common/AdminDataStates";
import ProductManageTable from "./ProductManageTable";
import { ProductBatchPriceModal } from "./ProductBatchPriceModal";
import { ProductBatchSalesModeModal, type SalesModeTarget } from "./ProductBatchSalesModeModal";
import { ProductCustomPricingModal } from "./ProductCustomPricingModal";
import { ProductBatchStockModal } from "./ProductBatchStockModal";
import { ProductFolderImportModal } from "./ProductFolderImportModal";
import type { BatchPriceUpdate } from "./productBatchPrice";
import type { BatchStockSource, BatchStockUpdate } from "./productBatchStock";
import { useAuthStore } from "@/store/authStore";
import {
  salesModeLabels,
  statusMeta,
  statuses,
  type ProductListItem,
} from "./productManageModel";
import CategoryBatchMoveDialog from "../CategoryManage/CategoryBatchMoveDialog";
import "./ProductManage.css";

type ProductActionError = { status?: number; errorCode?: string };

const DEFAULT_PRODUCT_PAGE_SIZE = 20;
const MAX_BATCH_SELECTION = 50;
const DEFAULT_PRODUCT_SORT: NonNullable<ProductAdminQuery["sortBy"]> =
  "updated_desc";
const PERMANENT_DELETE_ACTION = ADMIN_COPY.actions.permanentlyDelete;
const PERMANENT_DELETE_CONSEQUENCE =
  "商品会从商品列表和回收站移除，无法恢复。订单、库存等业务记录会保留。引用该商品的页面区块可能不再展示它。";
const permanentDeleteConflictMessages = new Map([
  ["PRODUCT_PERMANENT_DELETE_NOT_ARCHIVED", "商品已不在回收站，请核对最新状态。"],
  // 兼容尚未更新删除规则的服务端返回。
  ["PRODUCT_PERMANENT_DELETE_ORDER", "商品有关联订单，已保留。"],
  ["PRODUCT_PERMANENT_DELETE_INVENTORY", "商品有库存、库存历史或无法核实的库存记录，已保留。"],
  ["PRODUCT_PERMANENT_DELETE_QUOTATION", "商品有关联报价，已保留。"],
  ["PRODUCT_PERMANENT_DELETE_PUBLISHED", "商品有上架或下架历史，已保留。"],
  ["PRODUCT_PERMANENT_DELETE_PAGE", "页面装修中有相同款号或商品引用，已保留。"],
  ["PRODUCT_PERMANENT_DELETE_REFERENCED", "商品有关联业务记录，已保留。"],
  ["PRODUCT_PERMANENT_DELETE_DEMO_ONLY", "演示模式无法核对业务关联，商品已保留。"],
]);

function readPositiveInteger(
  value: string | null,
  fallback: number,
  maximum = 1000,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback;
}

function readProductStatus(value: string | null): ProductStatus | undefined {
  return statuses.includes(value as ProductStatus)
    ? (value as ProductStatus)
    : undefined;
}

function readProductSort(
  value: string | null,
): NonNullable<ProductAdminQuery["sortBy"]> {
  return value === "sortOrder" ? "sortOrder" : DEFAULT_PRODUCT_SORT;
}

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
  return `${action}未完成：发生未知异常，请稍后重试；若持续失败，请联系管理员。`;
}

function getPermanentDeleteErrorMessage(error: unknown): string {
  const { status, errorCode } = (error as ProductActionError | undefined) ?? {};
  if (status === 409 && errorCode) {
    const conflictMessage = permanentDeleteConflictMessages.get(errorCode);
    if (conflictMessage) return conflictMessage;
  }
  if (status === undefined || status >= 500) {
    return "未能确认删除结果，请在回收站核对后再试。";
  }
  if (status === 429) return "操作过于频繁，请稍后再试。";
  return getProductActionErrorMessage(error, PERMANENT_DELETE_ACTION);
}

export default function ProductManage() {
  const { message, modal } = AntdApp.useApp();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const staffId = useAuthStore((state) => state.user?.id);
  const canGovernPublic = role === "SUPER_ADMIN" || role === "ADMIN";
  const canImport = canGovernPublic || role === "EDITOR";
  const [folderImportOpen, setFolderImportOpen] = useState(false);
  const [importCategories, setImportCategories] = useState<{ value: number; label: string }[]>([]);
  const canInventory = role === "SUPER_ADMIN" || role === "ADMIN" || role === "WAREHOUSE";
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTitleKeyword = searchParams.get("title") || "";
  const initialCodeKeyword = searchParams.get("code") || "";
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(() =>
    readPositiveInteger(searchParams.get("page"), 1),
  );
  const [pageSize, setPageSize] = useState(() =>
    readPositiveInteger(
      searchParams.get("pageSize"),
      DEFAULT_PRODUCT_PAGE_SIZE,
      100,
    ),
  );
  const [activeStatus, setActiveStatus] = useState<ProductStatus | undefined>(
    () => readProductStatus(searchParams.get("status")),
  );
  const isTrash = activeStatus === "ARCHIVED";
  const canRestoreTrash = isTrash && canImport;
  const canPermanentlyDelete = isTrash && role === "SUPER_ADMIN";
  const [titleKeyword, setTitleKeyword] = useState(initialTitleKeyword);
  const [codeKeyword, setCodeKeyword] = useState(initialCodeKeyword);
  // 支持来自分类管理「查看商品列表」的跳转：挂载时从 URL 读取 categoryId 预筛一次。
  // 用 lazy initializer 直接作为初始值，避免额外 effect 进入 loadProducts 依赖链造成 double 请求 / 429 风险。
  const [categoryId, setCategoryId] = useState<number | undefined>(() => {
    const cid = searchParams.get("categoryId");
    return cid && /^\d+$/.test(cid) ? Number(cid) : undefined;
  });
  const [includeDescendants, setIncludeDescendants] = useState(
    () => searchParams.get("includeDescendants") === "1",
  );
  const [categoryOptions, setCategoryOptions] = useState<
    { value: number; label: string }[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [categoryTree, setCategoryTree] = useState<Category[]>([]);
  const [categoryMoveTargets, setCategoryMoveTargets] = useState<ProductListItem[]>([]);
  const [salesModeBatch, setSalesModeBatch] = useState<{
    products: SalesModeTarget[];
    epoch: number;
    controller: AbortController;
  } | null>(null);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [customPricingOpen, setCustomPricingOpen] = useState(false);
  const [priceModalLoading, setPriceModalLoading] = useState(false);
  const [priceTargets, setPriceTargets] = useState<ProductListItem[]>([]);
  const [priceUnresolvedCount, setPriceUnresolvedCount] = useState(0);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockModalLoading, setStockModalLoading] = useState(false);
  const [stockRecords, setStockRecords] = useState<BatchStockSource[]>([]);
  const [stockMissingNames, setStockMissingNames] = useState<string[]>([]);
  const [stockTruncated, setStockTruncated] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsAvailable, setCountsAvailable] = useState(false);
  const [debouncedKeyword, setDebouncedKeyword] = useState(
    initialTitleKeyword || initialCodeKeyword,
  );
  const [pendingProductId, setPendingProductId] = useState<number | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(
    () => searchParams.get("advanced") === "1" || Boolean(searchParams.get("categoryId")),
  );
  const productRequestIdRef = useRef(0);
  const permanentDeleteInProgress = useRef(false);
  const batchRestoreInProgress = useRef(false);
  const salesModeInProgress = useRef(false);
  useEffect(() => () => salesModeBatch?.controller.abort(), [salesModeBatch]);
  const [sortBy, setSortBy] = useState<
    NonNullable<ProductAdminQuery["sortBy"]>
  >(() => readProductSort(searchParams.get("sort")));

  const listQueryString = useMemo(() => {
    const next = new URLSearchParams();
    if (page > 1) next.set("page", String(page));
    if (pageSize !== DEFAULT_PRODUCT_PAGE_SIZE) {
      next.set("pageSize", String(pageSize));
    }
    if (activeStatus) next.set("status", activeStatus);
    if (titleKeyword.trim()) next.set("title", titleKeyword.trim());
    if (codeKeyword.trim()) next.set("code", codeKeyword.trim());
    if (categoryId) next.set("categoryId", String(categoryId));
    if (categoryId && includeDescendants) next.set("includeDescendants", "1");
    if (sortBy !== DEFAULT_PRODUCT_SORT) next.set("sort", sortBy);
    if (isAdvancedOpen) next.set("advanced", "1");
    return next.toString();
  }, [
    activeStatus,
    categoryId,
    includeDescendants,
    codeKeyword,
    isAdvancedOpen,
    page,
    pageSize,
    sortBy,
    titleKeyword,
  ]);
  const listReturnPath = `/admin/products${
    listQueryString ? `?${listQueryString}` : ""
  }`;

  useEffect(() => {
    setSearchParams(listQueryString, { replace: true });
  }, [listQueryString, setSearchParams]);

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
  const visibleProducts = products;
  const selectedProducts = visibleProducts.filter(({ id }) => selectedIds.includes(id));
  const selectedTrashProducts = selectedProducts.filter(({ status }) => status === "ARCHIVED");
  const canEditProduct = (product: ProductListItem) =>
    canImport && product.status !== "ARCHIVED" && product.reviewStatus !== "IN_REVIEW" &&
    (canGovernPublic || product.status === "DRAFT");
  const batchUnavailable = loading || batchProcessing || pendingProductId !== null;

  const loadCategories = useCallback(async () => {
    try {
      // 管理端分类树含停用记录。选款中心读 /categories/tree，只含启用中的分类。
      const response = await categoryApi.getManageTree();
      const options: { value: number; label: string }[] = [];
      const enabled: typeof options = [];
      const walk = (nodes: Category[], parentLabel = "", parentActive = true) => {
        nodes.forEach((node) => {
          const label = parentLabel
            ? `${parentLabel} / ${node.name}`
            : node.name;
          const option = { value: node.id, label };
          const active = parentActive && node.isActive !== false;
          options.push(option);
          if (active) enabled.push(option);
          if (node.children?.length) walk(node.children, label, active);
        });
      };
      const tree = unwrapResponse<Category[]>(response) || [];
      walk(tree);
      setCategoryTree(tree);
      setCategoryOptions(options);
      setImportCategories(enabled);
    } catch (error: unknown) {
      reportUnexpectedProductActionError(error, "加载分类");
      message.error(
        getSafeAdminErrorMessage(
          error,
          "分类数据加载失败，请刷新页面后重试。",
        ),
      );
      setCategoryOptions([]);
      setCategoryTree([]);
    } finally {
      setCategoriesLoaded(true);
    }
  }, [message]);

  const loadCounts = useCallback(async () => {
    try {
      const response = await productApi.getCounts();
      const data = unwrapResponse<Record<string, number>>(response);
      setCounts(data || {});
      setCountsAvailable(true);
    } catch (error: unknown) {
      reportUnexpectedProductActionError(error, "加载统计数量");
      message.error(
        getSafeAdminErrorMessage(
          error,
          "商品统计数量加载失败，请刷新页面后重试。",
        ),
      );
      setCounts({});
      setCountsAvailable(false);
    }
  }, [message]);

  const loadProducts = useCallback(
    async (
      targetPage?: number,
      overrides?: {
        status?: ProductStatus;
        categoryId?: number;
        keyword?: string;
        clampToLastPage?: boolean;
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
        if (cid) {
          params.categoryId = cid;
          if (includeDescendants) params.includeDescendants = "true";
        }
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
        const lastPage = Math.max(1, Math.ceil((data?.total || 0) / pageSize));
        if (overrides?.clampToLastPage && p > lastPage) setPage(lastPage);
        const rows = data?.list || [];
        const rowIds = new Set(rows.map(({ id }) => id));
        setSelectedIds((ids) => ids.filter((id) => rowIds.has(Number(id))));
        setProducts(rows);
        setTotal(data?.total || 0);
      } catch (requestError: unknown) {
        if (requestId !== productRequestIdRef.current) return;
        setError(
          getSafeAdminErrorMessage(
            requestError,
            "商品数据加载失败，请稍后重新加载。",
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
      includeDescendants,
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
    setSelectedIds([]);
    void loadProductsRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sortBy, activeStatus, categoryId, includeDescendants, debouncedKeyword]);

  const resetFilters = () => {
    setSelectedIds([]);
    setTitleKeyword("");
    setCodeKeyword("");
    setCategoryId(undefined);
    setIncludeDescendants(false);
    setActiveStatus(undefined);
    setSortBy("updated_desc");
    setIsAdvancedOpen(false);
    setPage(1);
  };

  const search = () => {
    setSelectedIds([]);
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
      await Promise.all([loadProductsRef.current(), loadCounts()]);
    } catch (requestError: unknown) {
      reportUnexpectedProductActionError(requestError, "更新商品状态");
      message.error(getProductActionErrorMessage(requestError, "商品状态更新"));
    } finally {
      setPendingProductId(null);
    }
  };

  const requestStatusChange = (product: Product, status: ProductStatus) => {
    if (status === "PUBLISHED") {
      const isReviewApproval = product.reviewStatus === "IN_REVIEW";
      modal.confirm({
        title: isReviewApproval
          ? `通过审核并上架“${product.name}”？`
          : `上架“${product.name}”？`,
        content: "上架后，商品将立即对当前可见范围内的客户展示。请确认商品资料和可见范围已核对。",
        okText: isReviewApproval ? "确认通过并上架" : "确认上架",
        cancelText: "取消",
        onOk: () => changeStatus(product.id, status),
      });
      return;
    }
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

  const submitForReview = async (product: Product) => {
    if (pendingProductId !== null) return;
    setPendingProductId(product.id);
    try {
      await productApi.submitForReview(product.id);
      message.success(`「${product.name}」已提交审核；管理员复核后才能发布。`);
      await Promise.all([loadProductsRef.current(), loadCounts()]);
    } catch (requestError: unknown) {
      reportUnexpectedProductActionError(requestError, "提交商品审核");
      message.error(getProductActionErrorMessage(requestError, "提交审核"));
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
      title: `将“${product.name}”移入回收站？`,
      content: "移入后客户将无法看到该商品，可稍后从回收站恢复。",
      okText: "确认移入回收站",
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

  const selectedProductIds = () => selectedIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  const openCategoryMove = () => {
    if (batchUnavailable || !selectedProducts.length) return;
    if (selectedProducts.length > MAX_BATCH_SELECTION) {
      message.warning(`一次最多为 ${MAX_BATCH_SELECTION} 件商品改分类，请减少勾选数量。`);
      return;
    }
    if (!selectedProducts.every(canEditProduct)) {
      message.warning("所选商品中有不可编辑的商品，请取消勾选审核中或当前角色无权编辑的商品。");
      return;
    }
    if (!importCategories.length) {
      message.warning("没有可用的目标分类，请在分类管理中核对后再试。");
      return;
    }
    setCategoryMoveTargets(selectedProducts);
  };

  const openSalesModeBatch = () => {
    if (batchUnavailable || !selectedProducts.length) return;
    if (selectedProducts.length > MAX_BATCH_SELECTION) {
      message.warning(`一次最多为 ${MAX_BATCH_SELECTION} 件商品改销售方式，请减少勾选数量。`);
      return;
    }
    if (!selectedProducts.every(canEditProduct)) {
      message.warning("请取消勾选审核中或当前角色无权编辑的商品，再修改销售方式。");
      return;
    }
    const targets = selectedProducts.filter((product): product is SalesModeTarget =>
      !!product.salesMode && Object.prototype.hasOwnProperty.call(salesModeLabels, product.salesMode));
    if (targets.length !== selectedProducts.length) {
      message.warning("部分商品的原销售方式未能读取，请刷新列表后再试。");
      return;
    }
    setSalesModeBatch({ products: targets, epoch: currentSessionEpoch("admin"), controller: new AbortController() });
  };

  const applySalesModeBatch = async (salesMode: SalesMode, changes: SalesModeTarget[]) => {
    if (!salesModeBatch || !changes.length || salesModeInProgress.current) return;
    const { products: targets, epoch, controller } = salesModeBatch;
    const isActive = () => !controller.signal.aborted && isCurrentSessionEpoch("admin", epoch);
    if (!isActive()) {
      setSalesModeBatch(null);
      message.warning("登录状态已变化，请重新勾选商品后再试。");
      return;
    }

    salesModeInProgress.current = true;
    setBatchProcessing(true);
    try {
      const byId = new Map(changes.map((product) => [product.id, product]));
      const { succeeded, failed } = await runBatch([...byId.keys()], async (id) => {
        if (!isActive()) throw new StaleSessionResponseError("admin");
        const original = byId.get(id);
        if (!original) throw new Error("未能确认商品原销售方式");
        const response = await productApi.update(
          id,
          { salesMode, expectedSalesMode: original.salesMode },
          { suppressGlobalError: true },
        );
        const saved = unwrapResponse<Product>(response);
        if (saved?.id !== id || saved.salesMode !== salesMode) throw new Error("销售方式未确认保存");
      });
      if (!isActive()) {
        if (!controller.signal.aborted) setSalesModeBatch(null);
        return;
      }
      const unchanged = targets.filter((item) => item.salesMode === salesMode).map(({ id }) => id);
      const completed = new Set([...succeeded, ...unchanged]);
      setSelectedIds((ids) => ids.filter((id) => !completed.has(Number(id))));
      await loadProductsRef.current();
      if (!isActive()) {
        if (!controller.signal.aborted) setSalesModeBatch(null);
        return;
      }
      setSalesModeBatch(null);
      if (!failed.length) {
        message.success(`已将 ${succeeded.length} 件商品改为${salesModeLabels[salesMode]}。`);
        return;
      }

      const failures = new Map(failed.map(({ id, error }) => [id, error]));
      modal.warning({
        title: `已修改 ${succeeded.length} 件商品，${failed.length} 件未确认完成`,
        content: (
          <ul className="product-manage__batch-list" aria-label="未确认完成的商品">
            {changes.filter(({ id }) => failures.has(id)).map(({ id, name, code }) => {
              const failure = failures.get(id) as ProductActionError | undefined;
              const reason = failure?.status === 409 && failure.errorCode !== "PRODUCT_SALES_MODE_CONFLICT"
                ? "商品状态或发布条件有冲突，请打开商品编辑页核对。"
                : getProductActionErrorMessage(failure, "修改销售方式");
              return <li key={id}>{name} · {code} · {reason}</li>;
            })}
          </ul>
        ),
        okText: "关闭",
      });
    } finally {
      salesModeInProgress.current = false;
      setBatchProcessing(false);
    }
  };

  const confirmBatchRestore = () => {
    const targets = selectedTrashProducts;
    if (!canRestoreTrash || batchUnavailable || !targets.length) return;
    if (targets.length > MAX_BATCH_SELECTION) {
      message.warning(`一次最多恢复 ${MAX_BATCH_SELECTION} 件商品，请减少勾选数量。`);
      return;
    }
    const epoch = currentSessionEpoch("admin");
    const isSameSession = () => isCurrentSessionEpoch("admin", epoch);
    modal.confirm({
      title: `恢复选中的 ${targets.length} 件商品为草稿？`,
      content: (
        <>
          <p>恢复后可重新编辑，商品不会自动上架。</p>
          <ul className="product-manage__permanent-delete-list" aria-label="待恢复商品">
            {targets.map(({ id, name, code }) => <li key={id}>{name} · {code}</li>)}
          </ul>
        </>
      ),
      okText: `恢复 ${targets.length} 件商品`,
      cancelText: ADMIN_COPY.actions.cancel,
      onOk: async () => {
        if (batchRestoreInProgress.current || !isSameSession()) return;
        batchRestoreInProgress.current = true;
        setBatchProcessing(true);
        try {
          const { succeeded, failed } = await runBatch(targets.map(({ id }) => id), (id) => {
            if (!isSameSession()) throw new StaleSessionResponseError("admin");
            return productApi.restore(id, { suppressGlobalError: true });
          });
          if (!isSameSession()) return;
          const completed = new Set(succeeded);
          setSelectedIds((ids) => ids.filter((id) => !completed.has(Number(id))));
          await Promise.all([
            loadProductsRef.current(undefined, { clampToLastPage: true }),
            loadCounts(),
          ]);
          if (!isSameSession()) return;
          if (!failed.length) {
            message.success(`已恢复 ${succeeded.length} 件商品为草稿。`);
            return;
          }
          const failures = new Map(failed.map(({ id, error }) => [id, error]));
          modal.warning({
            title: `已恢复 ${succeeded.length} 件商品，${failed.length} 件未恢复`,
            content: (
              <ul className="product-manage__permanent-delete-list" aria-label="未恢复商品">
                {targets.filter(({ id }) => failures.has(id)).map(({ id, name, code }) => (
                  <li key={id}>{name} · {code}：{getProductActionErrorMessage(failures.get(id), "恢复草稿")}</li>
                ))}
              </ul>
            ),
            okText: "关闭",
          });
        } finally {
          batchRestoreInProgress.current = false;
          setBatchProcessing(false);
        }
      },
    });
  };

  const permanentlyDeleteProducts = async (targets: Product[], sessionEpoch: number) => {
    const hasConfirmedSession = () =>
      isCurrentSessionEpoch("admin", sessionEpoch) && useAuthStore.getState().user?.role === "SUPER_ADMIN";
    if (permanentDeleteInProgress.current || !hasConfirmedSession()) return;
    permanentDeleteInProgress.current = true;
    setBatchProcessing(true);
    try {
      const { succeeded, failed } = await runBatch(targets.map(({ id }) => id), (id) => {
        if (!hasConfirmedSession()) throw new StaleSessionResponseError("admin");
        return productApi.permanentlyDelete(id);
      });
      if (!hasConfirmedSession()) return;
      const succeededIds = new Set(succeeded);
      setSelectedIds((ids) => ids.filter((id) => !succeededIds.has(Number(id))));
      await Promise.all([
        loadProductsRef.current(undefined, { clampToLastPage: true }),
        loadCounts(),
      ]);
      if (!hasConfirmedSession()) return;

      if (failed.length === 0) {
        message.success(targets.length === 1
          ? `「${targets[0].name}」已永久删除。`
          : `已永久删除 ${succeeded.length} 件商品。`);
        return;
      }

      const failedById = new Map(failed.map(({ id, error }) => [id, error]));
      modal.warning({
        title: succeeded.length
          ? `已永久删除 ${succeeded.length} 件商品，${failed.length} 件未完成`
          : "永久删除未完成",
        content: (
          <ul className="product-manage__permanent-delete-list">
            {targets.filter(({ id }) => failedById.has(id)).map(({ id, name }) => (
              <li key={id}>「{name}」{getPermanentDeleteErrorMessage(failedById.get(id))}</li>
            ))}
          </ul>
        ),
        okText: "关闭",
      });
    } finally {
      permanentDeleteInProgress.current = false;
      setBatchProcessing(false);
    }
  };

  const confirmPermanentDelete = (targets: Product[]) => {
    if (
      !canPermanentlyDelete || !targets.length || loading || batchProcessing || pendingProductId !== null
    ) return;
    if (targets.length > MAX_BATCH_SELECTION) {
      message.warning(`一次最多永久删除 ${MAX_BATCH_SELECTION} 件商品，请减少勾选数量。`);
      return;
    }
    const sessionEpoch = currentSessionEpoch("admin");
    modal.confirm({
      title: targets.length === 1
        ? `永久删除「${targets[0].name}」？`
        : `永久删除选中的 ${targets.length} 件商品？`,
      content: (
        <>
          <p>{PERMANENT_DELETE_CONSEQUENCE}</p>
          {targets.length > 1 && (
            <ul className="product-manage__permanent-delete-list" aria-label="勾选的商品">
              {targets.map(({ id, name }) => <li key={id}>{name}</li>)}
            </ul>
          )}
        </>
      ),
      okText: PERMANENT_DELETE_ACTION,
      okButtonProps: { danger: true, size: "large" },
      cancelText: ADMIN_COPY.actions.cancel,
      cancelButtonProps: { size: "large" },
      autoFocusButton: "cancel",
      onOk: () => permanentlyDeleteProducts(targets, sessionEpoch),
    });
  };

  const openBatchStock = async () => {
    const ids = selectedProductIds();
    if (!ids.length) {
      message.warning("请先选择商品，再设置库存");
      return;
    }
    const limited = ids.slice(0, MAX_BATCH_SELECTION);
    if (ids.length > MAX_BATCH_SELECTION) {
      message.warning(`一次最多为 ${MAX_BATCH_SELECTION} 件商品设置库存，已带上前 ${MAX_BATCH_SELECTION} 件`);
    }
    setStockModalOpen(true);
    setStockModalLoading(true);
    setStockRecords([]);
    setStockMissingNames([]);
    setStockTruncated(false);
    try {
      const known = new Map(
        products
          .filter((product) => limited.includes(product.id))
          .map((product) => [product.id, product]),
      );
      const missing = limited.filter((id) => !known.has(id));
      let cursor = 0;
      const worker = async () => {
        while (cursor < missing.length) {
          const id = missing[cursor++];
          try {
            const product = unwrapResponse<Product>(await productApi.getById(id));
            if (product?.id) known.set(product.id, product);
          } catch {
            // 读不到的商品留在后面的“没有库存记录”之外，由库存接口结果决定。
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, missing.length) }, worker));

      const pageSize = 100;
      const collected: Array<{
        id: number;
        quantity?: number;
        skuCode?: string;
        productName?: string;
        warehouse?: string | { name?: string };
        sku?: { skuCode?: string; product?: { id?: number; name?: string } };
      }> = [];
      let total = 0;
      for (let page = 1; page <= 5; page += 1) {
        const data = unwrapResponse<{ list: typeof collected; total: number }>(
          await inventoryApi.getList({ page, pageSize, productIds: limited.join(",") }),
        );
        if (!data || !Array.isArray(data.list) || !Number.isFinite(Number(data.total))) {
          throw new Error("Invalid inventory response");
        }
        total = Number(data.total);
        collected.push(...data.list);
        if (collected.length >= total || data.list.length === 0) break;
      }

      const records: BatchStockSource[] = [];
      const seenProductIds = new Set<number>();
      for (const item of collected) {
        const productId = item.sku?.product?.id;
        if (!Number.isInteger(productId) || productId == null) continue;
        const product = known.get(productId);
        seenProductIds.add(productId);
        const warehouse = typeof item.warehouse === "string" ? item.warehouse : item.warehouse?.name;
        records.push({
          id: item.id,
          productId,
          productName: item.sku?.product?.name ?? item.productName ?? product?.name ?? "未命名商品",
          skuCode: item.sku?.skuCode ?? item.skuCode ?? "",
          warehouse: warehouse ?? "",
          quantity: item.quantity ?? 0,
          inventoryPolicy: product?.inventoryPolicy,
        });
      }
      setStockRecords(records);
      setStockMissingNames(limited.flatMap((id) => {
        if (seenProductIds.has(id)) return [];
        return [known.get(id)?.name ?? `商品 ${id}`];
      }));
      setStockTruncated(collected.length < total);
    } catch (error: unknown) {
      message.error(getSafeAdminErrorMessage(error, "库存读取失败，请稍后重试。"));
      setStockModalOpen(false);
    } finally {
      setStockModalLoading(false);
    }
  };

  const applyBatchStock = async (updates: BatchStockUpdate[], remark: string) => {
    if (!updates.length || batchProcessing) return;
    setBatchProcessing(true);
    message.loading({
      content: `正在更新 ${updates.length} 条库存…`,
      key: "batch-stock",
      duration: 0,
    });
    const queue = [...updates];
    const failed: unknown[] = [];
    let succeeded = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const current = queue[cursor++];
        try {
          await inventoryApi.update(current.id, {
            type: "adjust",
            quantity: current.quantity,
            expectedQuantity: current.expectedQuantity,
            remark,
          });
          succeeded += 1;
        } catch (error: unknown) {
          failed.push(error);
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
      if (failed.length === 0) {
        message.success({ content: `已更新 ${succeeded} 条库存`, key: "batch-stock" });
        setStockModalOpen(false);
      } else if (succeeded > 0) {
        message.warning({
          content: `已更新 ${succeeded} 条库存，${failed.length} 条未完成。${getSafeAdminErrorMessage(failed[0], "请重新打开预览后再试。")}`,
          key: "batch-stock",
        });
        setStockModalOpen(false);
      } else {
        message.error({
          content: getSafeAdminErrorMessage(failed[0], "库存调整失败，请核对后重试。"),
          key: "batch-stock",
        });
      }
      if (succeeded > 0) void loadProducts();
    } finally {
      setBatchProcessing(false);
    }
  };

  const openBatchPrice = async () => {
    const ids = selectedProductIds();
    if (!ids.length) {
      message.warning("请先选择商品，再设置成交价");
      return;
    }
    const limited = ids.slice(0, MAX_BATCH_SELECTION);
    if (ids.length > MAX_BATCH_SELECTION) {
      message.warning(`一次最多为 ${MAX_BATCH_SELECTION} 件商品设置成交价，已带上前 ${MAX_BATCH_SELECTION} 件`);
    }
    setPriceModalOpen(true);
    setPriceModalLoading(true);
    setPriceUnresolvedCount(0);
    const known = new Map(
      products
        .filter((product) => limited.includes(product.id))
        .map((product) => [product.id, product]),
    );
    const missing = limited.filter((id) => !known.has(id));
    let unresolved = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < missing.length) {
        const id = missing[cursor++];
        try {
          const product = unwrapResponse<Product>(await productApi.getById(id));
          if (product?.id) known.set(product.id, product);
          else unresolved += 1;
        } catch {
          unresolved += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, missing.length) }, worker));
    setPriceTargets(limited.flatMap((id) => {
      const product = known.get(id);
      return product ? [product] : [];
    }));
    setPriceUnresolvedCount(unresolved);
    setPriceModalLoading(false);
  };

  const applyBatchPrice = async (updates: BatchPriceUpdate[]) => {
    if (!updates.length || batchProcessing) return;
    setBatchProcessing(true);
    message.loading({
      content: `正在更新 ${updates.length} 个规格的成交价…`,
      key: "batch-price",
      duration: 0,
    });
    const queue = [...updates];
    const failed: unknown[] = [];
    let succeeded = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const current = queue[cursor++];
        try {
          await productApi.updateSku(current.productId, current.skuId, { price: current.price });
          succeeded += 1;
        } catch (error: unknown) {
          failed.push(error);
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
      if (failed.length === 0) {
        message.success({ content: `已更新 ${succeeded} 个规格的成交价`, key: "batch-price" });
        setPriceModalOpen(false);
      } else if (succeeded > 0) {
        message.warning({
          content: `已更新 ${succeeded} 个规格，${failed.length} 个未完成。${getProductActionErrorMessage(failed[0], "改价")}`,
          key: "batch-price",
        });
      } else {
        message.error({
          content: getProductActionErrorMessage(failed[0], "改价"),
          key: "batch-price",
        });
      }
      if (succeeded > 0) void loadProducts();
    } finally {
      setBatchProcessing(false);
    }
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
        setSelectedIds([]);
      } else if (succeeded.length > 0) {
        setSelectedIds(failed.map(({ id }) => id));
        message.warning(`${ADMIN_COPY.feedback.partialSuccess(succeeded.length, selectedIds.length)}${getProductActionErrorMessage(failed[0].error, "批量状态更新")}`);
      } else {
        setSelectedIds(failed.map(({ id }) => id));
        message.error(getProductActionErrorMessage(failed[0]?.error, "批量状态更新"));
      }
      await Promise.all([loadProductsRef.current(), loadCounts()]);
    } finally {
      message.destroy("batch-status");
      setBatchProcessing(false);
    }
  };

  const requestSelectedStatusChange = (status: ProductStatus) => {
    if (!selectedIds.length) {
      message.warning("请先选择商品，再进行批量操作");
      return;
    }
    if (status === "PUBLISHED") {
      modal.confirm({
        title: `确认批量上架 ${selectedIds.length} 件商品？`,
        content: `上架后，这 ${selectedIds.length} 件商品将立即对各自当前可见范围内的客户展示。请确认商品资料和可见范围已核对。`,
        okText: "确认批量上架",
        cancelText: "取消",
        onOk: () => changeSelectedStatus("PUBLISHED"),
      });
      return;
    }
    if (status !== "OFFLINE") {
      void changeSelectedStatus(status);
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

  const submitSelectedForReview = async () => {
    if (!selectedIds.length) {
      message.warning("请先选择草稿商品，再提交审核");
      return;
    }
    setBatchProcessing(true);
    try {
      const { succeeded, failed } = await runBatch(selectedIds, (id) => productApi.submitForReview(id));
      if (failed.length === 0) {
        message.success(`已提交 ${succeeded.length} 件商品审核`);
        setSelectedIds([]);
      } else {
        setSelectedIds(failed.map(({ id }) => id));
        message.warning(`已提交 ${succeeded.length} 件，${failed.length} 件未提交；请确认所选商品仍为草稿。`);
      }
      await Promise.all([loadProductsRef.current(), loadCounts()]);
    } finally {
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
        message.warning(`${ADMIN_COPY.feedback.partialSuccess(succeeded.length, succeeded.length + failed.length)}${getProductActionErrorMessage(failed[0].error, "批量移入回收站")}`);
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
      content: `将选中的 ${selectedIds.length} 件商品移入回收站？之后可在回收站恢复为草稿。`,
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
    navigate(
      `/admin/products/new?returnTo=${encodeURIComponent(listReturnPath)}`,
    );
  }, [categoriesLoaded, listReturnPath, message, navigate]);

  const openEdit = useCallback(
    (product: Product) => {
      navigate(
        `/admin/products/${product.id}/edit?returnTo=${encodeURIComponent(listReturnPath)}`,
      );
    },
    [listReturnPath, navigate],
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
          priceMin: pick("priceMin"),
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
        const subTasks: Array<{ label: string; task: Promise<unknown> }> = [
          ...(source.images || []).map((img, index) => ({
            label: `图片 ${index + 1}`,
            task: productApi.addImage(created.id, {
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
          })),
          ...(source.certificates || []).map((cert, index) => ({
            label: `证书 ${index + 1}`,
            task: productApi.addCertificate(created.id, {
              certType: cert.certType,
              certNumber: cert.certNumber,
              certImage: cert.certImage,
              expireDate: cert.expireDate,
            }),
          })),
          {
            label: "商品标签",
            task: productApi.updateTags(
              created.id,
              (source.tags || []).map((t) => t.tagName),
            ),
          },
        ];
        const results = await Promise.allSettled(subTasks.map(({ task }) => task));
        const failedLabels = results.flatMap((result, index) =>
          result.status === "rejected" ? [subTasks[index].label] : [],
        );
        if (failedLabels.length === 0) {
          message.success(`已复制为「${created.name}」（SKU 库存已归零，请在编辑页补库存）`);
        } else {
          message.warning(
            `主商品「${created.name}」已创建；未完成：${failedLabels.join("、")}。SKU 库存已归零，请在编辑页核对后重试。`,
          );
        }
        navigate(
          `/admin/products/${created.id}/edit?returnTo=${encodeURIComponent(listReturnPath)}`,
        );
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
    { key: "all", label: `全部（${countsAvailable ? counts.all ?? total : "—"}）` },
    ...statuses.map((status) => ({
      key: status,
      label: `${statusMeta[status].label}（${countsAvailable ? counts[status] ?? 0 : "—"}）`,
    })),
  ];

  return (
    <div className="product-manage">
      <AdminPageHeader
        title="商品管理"
        subtitle="维护商品资料、销售方式、上架状态与回收站。"
      />
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
                if (!selected && (isTrash || tab.key === "ARCHIVED")) setSelectedIds([]);
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
        {/* 违规商品维度暂无真实数据来源，入口已移除；接入审核体系后再恢复，避免假计数误导运营 */}
      </div>

      <div className="product-manage__scroll" role="region" aria-label="商品筛选与列表" tabIndex={0}>
        <div className="product-manage__filters">
          <div className="product-manage__filter-fields">
            <Input
              placeholder="搜索商品标题"
              value={titleKeyword}
              allowClear
              onChange={(event) => setTitleKeyword(event.target.value)}
              onPressEnter={search}
            />
            <Input
              placeholder="搜索商品 ID，多个 ID 以逗号或空格分隔"
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
                aria-expanded={isAdvancedOpen}
                aria-controls="product-advanced-filters"
              >
                {isAdvancedOpen ? "收起" : "展开"} <DownOutlined rotate={isAdvancedOpen ? 180 : 0} />
              </Button>
            </Space>
          </div>
        </div>

        {isAdvancedOpen && (
          <div id="product-advanced-filters" className="product-manage__advanced-filters">
            <Select
              placeholder="店铺分类"
              value={categoryId}
              onChange={(value) => {
                setCategoryId(value);
                setIncludeDescendants(false);
                setPage(1);
              }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={categoryOptions}
            />
            <span>资料完整度按当前页返回的商品信息展示；直接销售还会检查成交价。</span>
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
            {canImport && !isTrash && (
              <Button disabled={!categoriesLoaded} onClick={() => setFolderImportOpen(true)}>
                按文件夹导入商品草稿
              </Button>
            )}
            {canGovernPublic && !isTrash && (
              <Button disabled={loading || batchProcessing || pendingProductId !== null}
                onClick={() => setCustomPricingOpen(true)}>
                统一设置预约定制
              </Button>
            )}
            {canRestoreTrash && (
              <Button
                className="product-manage__secondary-button"
                disabled={!selectedTrashProducts.length || batchUnavailable}
                onClick={confirmBatchRestore}
              >
                批量恢复草稿
              </Button>
            )}
            {canPermanentlyDelete && (
              <Button
                danger
                className="product-manage__permanent-delete-button"
                disabled={!selectedTrashProducts.length || loading || batchProcessing || pendingProductId !== null}
                onClick={() => confirmPermanentDelete(selectedTrashProducts)}
              >
                批量永久删除
              </Button>
            )}
            {!isTrash && <Dropdown
              overlayClassName="product-manage__dropdown"
              menu={{
                items: [
                  ...(canImport ? [
                    { key: "move-category", label: "批量改分类", onClick: openCategoryMove },
                    { key: "sales-mode", label: "批量改销售方式", onClick: openSalesModeBatch },
                    { type: "divider" as const },
                  ] : []),
                  {
                    key: "price",
                    label: "批量设置成交价",
                    disabled: batchProcessing,
                    onClick: () => void openBatchPrice(),
                  },
                  ...(canInventory ? [{
                    key: "inventory",
                    label: "批量设置库存",
                    disabled: batchProcessing,
                    onClick: () => void openBatchStock(),
                  }] : []),
                  { type: "divider" },
                  ...(canGovernPublic ? [
                    {
                      key: "published",
                      label: "批量上架",
                      disabled: batchProcessing,
                      onClick: () => requestSelectedStatusChange("PUBLISHED"),
                    },
                    {
                      key: "offline",
                      label: "批量下架",
                      disabled: batchProcessing,
                      onClick: () => requestSelectedStatusChange("OFFLINE"),
                    },
                    {
                      key: "delete",
                      label: "移入回收站",
                      danger: true,
                      disabled: batchProcessing,
                      onClick: confirmBatchArchive,
                    },
                  ] : [
                    {
                      key: "submit-review",
                      label: "批量提交审核",
                      disabled: batchProcessing || activeStatus === "PUBLISHED" || activeStatus === "OFFLINE",
                      onClick: () => void submitSelectedForReview(),
                    },
                    {
                      key: "archive-drafts",
                      label: "将草稿移入回收站",
                      danger: true,
                      disabled: batchProcessing || activeStatus !== "DRAFT",
                      onClick: confirmBatchArchive,
                    },
                  ]),
                ],
              }}
            >
              <Button className="product-manage__secondary-button" disabled={!selectedProducts.length || batchUnavailable} loading={batchProcessing}>
                更多批量操作 <DownOutlined />
              </Button>
            </Dropdown>}
            {(!isTrash || canRestoreTrash) && (
              <Space size={4} wrap>
                <span className="product-manage__selected-count" role="status">
                  已选 {selectedProducts.length} 件
                </span>
                {selectedProducts.length > 0 && (
                  <Button type="link" disabled={batchUnavailable} onClick={() => setSelectedIds([])}>
                    清除选择
                  </Button>
                )}
              </Space>
            )}
          </Space>
          <span className="product-manage__total-count">共 {total} 件商品</span>
        </div>

        {error ? (
          <AdminErrorState
            subject="商品"
            message={error}
            onRetry={() => void loadProducts()}
          />
        ) : loading && products.length === 0 ? (
          <AdminLoadingState subject="商品" />
        ) : (
          <ProductManageTable
            products={visibleProducts}
            loading={loading}
            selectedIds={selectedProducts.map(({ id }) => id)}
            batchProcessing={batchProcessing}
            pendingProductId={pendingProductId}
            hasFilters={hasFilters}
            canGovernPublic={canGovernPublic}
            onSelectionChange={!isTrash || canRestoreTrash ? setSelectedIds : undefined}
            onOpenEdit={openEdit}
            onClone={cloneProduct}
            onRequestStatusChange={requestStatusChange}
            onConfirmArchive={confirmArchive}
            onConfirmRestore={confirmRestore}
            onConfirmPermanentDelete={canPermanentlyDelete ? (product) => confirmPermanentDelete([product]) : undefined}
            onSubmitForReview={(product) => void submitForReview(product)}
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
      {canImport && categoryMoveTargets.length > 0 && (
        <CategoryBatchMoveDialog
          key={staffId}
          products={categoryMoveTargets}
          tree={categoryTree}
          onCancel={() => setCategoryMoveTargets([])}
          onBusyChange={setBatchProcessing}
          onApplied={async (completedIds, moved, failed) => {
            const completed = new Set(completedIds);
            setSelectedIds((ids) => ids.filter((id) => !completed.has(Number(id))));
            setCategoryMoveTargets((targets) => targets.filter(({ id }) => !completed.has(id)));
            if (!failed) message.success(`已更新 ${moved} 件商品的分类。`);
            else message.warning(`已更新 ${moved} 件商品的分类，${failed} 件未更新。`);
            await loadProductsRef.current(undefined, { clampToLastPage: true });
          }}
        />
      )}
      {canImport && salesModeBatch && (
        <ProductBatchSalesModeModal
          products={salesModeBatch.products}
          applying={batchProcessing}
          onCancel={() => { if (!salesModeInProgress.current) setSalesModeBatch(null); }}
          onApply={applySalesModeBatch}
        />
      )}
      <ProductBatchPriceModal
        open={priceModalOpen}
        loading={priceModalLoading}
        products={priceTargets}
        unresolvedCount={priceUnresolvedCount}
        canChangePublished={canGovernPublic}
        applying={batchProcessing}
        onCancel={() => {
          if (batchProcessing) return;
          setPriceModalOpen(false);
        }}
        onApply={(updates) => void applyBatchPrice(updates)}
      />
      {customPricingOpen && canGovernPublic && <ProductCustomPricingModal
        selectedIds={selectedProductIds()}
        onCancel={() => setCustomPricingOpen(false)}
        onUpdated={() => { void loadProducts(); }}
      />}
      {folderImportOpen && canImport && (
        <ProductFolderImportModal
          key={staffId}
          categories={importCategories}
          canPublish={canGovernPublic}
          canAuthorizeImages={role === "SUPER_ADMIN"}
          onClose={() => setFolderImportOpen(false)}
          onChanged={() => { void Promise.all([loadProductsRef.current(), loadCounts()]); }}
        />
      )}
      <ProductBatchStockModal
        open={stockModalOpen}
        loading={stockModalLoading}
        records={stockRecords}
        missingProductNames={stockMissingNames}
        truncated={stockTruncated}
        applying={batchProcessing}
        onCancel={() => {
          if (batchProcessing) return;
          setStockModalOpen(false);
        }}
        onApply={(updates, remark) => void applyBatchStock(updates, remark)}
      />
    </div>
  );
}
