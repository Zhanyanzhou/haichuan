/** 日志与错误响应只保留路径，不复制可能含临时凭证的 query/fragment。 */
export function requestPathOnly(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "/";
  const raw = value.trim();
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).pathname || "/";
    } catch {
      return "/";
    }
  }
  const path = raw.split(/[?#]/, 1)[0];
  return path.startsWith("/") ? path || "/" : "/";
}

/** 访问日志进一步压低标识符暴露与标签基数，不改变实际路由处理。 */
export function requestLogPath(value: unknown): string {
  return requestPathOnly(value)
    .split("/")
    .map((segment) => {
      if (/^\d+$/.test(segment)) return ":id";
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
      if (/^(?:ORD|PAY|WX|ALIPAY|REFUND|RFQ)(?:[-_][A-Za-z0-9-]+|\d[A-Za-z0-9-]*)$/i.test(segment)) return ":id";
      if (segment.includes("%") || segment.includes("@")) return ":value";
      if (segment.length > 40) return ":value";
      return segment;
    })
    .join("/");
}
