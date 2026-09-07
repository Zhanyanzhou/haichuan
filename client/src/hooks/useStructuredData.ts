import { useEffect } from "react";

type StructuredDataNode = Record<string, unknown>;
type StructuredDataValue = StructuredDataNode | StructuredDataNode[];

const ABSOLUTE_PUBLIC_URL_KEYS = new Set([
  "contentUrl",
  "image",
  "item",
  "logo",
  "sameAs",
  "thumbnailUrl",
  "url",
]);

function isPlainObject(value: unknown): value is StructuredDataNode {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype,
  );
}

function isSchemaType(value: unknown): boolean {
  return (
    (typeof value === "string" && Boolean(value.trim()))
    || (Array.isArray(value)
      && value.length > 0
      && value.every((entry) => typeof entry === "string" && Boolean(entry.trim())))
  );
}

function isAbsolutePublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return typeof window !== "undefined"
      && url.protocol === "http:"
      && url.origin === window.location.origin
      && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function hasSafeStructuredValues(
  value: unknown,
  seen: WeakSet<object>,
  key = "",
): boolean {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    if (typeof value !== "string" || !ABSOLUTE_PUBLIC_URL_KEYS.has(key)) return true;
    return isAbsolutePublicUrl(value);
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  if (!Array.isArray(value) && !isPlainObject(value)) return false;

  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => hasSafeStructuredValues(entry, seen, key))
    : Object.entries(value).every(
        ([childKey, entry]) => hasSafeStructuredValues(entry, seen, childKey),
      );
  seen.delete(value);
  return valid;
}

function isValidStructuredDataNode(value: unknown): value is StructuredDataNode {
  return Boolean(
    isPlainObject(value)
    && value["@context"] === "https://schema.org"
    && isSchemaType(value["@type"])
    && hasSafeStructuredValues(value, new WeakSet()),
  );
}

/**
 * 结构化数据必须是完整、可序列化的 schema.org 根节点；任一根节点不合法时
 * 整组不输出，避免搜索引擎消费半真半假的事实。
 */
export function serializeStructuredData(
  value: StructuredDataValue | null | undefined,
): string | null {
  if (!value) return null;
  const nodes = Array.isArray(value) ? value : [value];
  if (!nodes.length || !nodes.every(isValidStructuredDataNode)) return null;

  try {
    const serialized = JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    return serialized.length <= 200_000 ? serialized : null;
  } catch {
    return null;
  }
}

function findStructuredDataScripts(id: string): HTMLScriptElement[] {
  return Array.from(
    document.head.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"][data-structured-data]',
    ),
  ).filter((script) => script.dataset.structuredData === id);
}

/** 将当前公开事实同步到文档头部；非法值会删除旧节点并保持 fail-closed。 */
export function useStructuredData(
  id: string,
  value: StructuredDataValue | null | undefined,
) {
  const normalizedId = id.trim().slice(0, 80);
  const serialized = serializeStructuredData(value);

  useEffect(() => {
    if (!normalizedId) return;
    const matches = findStructuredDataScripts(normalizedId);
    const existing = matches.shift();
    matches.forEach((duplicate) => duplicate.remove());

    if (!serialized) {
      existing?.remove();
      return;
    }

    const script = existing ?? document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.structuredData = normalizedId;
    script.textContent = serialized;
    if (!existing) document.head.appendChild(script);

    return () => {
      if (script.dataset.structuredData === normalizedId) script.remove();
    };
  }, [normalizedId, serialized]);
}
