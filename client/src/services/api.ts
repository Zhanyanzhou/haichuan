// 前端 API 层：customer(认证/收藏/找回/SMS/合规)/marketing(含可用券)/reviews/recommendation 等
import { CONTENT_TEMPLATE_PAGE_METADATA } from "@/page-builder/generated/contentTemplates.generated";
import {
  USE_MOCK,
  mockDelay,
  mockProducts,
  mockOrders,
  mockUsers,
  mockGoldPrice,
  mockGoldPriceHistory,
  filterProducts,
  paginate,
} from "./mockData";
import api, {
  clearCustomerSession,
  customerAuthHeaders,
  requestStatus,
  type NormalizedRequestError,
} from "./httpClient";
import { mockResponse as mockRes } from "./mockResponse";
import {
  getBrowserPublicContentLocale,
  type PublicContentLocale,
} from "@/i18n/publicLocale";

export {
  publicPageDocumentStreamUrl,
  publicProductStreamUrl,
} from "./httpClient";
export {
  categoryApi,
  type CategoryReferenceResult,
} from "./clients/categoryClient";
export {
  attributeApi,
  type AttributeCreateInput,
  type AttributeUpdateInput,
  type AttributeValueInput,
} from "./clients/attributeClient";
export {
  tagApi,
  type TagCreateInput,
  type TagUpdateInput,
} from "./clients/tagClient";
export {
  aiClassifyApi,
  type AiClassifyConfirmationInput,
  type AiClassifyRecordQuery,
  type AiDescriptionInput,
} from "./clients/aiClassifyClient";
export {
  shippingTemplateApi,
  type ShippingFeeMode,
  type ShippingTemplateCreateInput,
  type ShippingTemplateUpdateInput,
} from "./clients/shippingTemplateClient";
export {
  statisticsApi,
  type TrendMetric,
} from "./clients/statisticsClient";
export { settingsApi } from "./clients/settingsClient";
export { recommendationApi } from "./clients/recommendationClient";
export {
  customerAdminApi,
  type CustomerAdminListQuery,
} from "./clients/customerAdminClient";
export {
  inquiriesApi,
  type InquiryListQuery,
  type InquiryStatusUpdateInput,
  type InquirySubmitInput,
} from "./clients/inquiriesClient";
export {
  selectionInquiryApi,
  type SelectionInquiryListQuery,
  type SelectionInquiryUpdateInput,
  type SelectionInquirySubmitItem,
  type SelectionInquirySubmitInput,
} from "./clients/selectionInquiryClient";
export {
  reviewApi,
  type ReviewSubmitInput,
  type ReviewListQuery,
  type ReviewAdminListQuery,
  type ReviewModerationInput,
} from "./clients/reviewClient";

type LifecycleMockProduct = {
  id: number;
  status: string;
  deletedAt?: string | null;
  [key: string]: unknown;
};

function mockRequestError(
  message: string,
  status: number,
): NormalizedRequestError {
  const error = new Error(message) as NormalizedRequestError;
  error.status = status;
  return error;
}

// ===== Auth API =====
export const authApi = {
  login: async (data: { username: string; password: string }) => {
    if (USE_MOCK) {
      await mockDelay();
      // Mock 是显式本机模式，不模拟真实凭据校验，也不把凭据写入浏览器环境变量。
      if (data.username.trim() && data.password.trim()) {
        return mockRes({ accessToken: "mock-jwt-token", user: mockUsers[0] });
      }
      throw new Error("用户名或密码错误");
    }
    return api.post("/auth/login", data);
  },
  register: (data: any) => api.post("/auth/register", data),
  getProfile: async () => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockUsers[0]);
    }
    return api.get("/auth/profile");
  },
};

// ===== Products API =====
const MOCK_PRODUCTS_STORAGE_KEY = "haichuan.mock-products";

function getMockProducts() {
  if (typeof window === "undefined") return mockProducts;
  try {
    const saved = window.localStorage.getItem(MOCK_PRODUCTS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        mockProducts.length = 0;
        mockProducts.push(...(parsed as any[]));
      }
    }
  } catch {
    // 模拟数据损坏时回退到代码中的初始样本。
  }
  return mockProducts;
}

function findActiveMockProduct(id: number): LifecycleMockProduct | undefined {
  return (getMockProducts() as unknown as LifecycleMockProduct[]).find(
    (product) => product.id === id && !product.deletedAt,
  );
}

function persistMockProducts() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      MOCK_PRODUCTS_STORAGE_KEY,
      JSON.stringify(mockProducts),
    );
  } catch {
    // 本地存储不可用不应影响商品编辑主流程。
  }
}

export interface ProductAdminQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  categoryId?: number;
  status?: string;
  visibility?: string;
  sortBy?: "updated_desc" | "code_asc" | "sortOrder";
  materialType?: string;
  salesMode?: string;
  isHot?: string;
  isRecommended?: string;
  ids?: string;
  codes?: string;
}

export interface ProductReferenceResult {
  code?: string;
  legacyId?: number;
  id?: number;
  name?: string;
  price?: number | string | null;
  status?: string;
  visibility?: string;
  category?: { id: number; name: string };
  thumbnail?: string;
  eligible: boolean;
  reason:
    | "AVAILABLE"
    | "DELETED"
    | "OFFLINE"
    | "DRAFT"
    | "ARCHIVED"
    | "NON_PUBLIC"
    | "MISSING_IMAGE"
    | "NOT_FOUND"
    | "FORBIDDEN"
    | "RESOLVE_FAILED";
}

