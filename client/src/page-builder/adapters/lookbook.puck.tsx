import { useEffect, useMemo, useState } from "react";
import LookbookBlock from "@/components/blocks/LookbookBlock";
import { IMAGE_SPECS } from "../config/imageSpecs";
import { fetchProductsByIds, type ProductRow } from "../data-sources/productSource";
import ProductIdsField from "../fields/ProductIdsField";
import MediaPickerField from "../fields/MediaPickerField";
import { colorPuckField } from "../fields/ColorField";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface LookbookPuckProps {
  title: string;
  subtitle: string;
  image: string;
  imageAlt: string;
  productIds: number[];
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
    bgColor: "#FCFCFB",
    locked: false,
  } satisfies LookbookPuckProps,
  fields: {
    title: { type: "text" as const, label: "标题" },
    subtitle: { type: "textarea" as const, label: "副标题" },
    image: { type: "custom" as const, label: "佩戴场景图", render: ({ value, onChange, readOnly }: { value?: string; onChange: (value: string) => void; readOnly?: boolean }) => <MediaPickerField fieldKey="image" device="shared" value={value} onChange={onChange} readOnly={readOnly} spec={IMAGE_SPECS.lookbook.image} placeholder="上传佩戴场景图" /> },
    imageAlt: { type: "text" as const, label: "图片替代文本" },
    productIds: { type: "custom" as const, label: "关联商品（建议 2–3 件）", render: ({ value, onChange, readOnly }: { value?: number[]; onChange: (value: number[]) => void; readOnly?: boolean }) => <ProductIdsField value={value || []} onChange={onChange} readOnly={readOnly} /> } as any,
    bgColor: colorPuckField("背景色"),
  },
  resolvePermissions: (data: any) => data.props?.locked ? { delete: false, drag: false } : {},
};
