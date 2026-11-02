/**
 * 商品变更流在每次连接时先发 ready，心跳不代表目录已变化。
 * 这两种握手不能当成重新加载商品的理由。
 */
export function isStreamHandshake(data: unknown): boolean {
  if (typeof data !== "string" || data.length === 0 || data.length > 4096) return false;
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const record = parsed as Record<string, unknown>;
    const nested = record.data;
    const source = nested && typeof nested === "object" && !Array.isArray(nested)
      ? nested as Record<string, unknown>
      : record;
    return source.type === "ready" || source.type === "heartbeat";
  } catch {
    return false;
  }
}