export const productApi = {
  getList: async (params: ProductAdminQuery, signal?: AbortSignal) => {
    if (USE_MOCK) {
      await mockDelay();
      const idSet = params?.ids
        ? new Set(
            String(params.ids)
              .split(",")
              .map((id) => Number(id.trim()))
              .filter((id) => Number.isInteger(id) && id > 0),
          )
        : null;
      const codeSet = params?.codes
        ? new Set(String(params.codes).split(",").map((code) => code.trim()).filter(Boolean))
        : null;
      const availableProducts = (
        getMockProducts() as unknown as LifecycleMockProduct[]
      ).filter((product) => !product.deletedAt);
      const filtered = filterProducts(
        availableProducts as typeof mockProducts,
        params,
      ).filter(
        (product) =>
          (!idSet || idSet.has(product.id)) &&
          (!codeSet || codeSet.has(typeof product.code === "string" ? product.code : "")) &&
          (params?.status ? true : product.status !== "ARCHIVED"),
      );
      return mockRes({
        ...paginate(filtered, params.page || 1, params.pageSize || 20),
        facets: {
          sizes: Array.from(
            new Set(filtered.map((product) => product.size).filter(Boolean)),
          ).sort(),
        },
      });
    }
    return api.get("/products", { params, signal });
  },
  resolveReferences: async (input: { codes?: string[]; legacyIds?: number[] }, signal?: AbortSignal) => {
    if (USE_MOCK) {
      await mockDelay();
      const products = getMockProducts() as unknown as LifecycleMockProduct[];
      const mapProduct = (product: LifecycleMockProduct | undefined, reference: { code?: string; legacyId?: number }): ProductReferenceResult => {
        if (!product) return { ...reference, eligible: false, reason: "NOT_FOUND" };
        const image = (product as any).listingImage || (product as any).primaryImage || (product as any).images?.[0];
        const reason: ProductReferenceResult["reason"] = product.deletedAt
          ? "DELETED"
          : product.status === "OFFLINE"
            ? "OFFLINE"
            : product.status === "DRAFT"
              ? "DRAFT"
              : product.status === "ARCHIVED"
                ? "ARCHIVED"
                : (product as any).visibility && (product as any).visibility !== "PUBLIC"
                  ? "NON_PUBLIC"
                  : !image
                    ? "MISSING_IMAGE"
                    : "AVAILABLE";
        return {
          ...reference,
          id: typeof product.id === "number" ? product.id : undefined,
          code: typeof product.code === "string" ? product.code : undefined,
          name: typeof product.name === "string" ? product.name : undefined,
          price:
            typeof product.price === "number" || typeof product.price === "string"
              ? product.price
              : product.price === null
                ? null
                : undefined,
          status: product.status,
          visibility: (product as any).visibility,
          category: (product as any).category,
          thumbnail: typeof image === "string" ? image : image?.mediaUrl || image?.url || "",
          eligible: reason === "AVAILABLE",
          reason,
        };
      };
      return mockRes([
        ...(input.codes ?? []).map((code) => mapProduct(products.find((product) => product.code === code), { code })),
        ...(input.legacyIds ?? []).map((legacyId) => mapProduct(products.find((product) => product.id === legacyId), { legacyId })),
      ]);
    }
    return api.post("/products/admin/resolve-references", input, { signal });
  },
  getCounts: async () => {
    if (USE_MOCK) {
      await mockDelay();
      const products = (
        getMockProducts() as unknown as LifecycleMockProduct[]
      ).filter((product) => !product.deletedAt);
      const counts: Record<string, number> = {
        all: products.filter((product) => product.status !== "ARCHIVED").length,
      };
      ["PUBLISHED", "OFFLINE", "DRAFT", "ARCHIVED"].forEach((status) => {
        counts[status] = products.filter(
          (p: any) => p.status === status,
        ).length;
      });
      return mockRes(counts);
    }
    return api.get("/products/counts");
  },
  getPublicList: async (params: any = {}, signal?: AbortSignal) => {
    const locale: PublicContentLocale = params.locale ?? getBrowserPublicContentLocale();
    if (USE_MOCK) {
      await mockDelay();
      if (locale === "en") {
        return mockRes({
          list: [],
          total: 0,
          page: Number(params.page) || 1,
          pageSize: Number(params.pageSize) || 20,
          facets: { sizes: [] },
        });
      }
      const idSet = params.ids
        ? new Set(
            String(params.ids)
              .split(",")
              .map((id) => Number(id.trim()))
              .filter((id) => Number.isInteger(id) && id > 0),
          )
        : null;
      const filtered = filterProducts(getMockProducts(), {
        ...params,
        status: "PUBLISHED",
      }).filter((product) => !idSet || idSet.has(product.id));
      const facetProducts = filterProducts(getMockProducts(), {
        status: "PUBLISHED",
        categoryId: params.categoryId,
        categoryIds: params.categoryIds,
      });
      return mockRes({
        ...paginate(filtered, params.page || 1, params.pageSize || 20),
        facets: {
          sizes: Array.from(
            new Set(facetProducts.map((product) => product.size).filter(Boolean)),
          ).sort(),
        },
      });
    }
    if (!localStorage.getItem("customerToken")) {
      return api.get("/products/public", {
        params: { ...params, locale },
        signal,
        suppressGlobalError: true,
      });
    }
    try {
      return await api.get("/products/catalog", {
        params: { ...params, locale },
        signal,
        headers: customerAuthHeaders(),
        suppressGlobalError: true,
      });
    } catch (error) {
      if (requestStatus(error) !== 401) throw error;
      // 客户令牌失效时不把公开浏览变成登录墙，清理旧会话后降级到游客目录。
      clearCustomerSession();
      return api.get("/products/public", {
        params: { ...params, locale },
        signal,
        suppressGlobalError: true,
      });
    }
  },
  getById: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay();
      const p = findActiveMockProduct(id);
      if (!p) throw new Error("产品不存在");
      return mockRes(p);
    }
    return api.get(`/products/${id}`);
  },
  getAttributes: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes([]);
    }
    return api.get(`/products/${id}/attributes`);
  },
  setAttributes: async (id: number, attributeValueIds: number[]) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes([]);
    }
    return api.put(`/products/${id}/attributes`, { attributeValueIds });
  },
  getPublicById: async (
    id: string | number,
    options: {
      suppressGlobalError?: boolean;
      locale?: PublicContentLocale;
    } = {},
  ) => {
    const locale = options.locale ?? getBrowserPublicContentLocale();
    const requestOptions = {
      suppressGlobalError: options.suppressGlobalError,
      params: { locale },
    };
    if (USE_MOCK) {
      await mockDelay();
      if (locale === "en") throw new Error("Requested locale is not published");
      const product = getMockProducts().find(
        (item) => (item.code === String(id) || item.id === Number(id)) && item.status === "PUBLISHED",
      );
      if (!product) throw new Error("商品当前不可浏览");
      return mockRes(product);
    }
    const reference = encodeURIComponent(String(id));
    if (!localStorage.getItem("customerToken")) {
      return api.get(`/products/public/${reference}`, requestOptions);
    }
    try {
      return await api.get(`/products/catalog/${reference}`, {
        headers: customerAuthHeaders(),
        ...requestOptions,
      });
    } catch (error) {
      if (requestStatus(error) !== 401) throw error;
      clearCustomerSession();
      return api.get(`/products/public/${reference}`, requestOptions);
    }
  },
  create: async (data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const products = getMockProducts();
      const id = Math.max(0, ...products.map((product) => product.id)) + 1;
      const product: Record<string, unknown> = {
        id,
        ...data,
        status: data.status || "DRAFT",
        isHot: data.isHot ?? false,
        isNew: data.isNew ?? false,
        isRecommended: data.isRecommended ?? false,
        isLimited: data.isLimited ?? false,
        isCustom: data.isCustom ?? false,
        viewCount: 0,
        salesCount: 0,
        images: [],
        skus: [],
        certificates: [],
        tags: [],
        createdAt: new Date().toISOString(),
      };
      products.push(product as any);
      persistMockProducts();
      return mockRes(product);
    }
    return api.post("/products", data);
  },
  update: async (id: number, data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find((item) => item.id === id) as any;
      if (!product) throw new Error("商品不存在");
      Object.assign(product, data);
      persistMockProducts();
      return mockRes(product);
    }
    return api.put(`/products/${id}`, data);
  },
  archive: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = findActiveMockProduct(id);
      if (!product) throw mockRequestError("商品不存在或已被其他人处理", 404);
      if (product.status === "ARCHIVED") {
        throw mockRequestError("商品已在回收站，请刷新列表确认最新状态", 409);
      }
      product.status = "ARCHIVED";
      persistMockProducts();
      return mockRes(product);
    }
    return api.put(`/products/${id}/archive`);
  },
  restore: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = findActiveMockProduct(id);
      if (!product) throw mockRequestError("商品不存在或已被其他人处理", 404);
      if (product.status !== "ARCHIVED") {
        throw mockRequestError("商品已不在回收站，请刷新列表确认最新状态", 409);
      }
      product.status = "DRAFT";
      persistMockProducts();
      return mockRes(product);
    }
    return api.put(`/products/${id}/restore`);
  },
  /* 图片管理 */
  addImage: async (
    productId: number,
    data: {
      url?: string;
      storageKey?: string;
      type?: string;
      sortOrder?: number;
      isVideo?: boolean;
      width?: number;
      height?: number;
      mimeType?: string;
      fileSize?: number;
    },
  ) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      ) as any;
      if (!product) throw new Error("商品不存在");
      const image = {
        id: Date.now(),
        productId,
        url: data.url,
        type: data.type || "FRONT",
        sortOrder: data.sortOrder ?? product.images.length + 1,
        isVideo: data.isVideo ?? false,
      };
      product.images.push(image);
      persistMockProducts();
      return mockRes(image);
    }
    return api.post(`/products/${productId}/images`, data);
  },
  updateImage: async (
    productId: number,
    imageId: number,
    data: { type?: string; sortOrder?: number },
  ) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      ) as any;
      const image = product?.images.find((item: any) => item.id === imageId);
      if (!image) throw new Error("商品图片不存在");
      Object.assign(image, data);
      persistMockProducts();
      return mockRes(image);
    }
    return api.put(`/products/${productId}/images/${imageId}`, data);
  },
  deleteImage: async (productId: number, imageId: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      ) as any;
      if (!product) throw new Error("商品不存在");
      product.images = product.images.filter(
        (item: any) => item.id !== imageId,
      );
      persistMockProducts();
      return mockRes({ success: true });
    }
    return api.delete(`/products/${productId}/images/${imageId}`);
  },
  setCoverImage: async (productId: number, imageId: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      ) as any;
      const image = product?.images.find((item: any) => item.id === imageId);
      if (!image) throw new Error("商品图片不存在");
      product.images.forEach((item: any) => {
        if (item.type === "FRONT") item.type = "SIDE";
      });
      image.type = "FRONT";
      image.sortOrder = 0;
      product.images.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
      persistMockProducts();
      return mockRes(image);
    }
    // 后端 setPrimaryImage 已自动同步 listingImageId，无需重复调用
    return api.put(`/products/${productId}/images/primary`, { imageId });
  },
  /* 状态操作 */
  publish: async (id: number) => {
    if (USE_MOCK) {
      const product = getMockProducts().find((item) => item.id === id) as any;
      if (!product) throw new Error("商品不存在");
      product.status = "PUBLISHED";
      persistMockProducts();
      return mockRes(product);
    }
    return api.put(`/products/${id}/status`, { status: "PUBLISHED" });
  },
  unpublish: async (id: number) => {
    if (USE_MOCK) {
      const product = getMockProducts().find((item) => item.id === id) as any;
      if (!product) throw new Error("商品不存在");
      product.status = "OFFLINE";
      persistMockProducts();
      return mockRes(product);
    }
    return api.put(`/products/${id}/status`, { status: "OFFLINE" });
  },
  updateStatus: async (id: number, status: string) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find((item) => item.id === id) as any;
      if (!product) throw new Error("商品不存在");
      product.status = status;
      persistMockProducts();
      return mockRes(product);
    }
    return api.put(`/products/${id}/status`, { status });
  },
  /* 标签管理 */
  getTags: async (productId: number) => {
    if (USE_MOCK) {
      await mockDelay();
      const product = getMockProducts().find((item) => item.id === productId);
      return mockRes(product?.tags || []);
    }
    return api.get(`/products/${productId}/tags`);
  },
  updateTags: async (productId: number, tags: string[]) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      ) as any;
      if (!product) throw new Error("商品不存在");
      product.tags = tags.map((tagName, i) => ({
        id: Date.now() + i,
        productId,
        tagName,
      }));
      persistMockProducts();
      return mockRes(product.tags);
    }
    return api.put(`/products/${productId}/tags`, { tags });
  },
  /* 证书管理 */
  addCertificate: async (
    productId: number,
    data: {
      certType: string;
      certNumber: string;
      certImage?: string;
      expireDate?: string;
    },
  ) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      ) as any;
      if (!product) throw new Error("商品不存在");
      const cert = { id: Date.now(), productId, ...data };
      if (!product.certificates) product.certificates = [];
      product.certificates.push(cert);
      persistMockProducts();
      return mockRes(cert);
    }
    return api.post(`/products/${productId}/certificates`, data);
  },
  updateCertificate: async (
    productId: number,
    certId: number,
    data: {
      certType?: string;
      certNumber?: string;
      certImage?: string;
      expireDate?: string;
    },
  ) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      ) as any;
      const cert = product?.certificates?.find((c: any) => c.id === certId);
      if (!cert) throw new Error("证书不存在");
      Object.assign(cert, data);
      persistMockProducts();
      return mockRes(cert);
    }
    return api.put(`/products/${productId}/certificates/${certId}`, data);
  },
  deleteCertificate: async (productId: number, certId: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      ) as any;
      if (!product) throw new Error("商品不存在");
      product.certificates = (product.certificates || []).filter(
        (c: any) => c.id !== certId,
      );
      persistMockProducts();
      return mockRes({ success: true });
    }
    return api.delete(`/products/${productId}/certificates/${certId}`);
  },
  /* SKU 管理 */
  getSkus: async (productId: number) => {
    if (USE_MOCK) {
      await mockDelay();
      const product = getMockProducts().find((item) => item.id === productId);
      return mockRes(product?.skus || []);
    }
    return api.get(`/products/${productId}/skus`);
  },
  createSku: async (productId: number, data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      ) as any;
      if (!product) throw new Error("商品不存在");
      const sku = { id: Date.now(), productId, isActive: true, ...data };
      if (!product.skus) product.skus = [];
      product.skus.push(sku);
      persistMockProducts();
      return mockRes(sku);
    }
    return api.post(`/products/${productId}/skus`, data);
  },
  updateSku: async (productId: number, skuId: number, data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      ) as any;
      const sku = product?.skus?.find((s: any) => s.id === skuId);
      if (!sku) throw new Error("SKU不存在");
      Object.assign(sku, data);
      persistMockProducts();
      return mockRes(sku);
    }
    return api.put(`/products/${productId}/skus/${skuId}`, data);
  },
  deleteSku: async (productId: number, skuId: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      ) as any;
      if (!product) throw new Error("商品不存在");
      // 与真实后端一致：彻底删除而非停用
      product.skus = (product.skus || []).filter((s: any) => s.id !== skuId);
      persistMockProducts();
      return mockRes({ id: skuId });
    }
    return api.delete(`/products/${productId}/skus/${skuId}`);
  },
};

