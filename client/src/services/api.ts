import axios from "axios";
import { message } from "antd";
import type { ApiResponse } from "@/types";
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
  mockHomepageConfig,
} from "./mockData";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

export const publicProductStreamUrl = `${(import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "")}/products/public/stream`;
export const publicPageDocumentStreamUrl = `${(import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "")}/page-modules/document/stream`;

// Request interceptor - attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
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
      message.error(data.message || "请求失败");
      return Promise.reject(new Error(data.message || "Request failed"));
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (
        window.location.pathname.startsWith("/admin") &&
        !window.location.pathname.includes("/admin/login")
      ) {
        window.location.href = "/admin/login";
      }
    } else if (error.response?.status === 403) {
      message.error("没有权限执行此操作");
    } else if (error.response?.status === 429) {
      message.error("操作过于频繁，请稍后再试");
    } else if (error.response?.status && error.response.status >= 500) {
      message.error("服务器繁忙，请稍后再试");
    }
    const msg = error.response?.data?.message || error.message || "网络错误";
    return Promise.reject(new Error(msg));
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
        data.username === import.meta.env.VITE_MOCK_ADMIN_USERNAME &&
        data.password === import.meta.env.VITE_MOCK_ADMIN_PASSWORD
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

export const productApi = {
  getList: async (params: any) => {
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
      const filtered = filterProducts(getMockProducts(), params).filter(
        (product) => !idSet || idSet.has(product.id),
      );
      return mockRes(
        paginate(filtered, params.page || 1, params.pageSize || 20),
      );
    }
    return api.get("/products", { params });
  },
  getCounts: async () => {
    if (USE_MOCK) {
      await mockDelay();
      const products = getMockProducts();
      const counts: Record<string, number> = { all: products.length };
      ["PUBLISHED", "OFFLINE", "DRAFT", "ARCHIVED"].forEach((status) => {
        counts[status] = products.filter(
          (p: any) => p.status === status,
        ).length;
      });
      return mockRes(counts);
    }
    return api.get("/products/counts");
  },
  getPublicList: async (params: any = {}) => {
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
      return mockRes(
        paginate(filtered, params.page || 1, params.pageSize || 20),
      );
    }
    return api.get("/products/public", { params });
  },
  getById: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay();
      const p = getMockProducts().find((x) => x.id === id);
      if (!p) throw new Error("产品不存在");
      return mockRes(p);
    }
    return api.get(`/products/${id}`);
  },
  getPublicById: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay();
      const product = getMockProducts().find(
        (item) => item.id === id && item.status === "PUBLISHED",
      );
      if (!product) throw new Error("商品当前不可浏览");
      return mockRes(product);
    }
    return api.get(`/products/public/${id}`);
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
  delete: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ success: true });
    }
    return api.delete(`/products/${id}`);
  },
  /* 图片管理 */
  addImage: async (
    productId: number,
    data: { url: string; type?: string; sortOrder?: number; isVideo?: boolean },
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
      const product = getMockProducts().find((item) => item.id === productId) as any;
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
    data: { certType: string; certNumber: string; certImage?: string; expireDate?: string },
  ) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find((item) => item.id === productId) as any;
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
    data: { certType?: string; certNumber?: string; certImage?: string; expireDate?: string },
  ) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find((item) => item.id === productId) as any;
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
      const product = getMockProducts().find((item) => item.id === productId) as any;
      if (!product) throw new Error("商品不存在");
      product.certificates = (product.certificates || []).filter((c: any) => c.id !== certId);
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
      const product = getMockProducts().find((item) => item.id === productId) as any;
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
      const product = getMockProducts().find((item) => item.id === productId) as any;
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
      const product = getMockProducts().find((item) => item.id === productId) as any;
      if (!product) throw new Error("商品不存在");
      const sku = product.skus?.find((s: any) => s.id === skuId);
      if (sku) sku.isActive = false;
      persistMockProducts();
      return mockRes({ success: true });
    }
    return api.delete(`/products/${productId}/skus/${skuId}`);
  },
};

// ===== Categories API =====
export const categoryApi = {
  getTree: async () => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockCategories);
    }
    return api.get("/categories/tree");
  },
  getList: async () => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockCategories);
    }
    return api.get("/categories");
  },
  getManageTree: async () => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes(mockCategories);
    }
    return api.get("/categories/admin/tree");
  },
  create: async (data: any) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({ id: Date.now(), ...data });
    }
    return api.post("/categories", data);
  },
  update: async (id: number, data: any) => {
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
  }) => api.post("/customers/register", data),
  login: (data: { phone: string; password: string }) =>
    api.post("/customers/login", data),
  checkout: (data: any) => api.post("/customers/checkout", data),
  accessByOrder: (data: { phone: string; orderNo: string }) =>
    api.post("/customers/order-access", data),
  getProfile: () =>
    api.get("/customers/me", { headers: customerAuthHeaders() }),
  updateProfile: (data: { name?: string; email?: string }) =>
    api.put("/customers/me", data, { headers: customerAuthHeaders() }),
  getOrders: () =>
    api.get("/customers/me/orders", { headers: customerAuthHeaders() }),
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
  submitPaymentProof: (orderId: number, proofUrl: string) =>
    api.post(
      `/customers/me/orders/${orderId}/payment-proof`,
      { proofUrl },
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

export const paymentApi = {
  getList: (params: any) => api.get("/payments", { params }),
  getById: (id: number) => api.get(`/payments/${id}`),
  approve: (id: number, reviewNote?: string) =>
    api.put(`/payments/${id}/approve`, { reviewNote }),
  reject: (id: number, reviewNote?: string) =>
    api.put(`/payments/${id}/reject`, { reviewNote }),
};

// ===== Dashboard Statistics API =====
export const statisticsApi = {
  getDashboard: () => api.get("/statistics/dashboard"),
  getOrderTrend: (days = 7) =>
    api.get("/statistics/order-trend", { params: { days } }),
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
        (p.skus || []).map((sku) => ({
          id: sku.id,
          skuCode: sku.skuCode,
          productName: p.name,
          warehouse: ["深圳展厅", "广州工厂", "北京门店"][
            Math.floor(Math.random() * 3)
          ],
          material: sku.material,
          quantity: sku.stock,
          safetyStock: sku.safetyStock,
          status:
            sku.stock <= 0
              ? "out"
              : sku.stock <= sku.safetyStock
                ? "low"
                : "normal",
        })),
      );
      return mockRes(paginate(items, params.page || 1, params.pageSize || 20));
    }
    return api.get("/inventory", { params });
  },
  update: (id: number, data: any) => api.put(`/inventory/${id}`, data),
};

