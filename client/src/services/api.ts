// 前端 API 层：customer(认证/收藏/找回/SMS/合规)/marketing(含可用券)/reviews/recommendation 等
import axios, { getAdapter } from "axios";
import { notifyRequestError } from "@/services/requestErrorEvents";
import type { ApiResponse, CategoryInput, CategorySortItem } from "@/types";
import { useAuthStore } from "@/store/authStore";
import {
  USE_MOCK,
  mockDelay,
  mockCategories,
  mockProducts,
  mockOrders,
  mockUsers,
  mockGoldPrice,
  mockGoldPriceHistory,
  filterProducts,
  paginate,
} from "./mockData";

const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_BASE_URL || "/api",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// In-flight 去重（2026-08-19）：并发中的相同幂等 GET 共享同一请求，完成后即忘。
// 不做 TTL 缓存——发布/保存后立刻回读必须拿到新数据，只合并"同时在场"的重复。
// 动机：StrictMode dev 双挂载与多组件并发拉 settings/public 等场景曾各发一份。
// 注意：共享的是同一 response 对象，消费方须只读（unwrapResponse 即如此）。
const inflightGets = new Map<string, Promise<unknown>>();
const baseAdapter = getAdapter(api.defaults.adapter);
api.defaults.adapter = async (config) => {
  if ((config.method || "get").toLowerCase() !== "get") {
    return baseAdapter(config);
  }
  const key = `${config.url}|${JSON.stringify(config.params ?? {})}`;
  const hit = inflightGets.get(key);
  if (hit) return hit as never;
  const pending = Promise.resolve(baseAdapter(config)).finally(() =>
    inflightGets.delete(key),
  );
  inflightGets.set(key, pending);
  return pending as never;
};

type NormalizedRequestError = Error & { status?: number };
type LifecycleMockProduct = {
  id: number;
  status: string;
  deletedAt?: string | null;
  [key: string]: unknown;
};

function clearCustomerSession() {
  localStorage.removeItem("customerToken");
  localStorage.removeItem("customer");
}

function requestStatus(error: unknown): number | undefined {
  return (error as NormalizedRequestError | undefined)?.status;
}

function mockRequestError(message: string, status: number): NormalizedRequestError {
  const error = new Error(message) as NormalizedRequestError;
  error.status = status;
  return error;
}

// 受控目录 SSE：仅发变更信号（不返回商品数据），前端收到信号后用鉴权 catalog 接口重拉
export const publicProductStreamUrl = `${((import.meta as any).env?.VITE_API_BASE_URL || "/api").replace(/\/$/, "")}/products/catalog/stream`;
export const publicPageDocumentStreamUrl = `${((import.meta as any).env?.VITE_API_BASE_URL || "/api").replace(/\/$/, "")}/page-modules/document/stream`;

// Request interceptor - attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - unified error handling
api.interceptors.response.use(
  (response) => {
    const data = response.data as ApiResponse<unknown>;
    // 兼容后端 TransformInterceptor 格式
    if (data && typeof data.code === "number" && data.code !== 200) {
      notifyRequestError(data.message || "请求失败");
      return Promise.reject(new Error(data.message || "Request failed"));
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      const customerToken = localStorage.getItem("customerToken");
      const requestAuthorization = String(
        error.config?.headers?.Authorization || "",
      );
      const isCustomerRequest = Boolean(
        customerToken && requestAuthorization === `Bearer ${customerToken}`,
      );
      if (isCustomerRequest) clearCustomerSession();
      else useAuthStore.getState().logout();

      if (
        !isCustomerRequest &&
        window.location.pathname.startsWith("/admin") &&
        !window.location.pathname.includes("/admin/login")
      ) {
        window.location.href = "/admin/login";
      } else if (
        isCustomerRequest &&
        // 只有真正需要客户身份的页面才跳登录；公开浏览页会自动降级到游客目录。
        /^\/(cart|checkout|partner)(\/|$)/.test(window.location.pathname)
      ) {
        const returnTo = window.location.pathname + window.location.search;
        window.location.href = `/customer?returnTo=${encodeURIComponent(returnTo)}`;
      }
    } else if (error.response?.status === 403) {
      notifyRequestError("没有权限执行此操作");
    } else if (error.response?.status === 429) {
      notifyRequestError("操作过于频繁，请稍后再试");
    } else if (error.response?.status && error.response.status >= 500) {
      notifyRequestError("服务器繁忙，请稍后再试");
    }
    const msg = error.response?.data?.message || error.message || "网络错误";
    const normalized = new Error(msg) as NormalizedRequestError;
    normalized.status = error.response?.status;
    return Promise.reject(normalized);
  },
);

