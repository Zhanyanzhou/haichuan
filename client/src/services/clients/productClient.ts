import type { ProductStatus } from "@/types";
import {
  getBrowserPublicContentLocale,
  type PublicContentLocale,
} from "@/i18n/publicLocale";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import api, {
  clearCustomerSession,
  customerAuthHeaders,
  requestStatus,
} from "../httpClient";
import {
  USE_MOCK,
  mockDelay,
  mockProducts,
  filterProducts,
  paginate,
  type MockProductFilterParams,
} from "../mockData";
import { mockResponse as mockRes, mockRequestError } from "../mockResponse";

type MutableMockProductImage = {
  id: number;
  productId: number;
  url?: string;
  mediaUrl?: string;
  type: string;
  sortOrder: number;
  isVideo: boolean;
  [key: string]: unknown;
};
type MutableMockProductSku = {
  id: number;
  productId: number;
  isActive: boolean;
  [key: string]: unknown;
};

type MutableMockProductCertificate = {
  id: number;
  productId: number;
  [key: string]: unknown;
};

type MutableMockProductTag = {
  id: number;
  productId: number;
  tagName: string;
  [key: string]: unknown;
};

type MutableMockProduct = {
  id: number;
  code: string;
  name: string;
  categoryId: number;
  category?: { id: number; name: string } | null;
  materialType: string;
  price?: number | null;
  size?: string | null;
  status: string;
  visibility?: string;
  deletedAt?: string | null;
  images: MutableMockProductImage[];
  primaryImage?: MutableMockProductImage | string | null;
  listingImage?: MutableMockProductImage | string | null;
  skus: MutableMockProductSku[];
  certificates: MutableMockProductCertificate[] | null;
  tags: MutableMockProductTag[];
  [key: string]: unknown;
};

const mutableMockProducts = mockProducts as unknown as MutableMockProduct[];

export type ProductPublicQuery = MockProductFilterParams & {
  page?: number;
  pageSize?: number;
  ids?: string;
  codes?: string;
  locale?: PublicContentLocale;
};

export type ProductWriteInput = Record<string, unknown> & {
  code?: string;
  name?: string;
  categoryId?: number;
  materialType?: string;
  price?: number | null;
  status?: ProductStatus;
  isHot?: boolean;
  isNew?: boolean;
  isRecommended?: boolean;
  isLimited?: boolean;
  isCustom?: boolean;
};

export type ProductSkuWriteInput = Record<string, unknown> & {
  skuCode?: string;
  material?: string;
  size?: string;
  goldWeight?: number;
  price?: number;
  isActive?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identifiedRecords(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> & { id: number } =>
      isRecord(item) && typeof item.id === "number",
  );
}

function normalizeMockProduct(value: unknown): MutableMockProduct | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "number" ||
    typeof value.code !== "string" ||
    typeof value.name !== "string" ||
    typeof value.categoryId !== "number" ||
    typeof value.materialType !== "string" ||
    typeof value.status !== "string"
  ) {
    return null;
  }

  const productId = value.id;
  const images: MutableMockProductImage[] = identifiedRecords(value.images).map(
    (image) => ({
      ...image,
      id: image.id,
      productId:
        typeof image.productId === "number" ? image.productId : productId,
      url: typeof image.url === "string" ? image.url : undefined,
      mediaUrl:
        typeof image.mediaUrl === "string" ? image.mediaUrl : undefined,
      type: typeof image.type === "string" ? image.type : "FRONT",
      sortOrder:
        typeof image.sortOrder === "number" ? image.sortOrder : image.id,
      isVideo: image.isVideo === true,
    }),
  );
  const skus: MutableMockProductSku[] = identifiedRecords(value.skus).map(
    (sku) => ({
      ...sku,
      id: sku.id,
      productId: typeof sku.productId === "number" ? sku.productId : productId,
      isActive: sku.isActive !== false,
    }),
  );
  const certificates: MutableMockProductCertificate[] | null =
    value.certificates === null
      ? null
      : identifiedRecords(value.certificates).map((certificate) => ({
          ...certificate,
          id: certificate.id,
          productId:
            typeof certificate.productId === "number"
              ? certificate.productId
              : productId,
        }));
  const tags: MutableMockProductTag[] = identifiedRecords(value.tags)
    .filter(
      (tag): tag is Record<string, unknown> & { id: number; tagName: string } =>
        typeof tag.tagName === "string",
    )
    .map((tag) => ({
      ...tag,
      id: tag.id,
      productId: typeof tag.productId === "number" ? tag.productId : productId,
      tagName: tag.tagName,
    }));
  const category = isRecord(value.category)
    && typeof value.category.id === "number"
    && typeof value.category.name === "string"
    ? { id: value.category.id, name: value.category.name }
    : null;

  return {
    ...value,
    id: productId,
    code: value.code,
    name: value.name,
    categoryId: value.categoryId,
    category,
    materialType: value.materialType,
    price: typeof value.price === "number" ? value.price : null,
    size: typeof value.size === "string" ? value.size : null,
    status: value.status,
    visibility:
      typeof value.visibility === "string" ? value.visibility : undefined,
    deletedAt:
      typeof value.deletedAt === "string" || value.deletedAt === null
        ? value.deletedAt
        : undefined,
    images,
    primaryImage: normalizeMockMediaPointer(value.primaryImage),
    listingImage: normalizeMockMediaPointer(value.listingImage),
    skus,
    certificates,
    tags,
  };
}

