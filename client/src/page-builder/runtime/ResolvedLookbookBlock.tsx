import { useEffect, useMemo, useState } from "react";
import LookbookBlock from "@/components/blocks/LookbookBlock";
import { productApi } from "@/services/api";
import type { Product } from "@/types";
import { getListingImage } from "@/utils/productImage";
import { unwrapResponse } from "@/utils/unwrap";
import { convertPuckProps } from "../utils/puckPropsToModule";
import type { PuckProps } from "../types";
import { ProductRowState, usePublicProductRevision } from "./PublicProductRuntime";

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toProductRowItem(product: Product) {
  const price = Number(product.price || 0);
  return {
    id: product.id,
    name: product.name,
    image: getListingImage(product),
    price: price ? `¥${price.toLocaleString("zh-CN")}` : "",
    link: `/products/${encodeURIComponent(product.code || String(product.id))}`,
  };
}

export interface ResolvedLookbookBlockProps {
  props: PuckProps;
  editMode?: boolean;
  /** V2 页面实例只允许稳定商品编码；false 仅用于历史 Puck 文档兼容读取。 */
  stableReferencesOnly?: boolean;
}

/** 佩戴灵感的统一公开/预览解析器，保留加载、失败与商品变更实时刷新语义。 */
export default function ResolvedLookbookBlock({
  props,
  editMode = false,
  stableReferencesOnly = true,
}: ResolvedLookbookBlockProps) {
  const productIds = useMemo(
    () => !stableReferencesOnly && Array.isArray(props.productIds)
      ? props.productIds
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isInteger(id) && id > 0)
      : [],
    [props.productIds, stableReferencesOnly],
  );
  const productCodes = useMemo(
    () => Array.isArray(props.productCodes)
      ? props.productCodes.map(String).map((code) => code.trim()).filter(Boolean)
      : [],
    [props.productCodes],
  );
  const idsKey = productIds.join(",");
  const codesKey = productCodes.join(",");
  const hasReferences = Boolean(idsKey || codesKey);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(hasReferences);
  const [error, setError] = useState(false);
  const revision = usePublicProductRevision(hasReferences);

  useEffect(() => {
    if (!hasReferences) {
      setProducts([]);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void productApi.getPublicList(
      productCodes.length
        ? { codes: codesKey, pageSize: productCodes.length, sortBy: "sortOrder" }
        : { ids: idsKey, pageSize: productIds.length, sortBy: "sortOrder" },
      controller.signal,
    )
      .then((response) => {
        const result = unwrapResponse<{ list?: Product[] } | Product[]>(response);
        const list = Array.isArray(result) ? result : result.list ?? [];
        const byReference = new Map(
          list.map((item) => [productCodes.length ? item.code : item.id, item]),
        );
        const references = productCodes.length ? productCodes : productIds;
        if (!cancelled) {
          setProducts(
            references
              .map((reference) => byReference.get(reference))
              .filter((item): item is Product => Boolean(item && getListingImage(item))),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [codesKey, hasReferences, idsKey, productCodes, productIds, revision]);

  if (loading) {
    return (
      <ProductRowState
        title={textValue(props.title)}
        subtitle={textValue(props.subtitle)}
        bgColor={textValue(props.bgColor)}
        message="正在加载关联商品"
      />
    );
  }
  if (error) {
    return (
      <ProductRowState
        title={textValue(props.title)}
        subtitle={textValue(props.subtitle)}
        bgColor={textValue(props.bgColor)}
        message="关联商品暂时加载失败"
      />
    );
  }
  const module = convertPuckProps("佩戴灵感", props);
  if (!module) return null;
  module.content.products = products.map(toProductRowItem);
  return <LookbookBlock module={module} editMode={editMode} />;
}
