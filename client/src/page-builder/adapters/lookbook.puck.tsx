import { useEffect, useMemo, useState } from "react";
import LookbookBlock from "@/components/blocks/LookbookBlock";
import { resolveProductReferences, type ProductRow } from "../data-sources/productSource";
import { convertPuckProps } from "../utils/puckPropsToModule";
import type { LinkTargetType } from "../utils/linkTarget";

export interface LookbookPuckProps {
  title: string;
  subtitle: string;
  image: string;
  altText: string;
  /** 历史草稿兼容；新保存统一使用 altText。 */
  imageAlt?: string;
  productIds: number[];
  productCodes: string[];
  actionText: string;
  linkUrl: string;
  targetType: LinkTargetType;
  productId: number;
  bgColor: string;
  /** 模板库专用，只参与缩略图渲染，不进入 defaultProps / PageDocument。 */
  __previewProducts?: ProductRow[];
  locked?: boolean;
}

function toProducts(products: ProductRow[]) {
  return products.map((product) => ({ id: product.id, name: product.name, image: product.image, price: product.priceLabel, link: `/products/${encodeURIComponent(product.code || String(product.id))}` }));
}

export function LookbookPreview({
  editMode = true,
  stableReferencesOnly = false,
  ...props
}: LookbookPuckProps & { editMode?: boolean; stableReferencesOnly?: boolean }) {
  const ids = useMemo(() => (
    !stableReferencesOnly && Array.isArray(props.productIds)
      ? props.productIds.map(Number).filter((id) => id > 0)
      : []
  ), [props.productIds, stableReferencesOnly]);
  const idsKey = ids.join(",");
  const codes = useMemo(() => Array.isArray(props.productCodes) ? props.productCodes.map(String).filter(Boolean) : [], [props.productCodes]);
  const codesKey = codes.join(",");
  const [products, setProducts] = useState<ProductRow[]>([]);

  useEffect(() => {
    if (!idsKey && !codesKey) { setProducts([]); return; }
    let cancelled = false;
    const controller = new AbortController();
    resolveProductReferences({ codes: codes.length ? codes : undefined, legacyIds: ids.length ? ids : undefined }, controller.signal).then((rows) => { if (!cancelled) setProducts(rows); }).catch(() => { if (!cancelled) setProducts([]); });
    return () => { cancelled = true; controller.abort(); };
  }, [codes, codesKey, ids, idsKey]);

  const module = useMemo(() => {
    const result = convertPuckProps("佩戴灵感", props);
    if (result) result.content.products = toProducts(props.__previewProducts ?? products);
    return result;
  }, [products, props]);
  return module ? <LookbookBlock module={module} editMode={editMode} /> : null;
}

export const lookbookPuckConfig = {
  render: (props: LookbookPuckProps) => <LookbookPreview {...props} />,
  defaultProps: {
    title: "佩戴灵感",
    subtitle: "在每一个日常与重要时刻，让珠宝成为你的光。",
    image: "",
    altText: "珠宝佩戴灵感",
    productIds: [],
    productCodes: [],
    actionText: "",
    linkUrl: "",
    targetType: "none",
    productId: 0,
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies LookbookPuckProps,
  resolvePermissions: (data: { props?: LookbookPuckProps }) => data.props?.locked ? { delete: false, drag: false } : {},
};
