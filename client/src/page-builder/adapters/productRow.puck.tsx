/**
 * productRow.puck.ts — ProductRowBlock 适配器（商品数据绑定）
 */

import { useEffect, useMemo, useState } from "react";
import ProductRowBlock from "@/components/blocks/ProductRowBlock";
import { fetchProductsByIds, type ProductRow } from "../data-sources/productSource";
import ProductIdsField from "../fields/ProductIdsField";

export interface ProductRowPuckProps {
  title: string;
  subtitle: string;
  productIds: number[];
  layout: string;
  bgColor: string;
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
    name: product.name,
    image: product.image,
    price: product.priceLabel,
    link: `/products/${product.id}`,
  }));
}

function toModule(props: ProductRowPuckProps, products: ReturnType<typeof toCards> = []) {
  return {
    content: {
      title: props.title,
      subtitle: props.subtitle,
      products,
      layout: props.layout,
      productIds: props.productIds,
    },
    styleConfig: { bgColor: props.bgColor || "#FCFCFB" },
  };
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
  }, [productIds.join(",")]);

  if (loading) {
    return (
      <section style={{ padding: "56px 0", background: props.bgColor || "#FCFCFB", textAlign: "center" }}>
        <p style={{ margin: 0, color: "#9A8A6B", fontSize: 13 }}>正在加载商品预览</p>
      </section>
    );
  }

  if (error) {
    return (
      <section style={{ padding: "56px 0", background: props.bgColor || "#FCFCFB", textAlign: "center" }}>
        <p style={{ margin: 0, color: "#B45332", fontSize: 13 }}>商品预览加载失败，请稍后重试</p>
      </section>
    );
  }

  return <ProductRowBlock module={toModule(props, toCards(products)) as any} editMode />;
}

export const productRowPuckConfig = {
  render: (props: ProductRowPuckProps) => <ProductRowPreview {...props} />,
  defaultProps: {
    title: "精选商品",
    subtitle: "",
    productIds: [],
    layout: "grid-3",
    bgColor: "#FCFCFB",
    locked: false,
  } satisfies ProductRowPuckProps,
  fields: {
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "text" as const, label: "副标题" },
    productIds: {
      type: "custom" as const,
      label: "选择商品",
      render: ({
        value,
        onChange,
        readOnly,
      }: {
        value?: number[];
        onChange: (value: number[]) => void;
        readOnly?: boolean;
      }) => (
        <ProductIdsField value={value || []} onChange={onChange} readOnly={readOnly} />
      ),
    } as any,
    layout: {
      type: "radio" as const,
      label: "列数",
      options: [
        { label: "2 列", value: "grid-2" },
        { label: "3 列", value: "grid-3" },
        { label: "4 列", value: "grid-4" },
      ],
    },
    bgColor: { type: "text" as const, label: "背景色" },
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
