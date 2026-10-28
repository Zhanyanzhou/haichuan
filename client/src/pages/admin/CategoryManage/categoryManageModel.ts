import type { TreeDataNode, TreeProps } from "antd";
import type { Category } from "@/types";

export interface CatTreeNode extends Category {
  children?: CatTreeNode[];
}

export interface CatTreeDataNode extends TreeDataNode {
  node?: CatTreeNode;
}

export type CategoryDropInfo = Parameters<
  NonNullable<TreeProps["onDrop"]>
>[0];

export function countProductsRecursive(node: CatTreeNode): number {
  const self = node._count?.products ?? 0;
  const childSum = (node.children ?? []).reduce(
    (sum, child) => sum + countProductsRecursive(child),
    0,
  );
  return self + childSum;
}

/** 顾客从该分类进入选款时会看到的商品数：品类含下级，款式只计本级。 */
export function visibleProductCount(node: CatTreeNode): number {
  return node.level === 1 ? countProductsRecursive(node) : (node._count?.products ?? 0);
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
    for (const node of nodes) {
      if (excluded.has(node.id)) continue;
      const label = prefix ? `${prefix} / ${node.name}` : node.name;
      options.push({ value: node.id, label });
      if (node.children?.length) walk(node.children, label);
    }
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
  return siblings.reduce((max, item) => Math.max(max, item.sortOrder || 0), 0) + 1;
}

export function buildParentMap(
  nodes: CatTreeNode[],
  parent: number | null = null,
  out = new Map<number, number | null>(),
): Map<number, number | null> {
  for (const node of nodes) {
    out.set(node.id, parent);
    if (node.children?.length) buildParentMap(node.children, node.id, out);
  }
  return out;
}

export function buildTreeData(nodes: CatTreeNode[]): CatTreeDataNode[] {
  return nodes.map((node) => ({
    key: node.id,
    node,
    children:
      node.level === 1 && node.children?.length
        ? buildTreeData(node.children)
        : undefined,
  }));
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

export function removeNode(tree: CatTreeNode[], id: number): CatTreeNode[] {
  return tree.flatMap((node) => {
    if (node.id === id) return [];
    if (!node.children?.length) return [node];
    return [{ ...node, children: removeNode(node.children, id) }];
  });
}

/** 已不在前台、且没有款式和商品的分类不再出现在列表里。 */
export function withoutRetiredEmpty(nodes: CatTreeNode[]): CatTreeNode[] {
  return nodes.flatMap((node) => {
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
  return getSiblings(tree, parent)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
}

export function getParentName(
  tree: CatTreeNode[],
  parentId?: number | null,
): string {
  if (!parentId) return "—";
  return findNode(tree, parentId)?.name ?? "—";
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
      const selfMatch =
        node.name.toLowerCase().includes(normalizedQuery) ||
        node.slug.toLowerCase().includes(normalizedQuery);
      const filteredChildren = node.children?.length
        ? walk(node.children)
        : [];
      if (selfMatch || filteredChildren.length) {
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
