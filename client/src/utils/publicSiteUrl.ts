export interface PublicSiteOriginOptions {
  allowHttp?: boolean;
}

/**
 * 公开站点 Origin 是部署配置，不是品牌事实。非法或带路径的值一律不参与 SEO 输出。
 */
export function normalizePublicSiteOrigin(
  value: unknown,
  options: PublicSiteOriginOptions = {},
): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    const protocolAllowed =
      url.protocol === "https:" ||
      (options.allowHttp === true && url.protocol === "http:");
    if (
      !protocolAllowed ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function buildPublicUrl(
  origin: string | null,
  pathname: string,
): string | null {
  if (!origin) return null;
  const safePath = `/${String(pathname || "/").replace(/^\/+/, "")}`;
  return new URL(safePath, `${origin}/`).href;
}
