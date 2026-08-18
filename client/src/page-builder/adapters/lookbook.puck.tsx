import { useEffect, useMemo, useState } from "react";
import LookbookBlock from "@/components/blocks/LookbookBlock";
import { fetchProductsByIds, type ProductRow } from "../data-sources/productSource";
import { convertPuckProps } from "../utils/puckPropsToModule";
import type { LinkTargetType } from "../utils/linkTarget";

export interface LookbookPuckProps {
  title: string;
  subtitle: string;
  image: string;
  imageAlt: string;
  productIds: number[];
  actionText: string;
  linkUrl: string;
  targetType: LinkTargetType;
  productId: number;
  bgColor: string;
  locked?: boolean;
}

function toProducts(products: ProductRow[]) {
  return products.map((product) => ({ id: product.id, name: product.name, image: product.image, price: product.priceLabel, link: `/products/${product.id}` }));
}

function LookbookPreview(props: LookbookPuckProps) {
  const ids = useMemo(() => (Array.isArray(props.productIds) ? props.productIds.map(Number).filter((id) => id > 0) : []), [props.productIds]);
  const idsKey = ids.join(",");
  const [products, setProducts] = useState<ProductRow[]>([]);

  useEffect(() => {
    if (!idsKey) { setProducts([]); return; }
    let cancelled = false;
    fetchProductsByIds(idsKey.split(",").map(Number)).then((rows) => { if (!cancelled) setProducts(rows); }).catch(() => { if (!cancelled) setProducts([]); });
    return () => { cancelled = true; };
  }, [idsKey]);

  const module = useMemo(() => {
    const result = convertPuckProps("佩戴灵感", props as any);
    if (result) (result as any).content.products = toProducts(products);
    return result;
  }, [products, props]);
  return module ? <LookbookBlock module={module} editMode /> : null;
}

export const lookbookPuckConfig = {
  render: (props: LookbookPuckProps) => <LookbookPreview {...props} />,
  defaultProps: {
    title: "佩戴灵感",
    subtitle: "在每一个日常与重要时刻，让珠宝成为你的光。",
    image: "",
    imageAlt: "珠宝佩戴灵感",
    productIds: [],
    actionText: "",
    linkUrl: "",
    targetType: "none",
    productId: 0,
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies LookbookPuckProps,
  resolvePermissions: (data: any) => data.props?.locked ? { delete: false, drag: false } : {},
};
