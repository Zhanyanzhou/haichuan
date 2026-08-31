import { useEffect, useMemo, useState } from "react";
import CategoryCardsBlock from "@/components/blocks/CategoryCardsBlock";
import FeaturedProductBlock from "@/components/blocks/FeaturedProductBlock";
import ProductRowBlock from "@/components/blocks/ProductRowBlock";
import { categoryApi, productApi } from "@/services/api";
import type { Product } from "@/types";
import { getListingImage } from "@/utils/productImage";
import { unwrapResponse } from "@/utils/unwrap";
import { createCatalogCategoryUrl } from "../utils/linkTarget";
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

export function ResolvedProductRowBlock({
  props,
  codeOnly = false,
  stableReferencesOnly = true,
}: {
  props: PuckProps;
  codeOnly?: boolean;
  stableReferencesOnly?: boolean;
}) {
  const productIds = useMemo(
    () => !codeOnly && !stableReferencesOnly && Array.isArray(props.productIds)
      ? props.productIds
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isInteger(id) && id > 0)
      : [],
    [codeOnly, props.productIds, stableReferencesOnly],
  );
  const productCodes = useMemo(
    () => Array.isArray(props.productCodes)
      ? props.productCodes.map(String).map((code) => code.trim()).filter(Boolean)
      : [],
    [props.productCodes],
  );
  const idsKey = productIds.join(",");
  const codesKey = productCodes.join(",");
  const hasReferences = Boolean(codesKey || idsKey);
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
    void productApi.getPublicList({
      ...(productCodes.length ? { codes: codesKey } : { ids: idsKey }),
      pageSize: productCodes.length || productIds.length,
      sortBy: "sortOrder",
    }, controller.signal)
      .then((response) => {
        const data = unwrapResponse<{ list?: Product[] } | Product[]>(response);
        const list = Array.isArray(data) ? data : data.list ?? [];
        const byReference = new Map(
          list.map((product) => [productCodes.length ? product.code : product.id, product]),
        );
        const ordered = (productCodes.length ? productCodes : productIds)
          .map((reference) => byReference.get(reference))
          .filter((product): product is Product => Boolean(product && getListingImage(product)));
        if (!cancelled) setProducts(ordered);
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

  if (!hasReferences) return null;
  if (loading) return <ProductRowState title={textValue(props.title)} subtitle={textValue(props.subtitle)} bgColor={textValue(props.bgColor)} message="正在加载精选商品" />;
  if (error) return <ProductRowState title={textValue(props.title)} subtitle={textValue(props.subtitle)} bgColor={textValue(props.bgColor)} message="精选商品暂时加载失败" />;
  if (products.length === 0) return <ProductRowState title={textValue(props.title)} subtitle={textValue(props.subtitle)} bgColor={textValue(props.bgColor)} message="所选商品暂不可展示" />;

  const module = convertPuckProps("产品展示行", props);
  if (!module) return null;
  module.content.products = products.map(toProductRowItem);
  if (codeOnly) {
    module.content.displayMode = "album";
    module.content.showPrice = false;
    module.content.showButton = false;
    module.content.actionStyle = "none";
    module.content.mobileColumns = 1;
    module.content.layout = products.length === 2 ? "grid-2" : "grid-3";
  }
  const productRow = <ProductRowBlock module={module} />;
  return codeOnly ? (
    <div className="hc-home-product-row" data-home-product-count={Math.min(products.length, 3)}>
      {productRow}
    </div>
  ) : productRow;
}

export function ResolvedFeaturedProductBlock({
  props,
  editMode = false,
  codeOnly = false,
  stableReferencesOnly = true,
}: {
  props: PuckProps;
  editMode?: boolean;
  codeOnly?: boolean;
  stableReferencesOnly?: boolean;
}) {
  const productId = stableReferencesOnly ? 0 : Number(props.productId);
  const productCode = String(props.productCode || "").trim();
  const hasReference = Boolean(productCode) || (!codeOnly && Number.isInteger(productId) && productId > 0);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(hasReference);
  const [error, setError] = useState(false);
  const revision = usePublicProductRevision(hasReference);

  useEffect(() => {
    if (!hasReference) {
      setProduct(null);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void productApi.getPublicList(
      productCode
        ? { codes: productCode, pageSize: 1 }
        : { ids: String(productId), pageSize: 1 },
      controller.signal,
    )
      .then((response) => {
        const result = unwrapResponse<{ list?: Product[] } | Product[]>(response);
        const list = Array.isArray(result) ? result : result.list ?? [];
        if (!cancelled) {
          const resolved = list.find((item) => productCode ? item.code === productCode : item.id === productId);
          setProduct(resolved && getListingImage(resolved) ? resolved : null);
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
  }, [hasReference, productCode, productId, revision]);

  if (!hasReference) {
    if (!editMode) return null;
    const module = convertPuckProps("单品焦点推荐", props);
    return module ? <FeaturedProductBlock module={module} editMode /> : null;
  }
  if (loading) return <ProductRowState title={textValue(props.title)} bgColor={textValue(props.bgColor)} message="正在加载主推商品" />;
  if (error) return <ProductRowState title={textValue(props.title)} bgColor={textValue(props.bgColor)} message="主推商品加载失败，请稍后重试" />;
  if (!product) return <ProductRowState title={textValue(props.title)} bgColor={textValue(props.bgColor)} message="所选主推商品已下架或暂不可展示" />;
  const module = convertPuckProps("单品焦点推荐", props);
  if (!module) return null;
  module.content.product = toProductRowItem(product);
  if (codeOnly) module.content.showPrice = false;
  return <FeaturedProductBlock module={module} editMode={editMode} />;
}

interface PublicCategoryNode {
  id: number;
  slug: string;
  name: string;
  coverImage?: string | null;
  children?: PublicCategoryNode[];
}

function flattenCategoryNodes(nodes: PublicCategoryNode[]): PublicCategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategoryNodes(node.children ?? [])]);
}

export function ResolvedCategoryCardsBlock({
  props,
  allowInlineCategories = false,
}: {
  props: PuckProps;
  allowInlineCategories?: boolean;
}) {
  const slugs = useMemo(
    () => Array.isArray(props.categorySlugs)
      ? props.categorySlugs.map(String).map((slug) => slug.trim()).filter(Boolean)
      : [],
    [props.categorySlugs],
  );
  const [categories, setCategories] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(slugs.length > 0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slugs.length) {
      setCategories([]);
      setLoading(false);
      setError(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void categoryApi.getTree(controller.signal)
      .then((response) => {
        const data = unwrapResponse<PublicCategoryNode[]>(response);
        const bySlug = new Map(
          flattenCategoryNodes(Array.isArray(data) ? data : []).map((node) => [node.slug, node]),
        );
        if (!controller.signal.aborted) {
          setCategories(slugs.flatMap((slug) => {
            const node = bySlug.get(slug);
            return node?.coverImage
              ? [{ name: node.name, image: node.coverImage, link: createCatalogCategoryUrl(node.id), altText: node.name }]
              : [];
          }));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slugs]);

  if (!slugs.length) {
    if (!allowInlineCategories) return null;
    const module = convertPuckProps("分类卡片", props);
    return module ? <CategoryCardsBlock module={module} /> : null;
  }
  if (loading) return <ProductRowState title={textValue(props.title)} subtitle={textValue(props.subtitle)} bgColor={textValue(props.bgColor)} message="正在加载分类导航" />;
  if (error) return <ProductRowState title={textValue(props.title)} subtitle={textValue(props.subtitle)} bgColor={textValue(props.bgColor)} message="分类导航暂时加载失败" />;
  if (categories.length === 0) return <ProductRowState title={textValue(props.title)} subtitle={textValue(props.subtitle)} bgColor={textValue(props.bgColor)} message="所选分类当前不可展示" />;
  const module = convertPuckProps("分类卡片", { ...props, categories });
  return module ? <CategoryCardsBlock module={module} /> : null;
}
