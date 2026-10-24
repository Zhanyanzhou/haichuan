/** 中文站浏览器标签上的站点名称。页眉和页脚仍用短名称。 */
export const OFFICIAL_BROWSER_TITLE = "海川珠宝官方网站";

/**
 * 浏览器标签使用官方网站标题。
 * 站点设置里的默认标题若另有文案，优先用那句；没配或仍是短站点名时，用官方网站标题。
 * 页眉、页脚继续用站点名称，不把整句官方标题放进标志。
 */
export function applyOfficialSiteTitle(
  title: string | undefined,
  siteName: string,
  officialTitle: string | undefined,
): string {
  const brand = siteName.trim();
  const configured = officialTitle?.trim();
  const official = configured && configured !== brand
    ? configured
    : brand === "海川珠宝"
      ? OFFICIAL_BROWSER_TITLE
      : "";
  const resolved = title?.trim() || brand;
  if (!official || !brand || official === brand) return resolved;
  if (resolved === brand || resolved === official) return official;
  const suffix = ` | ${brand}`;
  if (resolved.endsWith(suffix)) {
    return `${resolved.slice(0, -suffix.length)} | ${official}`;
  }
  return resolved;
}
