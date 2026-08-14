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
    bgColor: "#FCFCFB",
    showPrice: true,
    showButton: false,
    buttonText: "查看详情",
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
    mobileColumns: {
      type: "radio" as const,
      label: "移动端列数",
      options: [
        { label: "1 列", value: 1 },
        { label: "2 列", value: 2 },
      ],
    },
    displayMode: {
      type: "radio" as const,
      label: "展示模式",
      options: [
        { label: "画册展示", value: "album" },
        { label: "标准选款", value: "standard" },
      ],
    },
    actionStyle: {
      type: "radio" as const,
      label: "操作样式",
      options: [
        { label: "整卡点击", value: "none" },
        { label: "文字链接", value: "text" },
        { label: "描边按钮", value: "button" },
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