function normalizeMockMediaPointer(
  value: unknown,
): MutableMockProductImage | string | null | undefined {
  if (typeof value === "string" || value === null) return value;
  const [image] = identifiedRecords([value]);
  if (!image) return undefined;
  return {
    ...image,
    id: image.id,
    productId: typeof image.productId === "number" ? image.productId : 0,
    url: typeof image.url === "string" ? image.url : undefined,
    mediaUrl: typeof image.mediaUrl === "string" ? image.mediaUrl : undefined,
    type: typeof image.type === "string" ? image.type : "FRONT",
    sortOrder: typeof image.sortOrder === "number" ? image.sortOrder : image.id,
    isVideo: image.isVideo === true,
  };
}

// ===== Products API =====
const MOCK_PRODUCTS_STORAGE_KEY = "haichuan.mock-products";

function getMockProducts(): MutableMockProduct[] {
  const products = mutableMockProducts;
  if (typeof window === "undefined") return products;
  try {
    const saved = window.localStorage.getItem(MOCK_PRODUCTS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map(normalizeMockProduct)
          .filter((product): product is MutableMockProduct => product !== null);
        products.length = 0;
        products.push(...normalized);
      }
    }
  } catch {
    // 模拟数据损坏时回退到代码中的初始样本。
  }
  return products;
}

function findActiveMockProduct(id: number): MutableMockProduct | undefined {
  return getMockProducts().find(
    (product) => product.id === id && !product.deletedAt,
  );
}

