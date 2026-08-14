import { useEffect, useMemo, useState } from "react";
import FeaturedProductBlock from "@/components/blocks/FeaturedProductBlock";
import { fetchProductsByIds, type ProductRow } from "../data-sources/productSource";
import ProductIdsField from "../fields/ProductIdsField";
import { colorPuckField } from "../fields/ColorField";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface FeaturedProductPuckProps {
  eyebrow: string;
  title: string;
  summary: string;
  productId: number;
  primaryText: string;
  secondaryText: string;
  secondaryLink: string;
  layout: "imageLeft" | "imageRight";
  bgColor: string;
  locked?: boolean;
}

function toProduct(product?: ProductRow) {
  if (!product) return {};
  return { id: product.id, name: product.name, image: product.image, price: product.priceLabel, link: `/products/${product.id}` };
}

function FeaturedProductPreview(props: FeaturedProductPuckProps) {
  const productId = Number(props.productId) || 0;
  const [product, setProduct] = useState<ProductRow | undefined>();
  const [loading, setLoading] = useState(productId > 0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!productId) {
      setProduct(undefined);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchProductsByIds([productId]).then((rows) => {
      if (!cancelled) setProduct(rows[0]);
    }).catch(() => {
      if (!cancelled) {
        setProduct(undefined);
        setError(true);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [productId]);

  const module = useMemo(() => {
    const result = convertPuckProps("单品焦点推荐", props as any);
    if (result) (result as any).content.product = toProduct(product);
    return result;
  }, [product, props]);

  if (!module) return null;
  if (loading) return <section style={{ padding: 56, textAlign: "center", background: props.bgColor }}>正在加载主推商品</section>;
  if (error) return <section role="alert" style={{ padding: 56, textAlign: "center", background: props.bgColor, color: "#8B5E3C" }}>主推商品加载失败，请稍后重试</section>;
  return <FeaturedProductBlock module={module} editMode />;
}

export const featuredProductPuckConfig = {
  render: (props: FeaturedProductPuckProps) => <FeaturedProductPreview {...props} />,
  defaultProps: {
    eyebrow: "FEATURED PIECE",
    title: "本季主推作品",
    summary: "为重要时刻挑选一件值得珍藏的珠宝，细节与光泽都经得起近距离凝视。",
    productId: 0,
    primaryText: "查看作品",
    secondaryText: "预约鉴赏",
    secondaryLink: "/contact",
    layout: "imageLeft",
    bgColor: "#F5F2ED",
    locked: false,
  } satisfies FeaturedProductPuckProps,
  fields: {
    eyebrow: { type: "text" as const, label: "眉题" },
    title: { type: "text" as const, label: "标题" },
    summary: { type: "textarea" as const, label: "作品卖点" },
    productId: {
      type: "custom" as const,
      label: "主推商品（仅限 1 件）",
      render: ({ value, onChange, readOnly }: { value?: number; onChange: (value: number) => void; readOnly?: boolean }) => (
        <ProductIdsField value={value ? [value] : []} onChange={(ids) => onChange(ids[ids.length - 1] || 0)} readOnly={readOnly} />
      ),
    } as any,
    primaryText: { type: "text" as const, label: "主按钮文字" },
    secondaryText: { type: "text" as const, label: "次按钮文字" },
    secondaryLink: { type: "text" as const, label: "次按钮链接" },
    layout: {
      type: "radio" as const,
      label: "桌面版式",
      options: [
        { label: "商品图在左", value: "imageLeft" },
        { label: "商品图在右", value: "imageRight" },
      ],
    },
    bgColor: colorPuckField("背景色"),
  },
  resolvePermissions: (data: any) => data.props?.locked ? { delete: false, drag: false } : {},
};
