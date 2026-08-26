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

export function catIcon(node: CatTreeNode): string {
  if (node.icon) return node.icon;
  return node.level === 1 ? "◆" : "·";
}

export function countProductsRecursive(node: CatTreeNode): number {
  const self = node._count?.products ?? 0;
  const childSum = (node.children ?? []).reduce(
    (sum, child) => sum + countProductsRecursive(child),
    0,
  );
  return self + childSum;
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

export function getSiblings(
  tree: CatTreeNode[],
  parent: number | null,
): CatTreeNode[] {
  if (parent === null) return tree;
  return findNode(tree, parent)?.children ?? [];
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
