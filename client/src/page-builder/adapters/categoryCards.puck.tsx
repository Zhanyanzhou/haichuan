/**
 * categoryCards.puck.ts — CategoryCardsBlock 适配器
 */

import { useEffect, useMemo, useState } from "react";
import CategoryCardsBlock from "@/components/blocks/CategoryCardsBlock";
import { categoryApi, type CategoryReferenceResult } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { convertPuckProps } from "../utils/puckPropsToModule";

export interface CategoryCardItem {
  name: string;
  image: string;
  link: string;
  count?: string;
  description?: string;
  altText?: string;
  focusX?: number;
  focusY?: number;
}

export interface CategoryCardsPuckProps {
  title: string;
  subtitle?: string;
  /**
   * 分类卡片数据（P1-42：原仅录入 categoryId，但渲染端期望 categories 数组，
   * 导致区块恒空不可用。改为直接配置 categories，每项含 name/image/link/count。
   * 每项均独立维护名称、图片、跳转与辅助信息。）
   */
  categories: CategoryCardItem[];
  categorySlugs: string[];
  layout: string;
  bgColor: string;
  locked?: boolean;
}

function CategoryCardsPreview(props: CategoryCardsPuckProps) {
  const slugs = useMemo(
    () => Array.isArray(props.categorySlugs) ? props.categorySlugs.map(String).filter(Boolean) : [],
    [props.categorySlugs],
  );
  const [resolved, setResolved] = useState<CategoryCardItem[]>([]);
  const [loading, setLoading] = useState(slugs.length > 0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slugs.length) { setResolved([]); setLoading(false); setError(false); return; }
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void categoryApi.resolveReferences(slugs, controller.signal)
      .then((response) => {
        const data = unwrapResponse<CategoryReferenceResult[]>(response);
        if (!controller.signal.aborted) setResolved((Array.isArray(data) ? data : []).map((node) => ({
          name: node.name || node.slug,
          image: node.coverImage || "",
          link: node.id ? `/products?categoryId=${node.id}` : "",
          altText: node.name || node.slug,
          description: node.eligible ? "" : "当前不可发布，请在属性面板处理",
        })));
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slugs]);

  if (loading) return <section role="status" aria-live="polite" style={{ padding: 56, textAlign: "center", background: props.bgColor }}>正在加载分类预览</section>;
  if (error) return <section role="alert" style={{ padding: 56, textAlign: "center", background: props.bgColor }}>分类预览加载失败，已保留当前引用</section>;
  const module = convertPuckProps("分类卡片", {
    ...props,
    categories: slugs.length ? resolved : props.categories,
  });
  return module ? <CategoryCardsBlock module={module as any} editMode /> : null;
}

export const categoryCardsPuckConfig = {
  render: (props: CategoryCardsPuckProps) => (
    <CategoryCardsPreview {...props} />
  ),
  defaultProps: {
    title: "探索分类",
    subtitle: "按品类、系列或主题，找到适合你的珠宝作品。",
    categories: [
      { name: "手镯", image: "", link: "/products", count: "" },
      { name: "吊坠", image: "", link: "/products", count: "" },
      { name: "戒指", image: "", link: "/products", count: "" },
    ],
    categorySlugs: [],
    layout: "grid-3",
    bgColor: "#FFFFFF",
    locked: false,
  } satisfies CategoryCardsPuckProps,
  resolvePermissions: (data: any) => {
    if (data.props?.locked) return { delete: false, drag: false };
    return {};
  },
};