// ===== Mock Response Wrapper =====
function mockRes<T>(data: T): { data: ApiResponse<T> } {
  return {
    data: {
      code: 200,
      data,
      message: "success",
      timestamp: new Date().toISOString(),
    },
  };
}

// ===== Auth API =====
export const authApi = {
  login: async (data: { username: string; password: string }) => {
    if (USE_MOCK) {
      await mockDelay();
      if (
        data.username === (import.meta as any).env?.VITE_MOCK_ADMIN_USERNAME &&
        data.password === (import.meta as any).env?.VITE_MOCK_ADMIN_PASSWORD
      ) {
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

export interface CategoryReferenceResult {
  slug: string;
  id?: number;
  name?: string;
  level?: number;
  coverImage?: string | null;
  eligible: boolean;
  reason:
    | "AVAILABLE"
    | "DELETED"
    | "INACTIVE"
    | "NO_PUBLIC_PRODUCT"
    | "MISSING_COVER"
    | "NOT_FOUND";
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
    if (USE_MOCK) {
      await mockDelay();
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
      return api.get("/products/public", { params, signal });
    }
    try {
      return await api.get("/products/catalog", {
        params,
        signal,
        headers: customerAuthHeaders(),
      });
    } catch (error) {
      if (requestStatus(error) !== 401) throw error;
      // 客户令牌失效时不把公开浏览变成登录墙，清理旧会话后降级到游客目录。
      clearCustomerSession();
      return api.get("/products/public", { params, signal });
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
  getPublicById: async (id: string | number) => {
    if (USE_MOCK) {
      await mockDelay();
      const product = getMockProducts().find(
        (item) => (item.code === String(id) || item.id === Number(id)) && item.status === "PUBLISHED",
      );
      if (!product) throw new Error("商品当前不可浏览");
      return mockRes(product);
    }
    if (!localStorage.getItem("customerToken")) {
      return api.get(`/products/public/${id}`);
    }
    try {
      return await api.get(`/products/catalog/${id}`, {
        headers: customerAuthHeaders(),
      });
    } catch (error) {
      if (requestStatus(error) !== 401) throw error;
      clearCustomerSession();
      return api.get(`/products/public/${id}`);
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

// ===== Shipping templates API =====
export const shippingTemplateApi = {
  list: async () => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes([
        {
          id: 1,
          name: "系统模板-珠宝默认模板",
          carrier: "顺丰速运",
          feeMode: "FREE",
          baseFee: 0,
          remoteSurcharge: 0,
          insured: true,
          signatureRequired: true,
          isDefault: true,
          isActive: true,
        },
      ]);
    }
    return api.get("/shipping-templates");
  },
  create: async (data: any) => {
    if (USE_MOCK) {
      await mockDelay(120);
      return mockRes({ id: Date.now(), ...data, isDefault: false, isActive: true });
    }
    return api.post("/shipping-templates", data);
  },
  update: async (id: number, data: any) => {
    if (USE_MOCK) {
      await mockDelay(120);
      return mockRes({ id, ...data });
    }
    return api.put(`/shipping-templates/${id}`, data);
  },
};

// ===== Categories API =====
export const categoryApi = {
  getTree: async (signal?: AbortSignal) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockCategories);
    }
    return api.get("/categories/tree", { signal });
  },
  getList: async () => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockCategories);
    }
    return api.get("/categories");
  },
  getManageTree: async (signal?: AbortSignal) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockCategories);
    }
    return api.get("/categories/admin/tree", { signal });
  },
  resolveReferences: async (slugs: string[], signal?: AbortSignal) => {
    if (USE_MOCK) {
      await mockDelay();
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const flatten = (nodes: any[]): any[] =>
        nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
      const bySlug = new Map(flatten(mockCategories as any[]).map((node) => [node.slug, node]));
      return mockRes(slugs.map((slug): CategoryReferenceResult => {
        const category = bySlug.get(slug);
        if (!category) return { slug, eligible: false, reason: "NOT_FOUND" };
        const reason: CategoryReferenceResult["reason"] = category.deletedAt
          ? "DELETED"
          : category.isActive === false
            ? "INACTIVE"
            : category.hasPublicProduct === false
              ? "NO_PUBLIC_PRODUCT"
              : !category.coverImage
                ? "MISSING_COVER"
                : "AVAILABLE";
        return {
          slug,
          id: Number(category.id),
          name: String(category.name || slug),
          level: Number(category.level || 1),
          coverImage: category.coverImage || null,
          eligible: reason === "AVAILABLE",
          reason,
        };
      }));
    }
    return api.post("/categories/admin/resolve-references", { slugs }, { signal });
  },
  create: async (data: CategoryInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ id: Date.now(), ...data });
    }
    return api.post("/categories", data);
  },
  update: async (id: number, data: CategoryInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ id, ...data });
    }
    return api.put(`/categories/${id}`, data);
  },
  delete: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ success: true });
    }
    return api.delete(`/categories/${id}`);
  },
  reorder: async (items: CategorySortItem[]) => {
    if (USE_MOCK) {
      await mockDelay(150);
      return mockRes({ success: true, updated: items.length });
    }
    return api.post("/categories/reorder", { items });
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

const customerAuthHeaders = () => {
  const token = localStorage.getItem("customerToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
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

const cartHeaders = () => ({ "x-session-id": getCartSessionId() });

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
  checkout: (data: any) => api.post("/customers/checkout", data),
  getProfile: () =>
    api.get("/customers/me", { headers: customerAuthHeaders() }),
  updateProfile: (data: { name?: string; email?: string }) =>
    api.put("/customers/me", data, { headers: customerAuthHeaders() }),
  getOrders: () =>
    api.get("/customers/me/orders", { headers: customerAuthHeaders() }),
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

// ===== 后台客户档案 API（只读运营视图，员工令牌由全局拦截器注入）=====
export const customerAdminApi = {
  /** 客户列表：分页 + 关键词（手机/姓名/邮箱）+ 状态筛选 */
  list: (params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
  }) => api.get("/customers/admin", { params }),
  /** 客户 360° 详情：档案 + 消费聚合 + 最近订单 + 收藏 + 地址数 */
  detail: (id: number) => api.get(`/customers/admin/${id}`),
};

// ===== Recommendations API（规则推荐，登录客户）=====
export const recommendationApi = {
  getHot: (limit = 12) =>
    api.get("/recommendations/hot", {
      params: { limit },
      headers: customerAuthHeaders(),
    }),
  getForYou: (limit = 12) =>
    api.get("/recommendations/for-you", {
      params: { limit },
      headers: customerAuthHeaders(),
    }),
  getSimilar: (productId: number, limit = 12) =>
    api.get(`/recommendations/similar/${productId}`, {
      params: { limit },
      headers: customerAuthHeaders(),
    }),
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
  // 后台手动登记收款（定金/尾款/全款/补款，财务直接录入已到账收款）
  createReceipt: (data: {
    orderId: number;
    amount: number;
    method: string;
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
    idempotencyKey?: string;
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
};

// ===== 售后 API =====
export const afterSalesApi = {
  getList: (params: any) => api.get("/after-sales-cases", { params }),
  getById: (id: number) => api.get(`/after-sales-cases/${id}`),
  create: (data: {
    orderId: number;
    orderItemId?: number;
    customerId?: number;
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

// ===== Dashboard Statistics API =====
export type TrendMetric = "orders" | "revenue" | "inquiries" | "pageViews";

export const statisticsApi = {
  getDashboard: () => api.get("/statistics/dashboard"),
  getTrend: (days = 7, metric: TrendMetric = "orders") =>
    api.get("/statistics/trend", { params: { days, metric } }),
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
  update: (id: number, data: any) => api.put(`/inventory/${id}`, data),
};

// ===== Warehouse API（仓库管理）=====
export const warehouseApi = {
  list: () => api.get("/warehouses"),
  create: (data: any) => api.post("/warehouses", data),
  update: (id: number, data: any) => api.put(`/warehouses/${id}`, data),
};

// ===== Tag API（标签字典）=====
export const tagApi = {
  list: () => api.get("/tags"),
  create: (data: any) => api.post("/tags", data),
  update: (id: number, data: any) => api.put(`/tags/${id}`, data),
};

// ===== AI Classify API =====
export const aiClassifyApi = {
  // 单张/批量识别：服务端 DTO 要求 JSON（imageUrl / imageUrls），非 multipart
  classify: (data: { imageUrl: string }) =>
    api.post("/ai-classify/single", data),
  batchClassify: (data: { imageUrls: string[] }) =>
    api.post("/ai-classify/batch", data),
  generateDescription: (data: { productName: string; category: string; material: string; style?: string }) =>
    api.post("/ai-classify/generate-description", data),
  // 通用 AI 对话（产品文案/客户咨询/数据分析等，Kimi 驱动）
  chat: (data: { message: string; systemPrompt?: string }) =>
    api.post("/ai-classify/chat", data),
  getReport: () => api.get("/ai-classify/report"),
  getRecords: async (params: any) => {
    if (USE_MOCK) {
      await mockDelay();
      const records = [
        {
          id: 1,
          imageUrl: "",
          predictedCategoryName: "平安扣",
          confidence: 96.5,
          status: "auto_confirmed",
          createdAt: "2024-07-31 10:30",
        },
        {
          id: 2,
          imageUrl: "",
          predictedCategoryName: "葫芦",
          confidence: 82.3,
          status: "pending_confirm",
          createdAt: "2024-07-31 10:25",
        },
        {
          id: 3,
          imageUrl: "",
          predictedCategoryName: "花戒",
          confidence: 65.0,
          status: "pending_review",
          createdAt: "2024-07-31 10:20",
        },
        {
          id: 4,
          imageUrl: "",
          predictedCategoryName: "锁包",
          confidence: 93.1,
          status: "auto_confirmed",
          createdAt: "2024-07-31 09:15",
        },
        {
          id: 5,
          imageUrl: "",
          predictedCategoryName: "佛公",
          confidence: 88.7,
          status: "pending_confirm",
          confirmedCategoryName: "平安扣",
          createdAt: "2024-07-30 16:00",
        },
      ];
      return mockRes(
        paginate(records, params.page || 1, params.pageSize || 20),
      );
    }
    return api.get("/ai-classify/records", { params });
  },
  confirm: (
    id: number,
    data: { status: "confirmed" | "rejected"; confirmedCategoryId?: number },
  ) => api.put(`/ai-classify/confirm/${id}`, data),
};

// ===== Settings API =====
export const settingsApi = {
  getPublicSettings: async () => {
    if (USE_MOCK) {
      await mockDelay(200);
      // 联系信息以后台 SiteSettings 为唯一真实来源；mock 默认返回空，不编造电话/邮箱/地址。
      // 测试需要具体值时在测试内拦截此接口注入。
      return mockRes({
        siteName: "海川珠宝",
        seoTitle: "海川珠宝 - 高端珠宝臻品平台",
        seoDescription: "高端珠宝臻品与一对一选款服务",
        contactPhone: "",
        contactEmail: "",
        contactAddress: "",
        businessHours: "",
      });
    }
    return api.get("/settings/public");
  },
  getSettings: async () => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({
        siteName: "海川珠宝",
        siteDesc: "高端珠宝产品管理平台",
        logo: "",
        autoBackup: true,
        backupTime: "03:00",
      });
    }
    return api.get("/settings");
  },
  updateSettings: async (data: any) => {
    if (USE_MOCK) {
      await mockDelay(300);
      return mockRes(data);
    }
    return api.put("/settings", data);
  },
  getLogs: async (params?: { page?: number; pageSize?: number; keyword?: string; module?: string }) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes({ list: [], total: 0, page: 1, pageSize: 30 });
    }
    return api.get("/settings/logs", { params });
  },
  getFlags: async () => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({
        commerceEnabled: false,
        cartEnabled: false,
        paymentEnabled: false,
        analyticsDashboardEnabled: true,
      });
    }
    return api.get("/settings/flags");
  },
};

// ===== Attribute API =====
export const attributeApi = {
  getPublic: async () => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ list: [] });
    }
    return api.get("/attributes");
  },
  getAll: async () => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ list: [] });
    }
    return api.get("/attributes/admin");
  },
  create: async (data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes(data);
    }
    return api.post("/attributes", data);
  },
  update: async (id: number, data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes(data);
    }
    return api.put(`/attributes/${id}`, data);
  },
  remove: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ id });
    }
    return api.delete(`/attributes/${id}`);
  },
  addValue: async (attributeId: number, data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes(data);
    }
    return api.post(`/attributes/${attributeId}/values`, data);
  },
  updateValue: async (valueId: number, data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes(data);
    }
    return api.put(`/attributes/values/${valueId}`, data);
  },
  removeValue: async (valueId: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ id: valueId });
    }
    return api.delete(`/attributes/values/${valueId}`);
  },
};

