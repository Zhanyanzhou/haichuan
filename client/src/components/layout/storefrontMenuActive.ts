/** 单件作品详情只属于选款中心。/products 是作品展陈页，不能因地址前缀把详情算进去。 */
export function isStorefrontMenuActive(pathname: string, href: string): boolean {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  if (/^\/products\/[^/]+/.test(path)) return href === "/catalog";
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}
