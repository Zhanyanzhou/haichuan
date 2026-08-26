import type { RealCategory } from "@/hooks/useProductData";

/** 从真实分类树查找名称。 */
export function catNameById(tree: RealCategory[], id: number): string {
  for (const category of tree) {
    if (category.id === id) return category.name;
    if (category.children?.length) {
      const found = catNameById(category.children, id);
      if (found) return found;
    }
  }
  return "";
}

/** 获取一级分类的二级子分类。 */
export function getRealSubs(
  tree: RealCategory[],
  parentId: number,
): RealCategory[] {
  for (const category of tree) {
    if (category.id === parentId) return category.children || [];
  }
  return [];
}

/** 从真实分类树获取一级分类列表。 */
export function getPrimaryCats(tree: RealCategory[]): RealCategory[] {
  return tree
    .filter((category) => category.level === 1)
    .sort((a, b) => a.id - b.id);
}
