/**
 * productRow.puck.ts — ProductRowBlock 适配器（商品数据绑定）
 */

import { useEffect, useMemo, useState } from "react";
import ProductRowBlock from "@/components/blocks/ProductRowBlock";
import { resolveProductReferences, type ProductRow } from "../data-sources/productSource";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface ProductRowPuckProps {
  title: string;
  subtitle: string;
  productIds: number[];
  productCodes: string[];
  layout: string;
  mobileColumns: number;
  displayMode: string;
  actionStyle: string;
  bgColor: string;
  showPrice: boolean;
  showButton: boolean;
  buttonText: string;
  /** 模板库专用，只参与缩略图渲染，不进入 defaultProps / PageDocument。 */
  __previewProducts?: ProductRow[];
  locked?: boolean;
}

function normalizeIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function toCards(products: ProductRow[]) {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    image: product.image,
    price: product.priceLabel,
    link: `/products/${encodeURIComponent(product.code || String(product.id))}`,
  }));
}

export function ProductRowPreview({
  editMode = true,
  ...props
}: ProductRowPuckProps & { editMode?: boolean }) {
  const productIds = useMemo(() => normalizeIds(props.productIds), [props.productIds]);
  const productCodes = useMemo(
    () => Array.isArray(props.productCodes) ? props.productCodes.map(String).filter(Boolean) : [],
    [props.productCodes],
  );
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const previewProducts = Array.isArray(props.__previewProducts)
    ? props.__previewProducts
    : undefined;

  useEffect(() => {
    let cancelled = false;
    setError(false);

    if (productIds.length === 0 && productCodes.length === 0) {
      setProducts([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    const controller = new AbortController();
    resolveProductReferences({
      codes: productCodes.length ? productCodes : undefined,
      legacyIds: productIds.length ? productIds : undefined,
    }, controller.signal)
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [productCodes, productIds]);

  // P1-32：原转换表达式中的断言优先级高于 `||`，
  // 且 convertPuckProps 恒返回 truthy 基础结构，导致右侧 toModule（含已拉取的 products）被短路，
  // 编辑预览恒显示空占位。改为显式合并：把预览商品注入 module.content.products。
  const merged = convertPuckProps("产品展示行", { ...props, productIds, productCodes });
  const displayProducts = previewProducts ?? products;
  if (merged && displayProducts.length > 0) {
    merged.content = { ...merged.content, products: toCards(displayProducts) };
  }
  if (!merged) return null;
  return (
    <>
      {loading ? (
        <p role="status" style={{ margin: 0, padding: "10px 20px", color: "#5F6568", background: "#F4F5F5", fontSize: 12 }}>
          正在刷新商品预览，当前构图保持可编辑
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: 0, padding: "10px 20px", color: "#8C3F3B", background: "#FAF0EF", fontSize: 12 }}>
          商品预览刷新失败，已保留上次成功结果
        </p>
      ) : null}
      <ProductRowBlock module={merged} editMode={editMode} />
    </>
  );
}

export const productRowPuckConfig = {
  render: (props: ProductRowPuckProps) => <ProductRowPreview {...props} editMode />,
  defaultProps: {
    title: "精选商品",
    subtitle: "",
    productIds: [],
    productCodes: [],
    layout: "grid-3",
    mobileColumns: 2,
    displayMode: "standard",
    actionStyle: "text",
    bgColor: "#FFFFFF",
    showPrice: true,
    showButton: false,
    buttonText: "查看详情",
    locked: false,
  } satisfies ProductRowPuckProps,
  resolvePermissions: (data: { props?: ProductRowPuckProps }) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
