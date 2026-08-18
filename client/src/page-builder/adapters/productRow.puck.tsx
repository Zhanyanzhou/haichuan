/**
 * productRow.puck.ts — ProductRowBlock 适配器（商品数据绑定）
 */

import { useEffect, useMemo, useState } from "react";
import ProductRowBlock from "@/components/blocks/ProductRowBlock";
import { fetchProductsByIds, type ProductRow } from "../data-sources/productSource";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface ProductRowPuckProps {
  title: string;
  subtitle: string;
  productIds: number[];
  layout: string;
  mobileColumns: number;
  displayMode: string;
  actionStyle: string;
  bgColor: string;
  showPrice: boolean;
  showButton: boolean;
  buttonText: string;
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
    link: `/products/${product.id}`,
  }));
}

function ProductRowPreview(props: ProductRowPuckProps) {
  const productIds = useMemo(() => normalizeIds(props.productIds), [props.productIds]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);

    if (productIds.length === 0) {
      setProducts([]);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    fetchProductsByIds(productIds)
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setProducts([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productIds]);

  if (loading) {
    return (
      <section style={{ padding: "56px 0", background: props.bgColor || "#FFFFFF", textAlign: "center" }}>
        <p style={{ margin: 0, color: "#9A8A6B", fontSize: 13 }}>正在加载商品预览</p>
      </section>
    );
  }

  if (error) {
    return (
      <section style={{ padding: "56px 0", background: props.bgColor || "#FFFFFF", textAlign: "center" }}>
        <p style={{ margin: 0, color: "#B45332", fontSize: 13 }}>商品预览加载失败，请稍后重试</p>
      </section>
    );
  }

  // P1-32：原 `convertPuckProps(...) as any || toModule(...) as any` 因 `as any` 优先级高于 `||`、
  // 且 convertPuckProps 恒返回 truthy 基础结构，导致右侧 toModule（含已拉取的 products）被短路，
  // 编辑预览恒显示空占位。改为显式合并：把预览商品注入 module.content.products。
  const merged = convertPuckProps("产品展示行", { ...props, productIds });
  if (merged && products.length > 0) {
    // PageModuleContent 类型未声明 products（产品展示行专用扩展字段），用 as any 赋值
    merged.content = { ...merged.content, products: toCards(products) } as any;
  }
  return <ProductRowBlock module={merged as any} editMode />;
}

export const productRowPuckConfig = {
  render: (props: ProductRowPuckProps) => <ProductRowPreview {...props} />,
  defaultProps: {
    title: "精选商品",
    subtitle: "",
    productIds: [],
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
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
