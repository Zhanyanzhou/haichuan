import { useEffect, useState } from "react";
import { productApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import type { ProductListItem } from "../ProductManage/productManageModel";
import type { CatTreeNode } from "./categoryManageModel";

type ProductPage = { page: number; includeDescendants: boolean } & (
  { data: { list: ProductListItem[]; total: number } } | { error: unknown }
);

export function useCategoryProductPage(category: CatTreeNode, pageSize: number, includeDescendants: boolean) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ProductPage>();
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    void productApi.getList({
      categoryId: category.id,
      includeDescendants: includeDescendants ? "true" : undefined,
      page,
      pageSize,
      sortBy: "updated_desc",
    }, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      const data = unwrapResponse<{ list: ProductListItem[]; total: number }>(response);
      if (!Array.isArray(data?.list) || !Number.isFinite(data?.total)) {
        throw new Error("商品列表响应格式无效");
      }
      const lastPage = Math.max(1, Math.ceil(data.total / pageSize));
      if (page > lastPage) setPage(lastPage);
      else setResult({ page, includeDescendants, data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ page, includeDescendants, error });
    });
    return () => controller.abort();
  }, [category, includeDescendants, page, pageSize, retry]);

  return {
    page,
    setPage,
    result: result?.page === page && result.includeDescendants === includeDescendants ? result : undefined,
    reload: () => setRetry((value) => value + 1),
  };
}