// ===== Users API =====
export const userApi = {
  getList: async (params: any) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(
        paginate(mockUsers, params.page || 1, params.pageSize || 20),
      );
    }
    return api.get("/users", { params });
  },
  getById: (id: number) => api.get(`/users/${id}`),
  create: async (data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ id: Date.now(), ...data });
    }
    return api.post("/users", data);
  },
  update: async (id: number, data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ id, ...data });
    }
    return api.put(`/users/${id}`, data);
  },
  delete: (id: number) => api.delete(`/users/${id}`),
};

// ===== Orders API =====
export const orderApi = {
  getList: async (params: any) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(
        paginate(mockOrders, params.page || 1, params.pageSize || 20),
      );
    }
    return api.get("/orders", { params });
  },
  getById: (id: number) => api.get(`/orders/${id}`),
  /** 后台人工建单（需 admin 角色） */
  create: (data: any) => api.post("/orders", data),
  getAnomalies: () => api.get("/orders/anomalies"),
  getTradeOverview: () => api.get("/orders/trade-overview"),
  /** 导出订单（与当前筛选一致；仅 ADMIN） */
  exportList: (params: any) => api.get("/orders/export", { params }),
  updateStatus: async (id: number, data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ id, ...data });
    }
    return api.put(`/orders/${id}/status`, data);
  },
  ship: (
    id: number,
    data: {
      logisticsCompany: string;
      logisticsNo: string;
      internalNote?: string;
    },
  ) => api.put(`/orders/${id}/ship`, data),
  // 交易中心：订单管理中心操作（金额/地址/备注/签收/顾问/定制阶段）
  updateAmount: (
    id: number,
    data: {
      discountAmount?: number;
      adjustmentAmount?: number;
      finalAmount?: number;
      depositAmount?: number;
      balanceAmount?: number;
      reason?: string;
    },
  ) => api.put(`/orders/${id}/amount`, data),
  updateAddress: (id: number, address: string) =>
    api.put(`/orders/${id}/address`, { address }),
  updateNote: (id: number, internalNote: string) =>
    api.put(`/orders/${id}/note`, { internalNote }),
  confirmReceive: (id: number) => api.put(`/orders/${id}/receive`),
  updateConsultant: (id: number, salesConsultantId: number | null) =>
    api.put(`/orders/${id}/consultant`, { salesConsultantId }),
  advanceCustomStage: (id: number, stage: string) =>
    api.put(`/orders/${id}/custom-stage`, { stage }),
};