// ===== SelectionInquiry API =====
export const selectionInquiryApi = {
  getList: async (params?: {
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) => api.get("/selection-inquiries", { params }),
  getDetail: async (id: number) => api.get(`/selection-inquiries/${id}`),
  update: async (id: number, data: { status?: string; handlerId?: number }) =>
    api.put(`/selection-inquiries/${id}`, data),
  /** 客户提交选款咨询 */
  submit: async (data: {
    customerName?: string;
    phone?: string;
    email?: string;
    wechat?: string;
    message?: string;
    privacyConsent: boolean;
    items: Array<{
      productId?: number;
      productNameSnapshot: string;
      productSkuSnapshot?: string;
      productImageSnapshot?: string;
    }>;
  }) =>
    api.post("/selection-inquiries", data, { headers: customerAuthHeaders() }),
};

// ===== Inquiries API =====
export const inquiriesApi = {
  getList: async (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }) => {
    if (USE_MOCK) {
      await mockDelay(300);
      return mockRes({ items: [], total: 0 });
    }
    return api.get("/inquiries", { params });
  },
  updateStatus: async (
    id: number,
    data: { status?: string; reply?: string; assignedTo?: number },
  ) => {
    if (USE_MOCK) {
      await mockDelay(300);
      return mockRes({ success: true });
    }
    if (data.reply)
      return api.put(`/inquiries/${id}/reply`, { reply: data.reply });
    if (data.assignedTo)
      return api.put(`/inquiries/${id}/assign`, {
        assignedTo: data.assignedTo,
      });
    return api.put(`/inquiries/${id}/reply`, data);
  },
  submit: async (data: {
    name: string;
    phone: string;
    email?: string;
    consultationType: string;
    preferredContact: string;
    preferredTime: string;
    budgetRange?: string;
    message: string;
    privacyConsent: boolean;
  }) => {
    if (USE_MOCK) {
      await mockDelay(500);
      return mockRes({
        id: Date.now(),
        ...data,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      });
    }
    return api.post(
      "/inquiries",
      {
        ...data,
        customerName: data.name,
        customerPhone: data.phone,
        customerEmail: data.email,
      },
      { headers: customerAuthHeaders() },
    );
  },
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

export const pageDocumentApi = {
  getPublished: async (pageKey = "home") => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      return mockRes(store.published[pageKey] || null);
    }
    return api.get("/page-modules/document/published", { params: { pageKey } });
  },
  getAdmin: async (pageKey = "home") => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      return mockRes(store.drafts[pageKey] || store.published[pageKey] || null);
    }
    return api.get("/page-modules/document/admin", { params: { pageKey } });
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
    return api.put("/page-modules/document", data);
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
      if (!draft) throw new Error("请先保存首页草稿");
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
      { signal },
    );
  },
  getRevisions: async (pageKey = "home") => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      return mockRes(cloneMockDocument(store.revisions[pageKey] || []));
    }
    return api.get("/page-modules/document/revisions", { params: { pageKey } });
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

/* 商品评价 */
export const reviewApi = {
  submit: (data: {
    orderId: number;
    productId: number;
    rating: number;
    content: string;
    imageUrls?: string[];
  }) => api.post("/reviews", data, { headers: customerAuthHeaders() }),
  mine: () => api.get("/reviews/me", { headers: customerAuthHeaders() }),
  listForProduct: (
    productId: number,
    params?: { page?: number; pageSize?: number },
  ) => api.get(`/reviews/product/${productId}`, { params }),
  adminList: (params: any) => api.get("/reviews", { params }),
  moderate: (
    id: number,
    data: { status: "APPROVED" | "REJECTED"; reply?: string },
  ) => api.put(`/reviews/${id}/moderate`, data),
};

export default api;
