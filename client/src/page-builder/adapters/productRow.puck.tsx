/**
 * productRow.puck.ts — ProductRowBlock 适配器（商品数据绑定）
 */

import { useEffect, useMemo, useState } from "react";
import ProductRowBlock from "@/components/blocks/ProductRowBlock";
import { fetchProductsByIds, type ProductRow } from "../data-sources/productSource";
import { convertPuckProps } from "../utils/puckPropsToModule";
import ProductIdsField from "../fields/ProductIdsField";
import { colorPuckField } from "../fields/ColorField";

export interface ProductRowPuckProps {
  title: string;
  subtitle: string;
  productIds: number[];
  layout: string;
  bgColor: string;
  imageRatio: string;
  showPrice: boolean;
  showButton: boolean;
  buttonText: string;
  titleSize: string;
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
      imageRatio: props.imageRatio || "3:4",
      showPrice: props.showPrice ?? true,
      showButton: props.showButton ?? false,
      buttonText: props.buttonText || "查看详情",
      titleSize: props.titleSize || "medium",
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

  return <ProductRowBlock module={convertPuckProps("产品展示行", { ...props, productIds }) as any || toModule(props, toCards(products)) as any} editMode />;
}

export const productRowPuckConfig = {
  render: (props: ProductRowPuckProps) => <ProductRowPreview {...props} />,
  defaultProps: {
    title: "精选商品",
    subtitle: "",
    productIds: [],
    layout: "grid-3",
    bgColor: "#FCFCFB",
    imageRatio: "3:4",
    showPrice: true,
    showButton: false,
    buttonText: "查看详情",
    titleSize: "medium",
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
    imageRatio: {
      type: "radio" as const,
      label: "图片比例",
      options: [
        { label: "3:4 竖版", value: "3:4" },
        { label: "1:1 正方形", value: "1:1" },
        { label: "4:3 横版", value: "4:3" },
        { label: "16:9 宽屏", value: "16:9" },
      ],
    },
    titleSize: {
      type: "radio" as const,
      label: "标题大小",
      options: [
        { label: "小", value: "small" },
        { label: "中", value: "medium" },
        { label: "大", value: "large" },
      ],
    },
    showPrice: {
      type: "radio" as const,
      label: "显示价格",
      options: [
        { label: "显示", value: true },
        { label: "隐藏", value: false },
      ],
    },
    showButton: {
      type: "radio" as const,
      label: "显示按钮",
      options: [
        { label: "显示", value: true },
        { label: "隐藏", value: false },
      ],
    },
    buttonText: { type: "text" as const, label: "按钮文字" },
    bgColor: colorPuckField("背景色"),
  },
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