// ===== 报价管理 API =====
export const quotationApi = {
  getList: (params: any) => api.get("/quotations", { params }),
  getById: (id: number) => api.get(`/quotations/${id}`),
  create: (data: any) => api.post("/quotations", data),
  update: (id: number, data: any) => api.put(`/quotations/${id}`, data),
  submit: (id: number) => api.put(`/quotations/${id}/submit`),
  confirm: (id: number) => api.put(`/quotations/${id}/confirm`),
  cancel: (id: number) => api.put(`/quotations/${id}/cancel`),
  convertToOrder: (id: number, data: { address: string; orderType?: string }) =>
    api.post(`/quotations/${id}/convert`, data),
  remove: (id: number) => api.delete(`/quotations/${id}`),
};

const CART_SESSION_STORAGE_KEY = "haichuan.cart-session-id";

function getCartSessionId() {
  let sessionId = localStorage.getItem(CART_SESSION_STORAGE_KEY);
  if (!sessionId) {
    sessionId = `cart_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CART_SESSION_STORAGE_KEY, sessionId);
  }
  return sessionId;
}

const cartHeaders = () => ({
  ...customerAuthHeaders(),
  "x-session-id": getCartSessionId(),
});

export const cartApi = {
  get: () => api.get("/cart", { headers: cartHeaders() }),
  add: (data: { productId: number; skuId: number; quantity: number }) =>
    api.post("/cart", data, { headers: cartHeaders() }),
  updateQuantity: (id: number, quantity: number) =>
    api.put(`/cart/${id}`, { quantity }, { headers: cartHeaders() }),
  remove: (id: number) => api.delete(`/cart/${id}`, { headers: cartHeaders() }),
  clear: () => api.delete("/cart", { headers: cartHeaders() }),
};

export const customerApi = {
  register: (data: {
    phone: string;
    password: string;
    name: string;
    email?: string;
    smsCode?: string;
  }) => api.post("/customers/register", data),
  login: (data: { phone: string; password: string }) =>
    api.post("/customers/login", data),
  wechatConfig: (origin?: string) =>
    api.get("/customers/wechat/config", { params: origin ? { origin } : {} }),
  wechatBind: (data: {
    bindToken: string;
    phone: string;
    password: string;
    name?: string;
  }) => api.post("/customers/wechat/bind", data),
  smsRequirements: () => api.get("/customers/sms-requirements"),
  requestSmsCode: (data: { phone: string }) =>
    api.post("/customers/sms-code", data),
  forgotPassword: (data: { email: string }) =>
    api.post("/customers/forgot-password", data),
  resetPassword: (data: { token: string; password: string }) =>
    api.post("/customers/reset-password", data),
  checkout: (data: any) =>
    api.post("/customers/checkout", data, {
      headers: customerAuthHeaders(),
    }),
  getPaymentChannels: () =>
    api.get("/customers/me/payment-channels", {
      headers: customerAuthHeaders(),
    }),
  createOrderPayment: (orderId: number) =>
    api.post(
      `/customers/me/orders/${orderId}/payment`,
      {},
      { headers: customerAuthHeaders() },
    ),
  getOrderPayment: (orderId: number) =>
    api.get(`/customers/me/orders/${orderId}/payment`, {
      headers: customerAuthHeaders(),
    }),
  closeOrderPayment: (orderId: number) =>
    api.post(
      `/customers/me/orders/${orderId}/payment/close`,
      {},
      { headers: customerAuthHeaders() },
    ),
  getProfile: () =>
    api.get("/customers/me", { headers: customerAuthHeaders() }),
  updateProfile: (data: { name?: string; email?: string }) =>
    api.put("/customers/me", data, { headers: customerAuthHeaders() }),
  getOrders: () =>
    api.get("/customers/me/orders", { headers: customerAuthHeaders() }),
  getNotifications: (params?: { page?: number; pageSize?: number; unreadOnly?: boolean }) =>
    api.get("/customers/me/notifications", {
      headers: customerAuthHeaders(),
      params: {
        page: params?.page,
        pageSize: params?.pageSize,
        unreadOnly: params?.unreadOnly === undefined
          ? undefined
          : String(params.unreadOnly),
      },
      suppressGlobalError: true,
    }),
  markNotificationRead: (id: number) =>
    api.put(
      `/customers/me/notifications/${id}/read`,
      {},
      { headers: customerAuthHeaders(), suppressGlobalError: true },
    ),
  markAllNotificationsRead: () =>
    api.put(
      "/customers/me/notifications/read-all",
      {},
      { headers: customerAuthHeaders(), suppressGlobalError: true },
    ),
  createAfterSales: (
    orderId: number,
    data: {
      orderItemId: number;
      type: "REFUND" | "EXCHANGE" | "REPAIR";
      reason: string;
    },
  ) =>
    api.post(`/customers/me/orders/${orderId}/after-sales`, data, {
      headers: customerAuthHeaders(),
    }),
  cancelAfterSales: (caseId: number) =>
    api.post(
      `/customers/me/after-sales/${caseId}/cancel`,
      {},
      { headers: customerAuthHeaders() },
    ),
  getOrderTracking: (orderId: number) =>
    api.get(`/customers/me/orders/${orderId}/tracking`, {
      headers: customerAuthHeaders(),
    }),
  getSelectionInquiries: () =>
    api.get("/customers/me/selection-inquiries", {
      headers: customerAuthHeaders(),
    }),
  getInquiries: () =>
    api.get("/customers/me/inquiries", { headers: customerAuthHeaders() }),
  getAddresses: () =>
    api.get("/customers/me/addresses", { headers: customerAuthHeaders() }),
  createAddress: (data: any) =>
    api.post("/customers/me/addresses", data, {
      headers: customerAuthHeaders(),
    }),
  updateAddress: (id: number, data: any) =>
    api.put(`/customers/me/addresses/${id}`, data, {
      headers: customerAuthHeaders(),
    }),
  deleteAddress: (id: number) =>
    api.delete(`/customers/me/addresses/${id}`, {
      headers: customerAuthHeaders(),
    }),
  getFavorites: () =>
    api.get("/customers/me/favorites", { headers: customerAuthHeaders() }),
  exportMyData: () =>
    api.get("/customers/me/data-export", { headers: customerAuthHeaders() }),
  closeAccount: (data: { password: string }) =>
    api.post("/customers/me/close", data, { headers: customerAuthHeaders() }),
  toggleFavorite: (productId: number) =>
    api.post(
      `/customers/me/favorites/${productId}/toggle`,
      {},
      {
        headers: customerAuthHeaders(),
      },
    ),
  submitPaymentProof: (orderId: number, proofKey: string) =>
    api.post(
      `/customers/me/orders/${orderId}/payment-proof`,
      { proofKey },
      { headers: customerAuthHeaders() },
    ),
  uploadPaymentProof: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/upload/payment-proof", formData, {
      headers: {
        ...customerAuthHeaders(),
        "Content-Type": "multipart/form-data",
      },
    });
  },
};

// ===== Partner Applications API（合作申请）=====
export const partnerApi = {
  // 客户侧（用客户令牌）
  getMine: () =>
    api.get("/partner-applications/me", { headers: customerAuthHeaders() }),
  submit: (data: any) =>
    api.post("/partner-applications", data, { headers: customerAuthHeaders() }),
  resubmit: (data: any) =>
    api.put("/partner-applications/me", data, {
      headers: customerAuthHeaders(),
    }),
  // 后台（员工令牌，全局 interceptor 自动注入 Authorization）
  adminGetList: (params: any) => api.get("/partner-applications", { params }),
  adminGetById: (id: number) => api.get(`/partner-applications/${id}`),
  adminReview: (id: number, data: { action: string; reviewNote?: string }) =>
    api.put(`/partner-applications/${id}/review`, data),
};

export const paymentApi = {
  getList: (params: any) => api.get("/payments", { params }),
  getById: (id: number) => api.get(`/payments/${id}`),
  approve: (id: number, reviewNote?: string) =>
    api.put(`/payments/${id}/approve`, { reviewNote }),
  reject: (id: number, reviewNote?: string) =>
    api.put(`/payments/${id}/reject`, { reviewNote }),
  // 异常线下实收；微信/支付宝到账只由服务端验签回调确认。
  createReceipt: (data: {
    orderId: number;
    amount: number;
    method: "bank_transfer" | "store";
    type: "DEPOSIT" | "BALANCE" | "FULL" | "SUPPLEMENT";
    paidAt?: string;
    gatewayTradeNo?: string;
    reviewNote?: string;
  }) => api.post("/payments/receipt", data),
};

// ===== 履约 API =====
export const fulfillmentApi = {
  getList: (params: any) => api.get("/fulfillments", { params }),
  getById: (id: number) => api.get(`/fulfillments/${id}`),
  dispatch: (
    id: number,
    data: { carrier: string; trackingNo: string; internalNote?: string },
  ) => api.put(`/fulfillments/${id}/dispatch`, data),
  updateStatus: (
    id: number,
    data: {
      status: "DELIVERED" | "ABNORMAL";
      abnormalReason?: string;
      internalNote?: string;
    },
  ) => api.put(`/fulfillments/${id}/status`, data),
};

// ===== 退款 API =====
export const refundApi = {
  getList: (params: any) => api.get("/refunds", { params }),
  getById: (id: number) => api.get(`/refunds/${id}`),
  create: (data: {
    orderId: number;
    paymentId?: number;
    amount: number;
    reason: string;
    idempotencyKey: string;
    afterSalesCaseId?: number;
  }) => api.post("/refunds", data),
  review: (
    id: number,
    data: { action: "APPROVED" | "REJECTED"; reviewNote?: string },
  ) => api.put(`/refunds/${id}/review`, data),
  execute: (
    id: number,
    data: {
      action: "COMPLETED" | "FAILED";
      gatewayRefundNo?: string;
      reviewNote?: string;
    },
  ) => api.put(`/refunds/${id}/execute`, data),
  startChannel: (id: number) => api.put(`/refunds/${id}/channel`),
  queryChannel: (id: number) => api.get(`/refunds/${id}/channel`),
};

// ===== 售后 API =====
export const afterSalesApi = {
  getList: (params: any) => api.get("/after-sales-cases", { params }),
  getById: (id: number) => api.get(`/after-sales-cases/${id}`),
  create: (data: {
    orderId: number;
    orderItemId: number;
    customerId: number;
    type: "REFUND" | "EXCHANGE" | "REPAIR";
    reason: string;
    evidenceUrls?: string[];
    customerNote?: string;
    requestedRefundAmount?: number;
  }) => api.post("/after-sales-cases", data),
  review: (
    id: number,
    data: {
      action: "APPROVED" | "REJECTED";
      approvedRefundAmount?: number;
      adminNote?: string;
    },
  ) => api.put(`/after-sales-cases/${id}/review`, data),
  updateStatus: (id: number, data: { status: string; adminNote?: string }) =>
    api.put(`/after-sales-cases/${id}/status`, data),
};

// ===== Gold Price API =====
export const goldPriceApi = {
  getLatest: async () => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockGoldPrice);
    }
    return api.get("/gold-price/latest");
  },
  getHistory: async (params: any) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockGoldPriceHistory);
    }
    return api.get("/gold-price/history", { params });
  },
  getAutomationStatus: async () => {
    if (USE_MOCK) return mockRes({ autoFetchConfigured: false });
    return api.get("/gold-price/automation-status");
  },
  updateManually: async (data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ ...mockGoldPrice, price: data.price, source: "MANUAL" });
    }
    return api.post("/gold-price/manual", data);
  },
};

// ===== Inventory API =====
type InventoryStockUpdateInput = {
  type: "in" | "out" | "adjust";
  quantity: number;
  remark?: string;
};

export const inventoryApi = {
  getList: async (params: any) => {
    if (USE_MOCK) {
      await mockDelay();
      const items = mockProducts.flatMap((p) =>
        (p.skus || []).map((sku) => {
          const quantity = sku.stock ?? 0;
          const safetyStock = sku.safetyStock ?? 0;
          return {
            id: sku.id,
            skuCode: sku.skuCode,
            productName: p.name,
            warehouse: ["深圳展厅", "广州工厂", "北京门店"][
              Math.floor(Math.random() * 3)
            ],
            material: sku.material,
            quantity,
            safetyStock,
            status:
              quantity <= 0
                ? "out"
                : quantity <= safetyStock
                  ? "low"
                  : "normal",
          };
        }),
      );
      return mockRes(paginate(items, params.page || 1, params.pageSize || 20));
    }
    return api.get("/inventory", { params });
  },
  update: (id: number, data: InventoryStockUpdateInput) =>
    api.put(`/inventory/${id}`, data),
};

// ===== Warehouse API（仓库管理）=====
export const warehouseApi = {
  list: () => api.get("/warehouses"),
  create: (data: any) => api.post("/warehouses", data),
  update: (id: number, data: any) => api.put(`/warehouses/${id}`, data),
};

// ===== Upload API =====
export const uploadApi = {
  uploadImage: async (file: File) => {
    if (USE_MOCK) {
      await mockDelay(500);
      return mockRes({
        url: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400",
        filename: file.name,
        size: file.size,
      });
    }
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/upload/image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  // 受控产品库：商品图片上传到私有存储（返回 storageKey，不返回公开 url）
  uploadProductImage: async (file: File) => {
    const formData = new FormData();
    formData.append("files", file);
    return api.post("/upload/product-images", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  uploadVideo: async (file: File) => {
    if (USE_MOCK) {
      await mockDelay(800);
      return mockRes({
        url: URL.createObjectURL(file),
        filename: file.name,
        size: file.size,
      });
    }
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/upload/video", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
  },
};

// contentSlotsApi 已删除（2026-08-15 ContentSlot 死资产清退）：
// 插槽写侧从未有入口、HOME_HERO 永远为空，首页统一走 Puck PageDocument。

// ===== Puck PageDocument API =====
type MockPageDocument = {
  id: number;
  pageKey: string;
  puckData: any;
  metadata?: any;
  editorVersion?: string;
  status: "DRAFT" | "PUBLISHED";
  version: number;
  publishedAt?: string | null;
  publishedBy?: number | null;
  createdAt: string;
  updatedAt: string;
};

type MockPageDocumentStore = {
  drafts: Record<string, MockPageDocument>;
  published: Record<string, MockPageDocument>;
  revisions: Record<string, MockPageDocument[]>;
};

const MOCK_PAGE_DOCUMENTS_STORAGE_KEY = "haichuan.mock-page-documents";

const _mockPageDocuments: MockPageDocumentStore = {
  drafts: {},
  published: {},
  revisions: {},
};

function cloneMockDocument<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function loadMockPageDocuments() {
  if (typeof window === "undefined") return _mockPageDocuments;
  try {
    const saved = window.localStorage.getItem(MOCK_PAGE_DOCUMENTS_STORAGE_KEY);
    if (!saved) return _mockPageDocuments;
    const parsed = JSON.parse(saved) as Partial<MockPageDocumentStore>;
    _mockPageDocuments.drafts = parsed.drafts || {};
    _mockPageDocuments.published = parsed.published || {};
    _mockPageDocuments.revisions = parsed.revisions || {};
  } catch {
    // mock 持久化只是本地开发兜底，损坏时回到内存态。
  }
  return _mockPageDocuments;
}

function persistMockPageDocuments() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      MOCK_PAGE_DOCUMENTS_STORAGE_KEY,
      JSON.stringify(_mockPageDocuments),
    );
  } catch {
    // 忽略本地存储不可用，当前内存态仍可继续编辑。
  }
}

function nextMockDocumentVersion(pageKey: string) {
  const store = loadMockPageDocuments();
  const versions = [
    store.drafts[pageKey]?.version || 0,
    store.published[pageKey]?.version || 0,
    ...(store.revisions[pageKey] || []).map(
      (revision) => revision.version || 0,
    ),
  ];
  return Math.max(0, ...versions) + 1;
}

function createMockPageDocument(data: {
  pageKey: string;
  puckData: any;
  metadata?: any;
  editorVersion?: string;
  status?: "DRAFT" | "PUBLISHED";
  version?: number;
  publishedAt?: string | null;
  publishedBy?: number | null;
}): MockPageDocument {
  const now = new Date().toISOString();
  return {
    id: Date.now(),
    pageKey: data.pageKey,
    puckData: cloneMockDocument(data.puckData),
    metadata: data.metadata,
    editorVersion: data.editorVersion,
    status: data.status || "DRAFT",
    version: data.version || nextMockDocumentVersion(data.pageKey),
    publishedAt: data.publishedAt ?? null,
    publishedBy: data.publishedBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export type PersonalContentTemplate = {
  id: number;
  name: string;
  moduleType: string;
  contractKey: string;
  contractVersion: number;
  layoutData: Record<string, unknown>;
  contentDefaults: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type MockPublicPageDocument = Pick<
  MockPageDocument,
  "pageKey" | "puckData" | "metadata" | "status" | "version" | "publishedAt" | "updatedAt"
>;

function getMockPublicPageDocument(
  document: MockPageDocument | null | undefined,
): MockPublicPageDocument | null {
  if (!document) return null;
  const metadata = document.metadata;
  const publicMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? Object.fromEntries(
        CONTENT_TEMPLATE_PAGE_METADATA.publicFields.flatMap((field) => {
          const value = metadata[field];
          return typeof value === "string" && value.trim()
            ? [[field, value.trim()]]
            : [];
        }),
      )
    : {};
  return {
    pageKey: document.pageKey,
    puckData: cloneMockDocument(document.puckData),
    metadata: publicMetadata,
    status: document.status,
    version: document.version,
    publishedAt: document.publishedAt,
    updatedAt: document.updatedAt,
  };
}

const _mockPersonalContentTemplates: PersonalContentTemplate[] = [];

export const personalContentTemplateApi = {
  list: async () => {
    if (USE_MOCK) {
      await mockDelay(80);
      return mockRes(cloneMockDocument(_mockPersonalContentTemplates));
    }
    return api.get("/page-modules/personal-content-templates", {
      suppressGlobalError: true,
    });
  },
  create: async (data: {
    name: string;
    moduleType: string;
    layoutData: Record<string, unknown>;
    contentDefaults?: Record<string, unknown> | null;
  }) => {
    if (USE_MOCK) {
      await mockDelay(100);
      const now = new Date().toISOString();
      const record: PersonalContentTemplate = {
        id: Math.max(0, ..._mockPersonalContentTemplates.map((item) => item.id)) + 1,
        name: data.name.trim(),
        moduleType: data.moduleType,
        contractKey: data.moduleType,
        contractVersion: 3,
        layoutData: cloneMockDocument(data.layoutData),
        contentDefaults: data.contentDefaults
          ? cloneMockDocument(data.contentDefaults)
          : null,
        createdAt: now,
        updatedAt: now,
      };
      _mockPersonalContentTemplates.unshift(record);
      return mockRes(cloneMockDocument(record));
    }
    return api.post("/page-modules/personal-content-templates", data, {
      suppressGlobalError: true,
    });
  },
  update: async (
    id: number,
    data: {
      name?: string;
      layoutData?: Record<string, unknown>;
      contentDefaults?: Record<string, unknown> | null;
    },
  ) => {
    if (USE_MOCK) {
      await mockDelay(100);
      const record = _mockPersonalContentTemplates.find((item) => item.id === id);
      if (!record) throw new Error("模板不存在");
      if (data.name !== undefined) record.name = data.name.trim();
      if (data.layoutData !== undefined) record.layoutData = cloneMockDocument(data.layoutData);
      if (data.contentDefaults !== undefined) {
        record.contentDefaults = data.contentDefaults
          ? cloneMockDocument(data.contentDefaults)
          : null;
      }
      record.updatedAt = new Date().toISOString();
      return mockRes(cloneMockDocument(record));
    }
    return api.patch(`/page-modules/personal-content-templates/${id}`, data, {
      suppressGlobalError: true,
    });
  },
  remove: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(80);
      const index = _mockPersonalContentTemplates.findIndex((item) => item.id === id);
      if (index < 0) throw new Error("模板不存在");
      _mockPersonalContentTemplates.splice(index, 1);
      return mockRes({ id, deleted: true });
    }
    return api.delete(`/page-modules/personal-content-templates/${id}`, {
      suppressGlobalError: true,
    });
  },
};

export const pageDocumentApi = {
  getPublished: async (
    pageKey = "home",
    locale: PublicContentLocale = getBrowserPublicContentLocale(),
  ) => {
    if (USE_MOCK) {
      await mockDelay(120);
      if (locale === "en") return mockRes(null);
      const store = loadMockPageDocuments();
      return mockRes(getMockPublicPageDocument(store.published[pageKey]));
    }
    return api.get("/page-modules/document/published", {
      params: { pageKey, locale },
      suppressGlobalError: true,
    });
  },
  getPublishedAdmin: async (pageKey = "home") => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      return mockRes(store.published[pageKey] || null);
    }
    return api.get("/page-modules/document/published/admin", {
      params: { pageKey },
      suppressGlobalError: true,
    });
  },
  getAdmin: async (pageKey = "home") => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      return mockRes(store.drafts[pageKey] || store.published[pageKey] || null);
    }
    return api.get("/page-modules/document/admin", {
      params: { pageKey },
      suppressGlobalError: true,
    });
  },
  discardDraft: async (pageKey = "home", expectedUpdatedAt?: string) => {
    if (USE_MOCK) {
      await mockDelay(160);
      const store = loadMockPageDocuments();
      delete store.drafts[pageKey];
      persistMockPageDocuments();
      return mockRes({ discarded: true });
    }
    return api.delete("/page-modules/document/draft", {
      params: { pageKey, expectedUpdatedAt },
      suppressGlobalError: true,
    });
  },
  save: async (data: {
    pageKey: string;
    puckData: any;
    metadata?: any;
    editorVersion?: string;
    expectedUpdatedAt?: string;
  }) => {
    if (USE_MOCK) {
      await mockDelay(160);
      const store = loadMockPageDocuments();
      const previous =
        store.drafts[data.pageKey] || store.published[data.pageKey];
      const now = new Date().toISOString();
      const document: MockPageDocument = {
        ...(previous || createMockPageDocument(data)),
        puckData: cloneMockDocument(data.puckData),
        metadata: data.metadata,
        editorVersion: data.editorVersion,
        status: "DRAFT",
        publishedAt: previous?.publishedAt ?? null,
        publishedBy: previous?.publishedBy ?? null,
        updatedAt: now,
      };
      store.drafts[data.pageKey] = document;
      persistMockPageDocuments();
      return mockRes(cloneMockDocument(document));
    }
    return api.put("/page-modules/document", data, {
      suppressGlobalError: true,
    });
  },
  publish: async (
    pageKey = "home",
    userId?: number,
    expectedUpdatedAt?: string,
  ) => {
    if (USE_MOCK) {
      await mockDelay(180);
      const store = loadMockPageDocuments();
      const draft = store.drafts[pageKey];
      if (!draft) throw new Error("请先保存页面草稿");
      const now = new Date().toISOString();
      const published: MockPageDocument = {
        ...cloneMockDocument(draft),
        status: "PUBLISHED",
        version: nextMockDocumentVersion(pageKey),
        publishedAt: now,
        publishedBy: userId ?? 1,
        updatedAt: now,
      };
      store.published[pageKey] = published;
      store.revisions[pageKey] = [
        published,
        ...(store.revisions[pageKey] || []),
      ].slice(0, 20);
      persistMockPageDocuments();
      return mockRes(cloneMockDocument(published));
    }
    return api.put("/page-modules/document/publish", {
      pageKey,
      userId,
      expectedUpdatedAt,
    }, {
      suppressGlobalError: true,
    });
  },
  validate: async (
    pageKey = "home",
    puckData?: any,
    metadata?: any,
    signal?: AbortSignal,
  ) => {
    if (USE_MOCK) {
      await mockDelay(100);
      return mockRes({ valid: true, errors: [], issues: [] });
    }
    return api.post(
      "/page-modules/document/validate",
      { pageKey, puckData, metadata },
      { signal, suppressGlobalError: true },
    );
  },
  getRevisions: async (pageKey = "home") => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      return mockRes(cloneMockDocument(store.revisions[pageKey] || []));
    }
    return api.get("/page-modules/document/revisions", {
      params: { pageKey },
      suppressGlobalError: true,
    });
  },
  restoreRevision: async (
    pageKey: string,
    version: number,
    expectedUpdatedAt: string,
  ) => {
    if (USE_MOCK) {
      await mockDelay(160);
      const store = loadMockPageDocuments();
      const current = store.drafts[pageKey] || store.published[pageKey];
      if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) {
        throw mockRequestError("恢复版本时缺少页面版本标识", 400);
      }
      if (!current || current.updatedAt !== expectedUpdatedAt) {
        throw mockRequestError(
          "该页面已被其他编辑者更新，请重新加载版本记录后再恢复",
          409,
        );
      }
      const revision = (store.revisions[pageKey] || []).find(
        (item) => item.version === version,
      );
      if (!revision) throw new Error("版本不存在或已被清理");
      const restored = createMockPageDocument({
        pageKey,
        puckData: revision.puckData,
        metadata: revision.metadata,
        editorVersion: revision.editorVersion,
      });
      restored.updatedAt = new Date(
        Math.max(Date.now(), Date.parse(current.updatedAt) + 1),
      ).toISOString();
      store.drafts[pageKey] = restored;
      persistMockPageDocuments();
      return mockRes(cloneMockDocument(restored));
    }
    return api.put(`/page-modules/document/revisions/${version}/restore`, {
      pageKey,
      expectedUpdatedAt,
    }, {
      suppressGlobalError: true,
    });
  },
};

// ===== Marketing API =====
export const marketingApi = {
  /* 促销活动 */
  getPromotions: () => api.get("/marketing/promotions"),
  createPromotion: (data: any) => api.post("/marketing/promotions", data),
  updatePromotion: (id: number, data: any) =>
    api.put(`/marketing/promotions/${id}`, data),
  deletePromotion: (id: number) => api.delete(`/marketing/promotions/${id}`),
  /* 优惠券 */
  getCoupons: () => api.get("/marketing/coupons"),
  createCoupon: (data: any) => api.post("/marketing/coupons", data),
  updateCoupon: (id: number, data: any) =>
    api.put(`/marketing/coupons/${id}`, data),
  getCouponStats: () => api.get("/marketing/coupons/stats"),
  /* 建单可用券（按订单金额试算折扣，营销生效） */
  listUsableCoupons: (amountCents: number) =>
    api.get("/marketing/coupons/usable", { params: { amountCents } }),
};


export default api;
