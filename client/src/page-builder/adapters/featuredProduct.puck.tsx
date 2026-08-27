import { useEffect, useMemo, useState } from "react";
import FeaturedProductBlock from "@/components/blocks/FeaturedProductBlock";
import { resolveProductReferences, type ProductRow } from "../data-sources/productSource";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface FeaturedProductPuckProps {
  eyebrow: string;
  title: string;
  summary: string;
  productId: number;
  productCode: string;
  primaryText: string;
  secondaryText: string;
  secondaryLink: string;
  layout: "imageLeft" | "imageRight";
  showPrice: boolean;
  bgColor: string;
  /** 模板库专用，只参与缩略图渲染，不进入 defaultProps / PageDocument。 */
  __previewProduct?: ProductRow;
  locked?: boolean;
}

function toProduct(product?: ProductRow) {
  if (!product) return {};
  return { id: product.id, name: product.name, image: product.image, price: product.priceLabel, link: `/products/${encodeURIComponent(product.code || String(product.id))}` };
}

function FeaturedProductPreview(props: FeaturedProductPuckProps) {
  const productId = Number(props.productId) || 0;
  const productCode = String(props.productCode || "").trim();
  const [product, setProduct] = useState<ProductRow | undefined>();
  const [loading, setLoading] = useState(productId > 0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!productId && !productCode) {
      setProduct(undefined);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    const controller = new AbortController();
    resolveProductReferences({
      codes: productCode ? [productCode] : undefined,
      legacyIds: productId ? [productId] : undefined,
    }, controller.signal).then((rows) => {
      if (!cancelled) setProduct(rows[0]);
    }).catch(() => {
      if (!cancelled) {
        setProduct(undefined);
        setError(true);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [productCode, productId]);

  const module = useMemo(() => {
    const result = convertPuckProps("单品焦点推荐", props);
    if (result) result.content.product = toProduct(props.__previewProduct ?? product);
    return result;
  }, [product, props]);

  if (!module) return null;
  return (
    <>
      {loading ? (
        <p role="status" style={{ margin: 0, padding: "10px 20px", textAlign: "center", background: "#F4F5F5", color: "#5F6568", fontSize: 12 }}>
          正在加载主推商品，当前构图保持可编辑
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: 0, padding: "10px 20px", textAlign: "center", background: "#FAF0EF", color: "#8C3F3B", fontSize: 12 }}>
          主推商品加载失败，当前构图仍可调整
        </p>
      ) : null}
      <FeaturedProductBlock module={module} editMode />
    </>
  );
}

export const featuredProductPuckConfig = {
  render: (props: FeaturedProductPuckProps) => <FeaturedProductPreview {...props} />,
  defaultProps: {
    eyebrow: "SIGNATURE PIECE",
    title: "代表作品",
    summary: "为重要时刻挑选一件值得珍藏的珠宝，细节与光泽都经得起近距离凝视。",
    productId: 0,
    productCode: "",
    primaryText: "查看作品",
    secondaryText: "预约鉴赏",
    secondaryLink: "/contact",
    layout: "imageLeft",
    showPrice: false,
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies FeaturedProductPuckProps,
  resolvePermissions: (data: { props?: FeaturedProductPuckProps }) => data.props?.locked ? { delete: false, drag: false } : {},
};