// ===== AI Classify API =====
export const aiClassifyApi = {
  classify: (data: FormData) =>
    api.post("/ai-classify/single", data, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  batchClassify: (data: FormData) =>
    api.post("/ai-classify/batch", data, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
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
  confirm: (id: number, data: any) =>
    api.put(`/ai-classify/confirm/${id}`, data),
};

// ===== Settings API =====
export const settingsApi = {
  getPublicSettings: async () => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockRes({
        siteName: "海川珠宝",
        seoTitle: "海川珠宝 - 高端珠宝臻品平台",
        seoDescription: "高端珠宝臻品与一对一选款服务",
        contactPhone: "400-888-8888",
        contactEmail: "contact@haichuan.com",
        contactAddress: "深圳市罗湖区珠宝产业园",
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
  getLogs: async (params?: { page?: number; pageSize?: number }) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockRes({ list: [], total: 0, page: 1, pageSize: 30 });
    }
    return api.get("/settings/logs", { params });
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

// ===== Homepage API =====
export const homepageApi = {
  getConfig: async () => {
    if (USE_MOCK) {
      await mockDelay(300);
      return mockRes(mockHomepageConfig.filter((section) => section.isEnabled));
    }
    return api.get("/homepage/config");
  },
  getAdminConfig: async () => {
    if (USE_MOCK) {
      await mockDelay(300);
      return mockRes([...mockHomepageConfig]);
    }
    return api.get("/homepage/admin/config");
  },
  updateConfig: async (sections: any[]) => {
    if (USE_MOCK) {
      await mockDelay(500);
      // Update local mock data — deep clone to avoid mutating original
      const cloned = JSON.parse(JSON.stringify(mockHomepageConfig));
      sections.forEach((s, index) => {
        const idx = cloned.findIndex((m: any) => m.id === s.id);
        if (idx >= 0) Object.assign(cloned[idx], s, { sortOrder: index + 1 });
        else
          cloned.push({ ...s, id: Date.now() + index, sortOrder: index + 1 });
      });
      // Replace array contents
      mockHomepageConfig.length = 0;
      mockHomepageConfig.push(...cloned);
      return mockRes([...mockHomepageConfig]);
    }
    return api.put("/homepage/config", { sections });
  },
  createSection: async (data: any) => {
    if (USE_MOCK) {
      await mockDelay(300);
      const newSection = { ...data, id: Date.now() };
      const cloned = JSON.parse(JSON.stringify(mockHomepageConfig));
      cloned.push(newSection);
      mockHomepageConfig.length = 0;
      mockHomepageConfig.push(...cloned);
      return mockRes(newSection);
    }
    return api.post("/homepage/section", data);
  },
  deleteSection: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(300);
      const cloned = JSON.parse(JSON.stringify(mockHomepageConfig));
      const idx = cloned.findIndex((m: any) => m.id === id);
      if (idx >= 0) cloned.splice(idx, 1);
      mockHomepageConfig.length = 0;
      mockHomepageConfig.push(...cloned);
      return mockRes({ success: true });
    }
    return api.delete(`/homepage/section/${id}`);
  },
};

export const contentSlotsApi = {
  getPublished: async (pageKey = "home") => {
    return api.get("/content-slots/published", { params: { pageKey } });
  },
  getAdminAll: async (pageKey = "home") => {
    return api.get("/content-slots/admin", { params: { pageKey } });
  },
  saveDraft: async (data: any) => {
    return api.put("/content-slots/draft", data);
  },
  publish: async (slotKey: string) => {
    return api.put(`/content-slots/${slotKey}/publish`);
  },
  publishAll: async (pageKey = "home") => {
    return api.put("/content-slots/publish-all", { pageKey });
  },
  unpublish: async (slotKey: string) => {
    return api.put(`/content-slots/${slotKey}/unpublish`);
  },
};

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
  save: async (data: {
    pageKey: string;
    puckData: any;
    metadata?: any;
    editorVersion?: string;
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
  publish: async (pageKey = "home", userId?: number) => {
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
    return api.put("/page-modules/document/publish", { pageKey, userId });
  },
  getRevisions: async (pageKey = "home") => {
    if (USE_MOCK) {
      await mockDelay(120);
      const store = loadMockPageDocuments();
      return mockRes(cloneMockDocument(store.revisions[pageKey] || []));
    }
    return api.get("/page-modules/document/revisions", { params: { pageKey } });
  },
  restoreRevision: async (pageKey: string, version: number) => {
    if (USE_MOCK) {
      await mockDelay(160);
      const store = loadMockPageDocuments();
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
      store.drafts[pageKey] = restored;
      persistMockPageDocuments();
      return mockRes(cloneMockDocument(restored));
    }
    return api.put(`/page-modules/document/revisions/${version}/restore`, {
      pageKey,
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
};

export default api;