function persistMockProducts() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      MOCK_PRODUCTS_STORAGE_KEY,
      JSON.stringify(mutableMockProducts),
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
      const availableProducts = getMockProducts().filter(
        (product) => !product.deletedAt,
      );
      const filtered = filterProducts(
        availableProducts,
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
  getMediaList: (params: { page?: number; pageSize?: number; keyword?: string }) =>
    api.get("/products/admin/media", { params }),
  resolveReferences: async (input: { codes?: string[]; legacyIds?: number[] }, signal?: AbortSignal) => {
    if (USE_MOCK) {
      await mockDelay();
      const products = getMockProducts();
      const mapProduct = (product: MutableMockProduct | undefined, reference: { code?: string; legacyId?: number }): ProductReferenceResult => {
        if (!product) return { ...reference, eligible: false, reason: "NOT_FOUND" };
        const image = product.listingImage || product.primaryImage || product.images[0];
        const reason: ProductReferenceResult["reason"] = product.deletedAt
          ? "DELETED"
          : product.status === "OFFLINE"
            ? "OFFLINE"
            : product.status === "DRAFT"
              ? "DRAFT"
              : product.status === "ARCHIVED"
                ? "ARCHIVED"
                : product.visibility && product.visibility !== "PUBLIC"
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
          visibility: product.visibility,
          category: product.category ?? undefined,
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
      const products = getMockProducts().filter((product) => !product.deletedAt);
      const counts: Record<string, number> = {
        all: products.filter((product) => product.status !== "ARCHIVED").length,
      };
      ["PUBLISHED", "OFFLINE", "DRAFT", "ARCHIVED"].forEach((status) => {
        counts[status] = products.filter(
          (product) => product.status === status,
        ).length;
      });
      return mockRes(counts);
    }
    return api.get("/products/counts");
  },
  getPublicList: async (params: ProductPublicQuery = {}, signal?: AbortSignal) => {
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
        publicPriceOnly: true,
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
    if (!useCustomerAuthStore.getState().isLoggedIn) {
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
      if (!product) throw mockRequestError("商品当前不可浏览", 404);
      return mockRes(product);
    }
    const reference = encodeURIComponent(String(id));
    if (!useCustomerAuthStore.getState().isLoggedIn) {
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
  create: async (data: ProductWriteInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const products = getMockProducts();
      const id = Math.max(0, ...products.map((product) => product.id)) + 1;
      const product: MutableMockProduct = {
        id,
        ...data,
        code: data.code ?? "",
        name: data.name ?? `未命名商品-${id}`,
        categoryId: data.categoryId ?? 0,
        materialType: data.materialType ?? "OTHER",
        price: data.price ?? null,
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
      products.push(product);
      persistMockProducts();
      return mockRes(product);
    }
    return api.post("/products", data);
  },
  update: async (id: number, data: ProductWriteInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find((item) => item.id === id);
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
      mediaAssetId?: number;
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
      );
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
      );
      if (!product) throw new Error("商品不存在");
      const image = product.images.find((item) => item.id === imageId);
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
      );
      if (!product) throw new Error("商品不存在");
      product.images = product.images.filter(
        (item) => item.id !== imageId,
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
      );
      if (!product) throw new Error("商品不存在");
      const image = product.images.find((item) => item.id === imageId);
      if (!image) throw new Error("商品图片不存在");
      product.images.forEach((item) => {
        if (item.type === "FRONT") item.type = "SIDE";
      });
      image.type = "FRONT";
      image.sortOrder = 0;
      product.images.sort((a, b) => a.sortOrder - b.sortOrder);
      persistMockProducts();
      return mockRes(image);
    }
    // 后端 setPrimaryImage 已自动同步 listingImageId，无需重复调用
    return api.put(`/products/${productId}/images/primary`, { imageId });
  },
  /* 状态操作 */
  publish: async (id: number) => {
    if (USE_MOCK) {
      const product = getMockProducts().find((item) => item.id === id);
      if (!product) throw new Error("商品不存在");
      product.status = "PUBLISHED";
      persistMockProducts();
      return mockRes(product);
    }
    return api.put(`/products/${id}/status`, { status: "PUBLISHED" });
  },
  unpublish: async (id: number) => {
    if (USE_MOCK) {
      const product = getMockProducts().find((item) => item.id === id);
      if (!product) throw new Error("商品不存在");
      product.status = "OFFLINE";
      persistMockProducts();
      return mockRes(product);
    }
    return api.put(`/products/${id}/status`, { status: "OFFLINE" });
  },
  updateStatus: async (id: number, status: ProductStatus) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find((item) => item.id === id);
      if (!product) throw new Error("商品不存在");
      product.status = status;
      persistMockProducts();
      return mockRes(product);
    }
    return api.put(`/products/${id}/status`, { status });
  },
  submitForReview: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find((item) => item.id === id);
      if (!product) throw new Error("商品不存在");
      if (product.status !== "DRAFT") {
        throw mockRequestError("只有草稿作品可以提交审核", 409);
      }
      return mockRes({ productId: id, reviewStatus: "IN_REVIEW", submittedAt: new Date().toISOString() });
    }
    return api.post(`/products/${id}/submit-review`);
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
      );
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
      );
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
      );
      const cert = product?.certificates?.find((certificate) => certificate.id === certId);
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
      );
      if (!product) throw new Error("商品不存在");
      product.certificates = (product.certificates || []).filter(
        (certificate) => certificate.id !== certId,
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
  createSku: async (productId: number, data: ProductSkuWriteInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      );
      if (!product) throw new Error("商品不存在");
      const sku = { id: Date.now(), productId, isActive: true, ...data };
      if (!product.skus) product.skus = [];
      product.skus.push(sku);
      persistMockProducts();
      return mockRes(sku);
    }
    return api.post(`/products/${productId}/skus`, data);
  },
  updateSku: async (productId: number, skuId: number, data: ProductSkuWriteInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      const product = getMockProducts().find(
        (item) => item.id === productId,
      );
      const sku = product?.skus?.find((item) => item.id === skuId);
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
      );
      if (!product) throw new Error("商品不存在");
      // 与真实后端一致：彻底删除而非停用
      product.skus = product.skus.filter((item) => item.id !== skuId);
      persistMockProducts();
      return mockRes({ id: skuId });
    }
    return api.delete(`/products/${productId}/skus/${skuId}`);
  },
};
