import { useEffect, useState } from "react";
import { attributeApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { MATERIALS, CRAFTS } from "@/data/catalogData";

interface AttributeOption {
  id: number;
  value: string;
  sortOrder: number;
}

interface AttributeNode {
  key: string;
  name: string;
  values: AttributeOption[];
}

/**
 * 商品属性字典（单一来源：后端 /attributes）。
 * 加载失败或字典为空时回退到静态兜底常量，保证筛选器始终可用。
 */
export function useAttributeDictionary() {
  const [nodes, setNodes] = useState<AttributeNode[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await attributeApi.getPublic();
        const data = unwrapResponse<AttributeNode[]>(res) || [];
        if (!cancelled) setNodes(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setNodes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const valuesOf = (key: string, fallback: string[]) => {
    const node = nodes.find((n) => n.key === key);
    const values = (node?.values || []).map((v) => v.value).filter(Boolean);
    return values.length > 0 ? values : fallback;
  };

  return {
    materialOptions: valuesOf("material", MATERIALS),
    craftOptions: valuesOf("craft", CRAFTS),
    loaded: nodes.length > 0,
  };
}
