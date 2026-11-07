import type { Category } from "@/types";

export interface CatTreeNode extends Category {
  children?: CatTreeNode[];
  manageableProductCount?: number;
  isUncategorized?: boolean;
}

/** 一级类目直属商品在目录中通过「未分类」查看，归属仍使用一级类目的 ID。 */
export function hasUnclassifiedProducts(node: CatTreeNode): boolean {
  return node.level === 1 && !node.isUncategorized && (node.manageableProductCount ?? 0) > 0;
}

export function matchesCategoryQuery(node: CatTreeNode, query: string): boolean {
  const normalized = query.toLowerCase();
  return node.name.toLowerCase().includes(normalized) || node.slug.toLowerCase().includes(normalized);
}

export function countProductsRecursive(node: CatTreeNode): number {
  const self = node._count?.products ?? 0;
  const childSum = (node.children ?? []).reduce(
    (sum, child) => sum + countProductsRecursive(child),
    0,
  );
  return self + childSum;
}

/** 商品浏览与商品管理使用同一分类范围。 */
export function categoryProductsPath(
  node: CatTreeNode,
  status?: "ARCHIVED",
  includeDescendants = !!node.children?.length,
): string {
  const params = new URLSearchParams({ categoryId: String(node.id) });
  if (includeDescendants) params.set("includeDescendants", "1");
  if (status) params.set("status", status);
  return `/admin/products?${params.toString()}`;
}

/** 返回当前分支的可管理数量。兼容尚未提供此字段的后端。 */
export function countManageableProducts(node: CatTreeNode): number | undefined {
  let count = node.manageableProductCount;
  if (count === undefined) return undefined;
  for (const child of node.children ?? []) {
    const childCount = countManageableProducts(child);
    if (childCount === undefined) return undefined;
    count += childCount;
  }
  return count;
}

/** 删除时要一起去掉的分类：自身和下级款式。 */
export function subtreeIds(node: CatTreeNode): number[] {
  const ids = [node.id];
  for (const child of node.children ?? []) ids.push(...subtreeIds(child));
  return ids;
}

/** 商品改去的分类。即将删除的分类及其下级不能作为去向。 */
export function categoryMoveOptions(
  tree: CatTreeNode[],
  excluded: Set<number>,
): Array<{ value: number; label: string }> {
  const options: Array<{ value: number; label: string }> = [];
  const walk = (nodes: CatTreeNode[], prefix: string) => {
    const siblings = sortCategories(nodes);
    siblings.forEach((node, index) => {
      if (excluded.has(node.id)) return;
      const name = siblings.some((peer) => peer.id !== node.id && peer.name === node.name)
        ? `${node.name}（第 ${index + 1} 位）`
        : node.name;
      const label = prefix ? `${prefix} / ${name}` : name;
      options.push({ value: node.id, label });
      if (node.children?.length) walk(node.children, label);
    });
  };
  walk(tree, "");
  return options;
}

export function collectSlugs(
  nodes: CatTreeNode[],
  taken = new Set<string>(),
): Set<string> {
  for (const node of nodes) {
    if (node.slug) taken.add(node.slug);
    if (node.children?.length) collectSlugs(node.children, taken);
  }
  return taken;
}

/** 运营只填中文名。拉丁名称转成编码，中文名称由系统生成，避免手填网址。 */
export function categorySlugFromName(name: string, taken: Set<string>): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = ascii || "cat";
  if (!taken.has(base)) return base;
  let index = 2;
  let slug = `${base}-${index}`;
  while (taken.has(slug)) {
    index += 1;
    slug = `${base}-${index}`;
  }
  return slug;
}

export function nextSortOrder(
  tree: CatTreeNode[],
  parentId: number | null,
): number {
  const siblings = parentId ? findNode(tree, parentId)?.children ?? [] : tree;
  return siblings.reduce((max, item) => item.isUncategorized ? max : Math.max(max, item.sortOrder || 0), 0) + 1;
}

export function findNode(
  nodes: CatTreeNode[],
  id: number,
): CatTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function getCategoryPath(tree: CatTreeNode[], id: number): CatTreeNode[] {
  for (const node of tree) {
    if (node.id === id) return [node];
    const path = node.children?.length ? getCategoryPath(node.children, id) : [];
    if (path.length) return [node, ...path];
  }
  return [];
}

/** 分类目录只显示有待处理商品的「未分类」，并收起历史停用空分类。 */
export function withoutRetiredEmpty(nodes: CatTreeNode[]): CatTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.isUncategorized) {
      const workingCount = node.manageableProductCount ?? node._count?.products ?? 0;
      return workingCount > 0 ? [node] : [];
    }
    const children = node.children?.length
      ? withoutRetiredEmpty(node.children)
      : node.children;
    const next = children === node.children ? node : { ...node, children };
    const childCount = next.children?.length ?? 0;
    const productCount = next._count?.products ?? 0;
    if (next.isActive === false && childCount === 0 && productCount === 0) {
      return [];
    }
    return [next];
  });
}

export function getSiblings(
  tree: CatTreeNode[],
  parent: number | null,
): CatTreeNode[] {
  if (parent === null) return tree;
  return findNode(tree, parent)?.children ?? [];
}

export function orderedSiblings(
  tree: CatTreeNode[],
  parent: number | null,
): CatTreeNode[] {
  return sortCategories(getSiblings(tree, parent));
}

export function sortCategories(nodes: CatTreeNode[]): CatTreeNode[] {
  return [...nodes].sort((left, right) =>
    Number(!!right.isUncategorized) - Number(!!left.isUncategorized) ||
    left.sortOrder - right.sortOrder || left.id - right.id,
  );
}

export function applySiblingOrder(
  tree: CatTreeNode[],
  parent: number | null,
  newSiblings: CatTreeNode[],
): CatTreeNode[] {
  if (parent === null) {
    return newSiblings.map((sibling, index) => ({
      ...sibling,
      sortOrder: index + 1,
    }));
  }

  const walk = (nodes: CatTreeNode[]): CatTreeNode[] =>
    nodes.map((node) => {
      if (node.id === parent) {
        return {
          ...node,
          children: newSiblings.map((sibling, index) => ({
            ...sibling,
            sortOrder: index + 1,
          })),
        };
      }
      if (node.children?.length) {
        return { ...node, children: walk(node.children) };
      }
      return node;
    });

  return walk(tree);
}

export function filterTree(
  nodes: CatTreeNode[],
  query: string,
): CatTreeNode[] {
  if (!query) return nodes;
  const normalizedQuery = query.toLowerCase();

  const walk = (list: CatTreeNode[]): CatTreeNode[] => {
    const result: CatTreeNode[] = [];
    for (const node of list) {
      const selfMatch = matchesCategoryQuery(node, normalizedQuery);
      const unclassifiedMatch = hasUnclassifiedProducts(node) && "未分类".includes(normalizedQuery);
      const filteredChildren = node.children?.length
        ? walk(node.children)
        : [];
      if (selfMatch || unclassifiedMatch || filteredChildren.length) {
        result.push({
          ...node,
          children: selfMatch ? node.children : filteredChildren,
        });
      }
    }
    return result;
  };

  return walk(nodes);
}
