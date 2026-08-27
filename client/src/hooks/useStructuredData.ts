import { useEffect } from "react";

type StructuredDataValue = Record<string, unknown> | Array<Record<string, unknown>>;

/**
 * 将由当前公开事实生成的 JSON-LD 同步到文档头部。
 * 使用 textContent 而不是 innerHTML，并转义 `<`，避免业务文本闭合 script 标签。
 */
export function useStructuredData(
  id: string,
  value: StructuredDataValue | null | undefined,
) {
  const serialized = value
    ? JSON.stringify(value).replace(/</g, "\\u003c")
    : "";

  useEffect(() => {
    const selector = `script[type="application/ld+json"][data-structured-data="${id}"]`;
    const existing = document.head.querySelector<HTMLScriptElement>(selector);

    if (!serialized) {
      existing?.remove();
      return;
    }

    const script = existing ?? document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.structuredData = id;
    script.textContent = serialized;
    if (!existing) document.head.appendChild(script);

    return () => script.remove();
  }, [id, serialized]);
}
