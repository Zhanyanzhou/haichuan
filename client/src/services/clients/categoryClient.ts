import type { Category, CategoryInput, CategorySortItem } from "@/types";
import api from "../httpClient";
import { mockCategories, mockDelay, USE_MOCK } from "../mockData";
import { mockResponse } from "../mockResponse";
import {
  getBrowserPublicContentLocale,
  type PublicContentLocale,
} from "@/i18n/publicLocale";

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

type MockCategoryNode = Category & {
  deletedAt?: string | null;
  hasPublicProduct?: boolean;
  children?: MockCategoryNode[];
};

function flattenCategories(nodes: MockCategoryNode[]): MockCategoryNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenCategories(node.children ?? []),
  ]);
}

export const categoryApi = {
  getTree: async (
    signal?: AbortSignal,
    locale: PublicContentLocale = getBrowserPublicContentLocale(),
  ) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockResponse(locale === "en" ? [] : mockCategories);
    }
    return api.get("/categories/tree", {
      params: { locale },
      signal,
      suppressGlobalError: true,
    });
  },
  getList: async (
    locale: PublicContentLocale = getBrowserPublicContentLocale(),
  ) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockResponse(locale === "en" ? [] : mockCategories);
    }
    return api.get("/categories", {
      params: { locale },
      suppressGlobalError: true,
    });
  },
  getManageTree: async (signal?: AbortSignal) => {
    if (USE_MOCK) {
      await mockDelay();
      return mockResponse(mockCategories);
    }
    return api.get("/categories/admin/tree", { signal });
  },
  resolveReferences: async (slugs: string[], signal?: AbortSignal) => {
    if (USE_MOCK) {
      await mockDelay();
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const categories = mockCategories as unknown as MockCategoryNode[];
      const bySlug = new Map(
        flattenCategories(categories).map((category) => [
          category.slug,
          category,
        ]),
      );
      return mockResponse(
        slugs.map((slug): CategoryReferenceResult => {
          const category = bySlug.get(slug);
          if (!category) {
            return { slug, eligible: false, reason: "NOT_FOUND" };
          }
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
        }),
      );
    }
    return api.post(
      "/categories/admin/resolve-references",
      { slugs },
      { signal },
    );
  },
  create: async (data: CategoryInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse({ id: Date.now(), ...data });
    }
    return api.post("/categories", data);
  },
  update: async (id: number, data: CategoryInput) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse({ id, ...data });
    }
    return api.put(`/categories/${id}`, data);
  },
  delete: async (id: number) => {
    if (USE_MOCK) {
      await mockDelay(200);
      return mockResponse({ success: true });
    }
    return api.delete(`/categories/${id}`);
  },
  reorder: async (items: CategorySortItem[]) => {
    if (USE_MOCK) {
      await mockDelay(150);
      return mockResponse({ success: true, updated: items.length });
    }
    return api.post("/categories/reorder", { items });
  },
};
