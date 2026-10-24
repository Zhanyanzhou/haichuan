import { hasSessionCookie } from "../../common/security/session-security";

const BLOCKED_PUBLIC_PATH = /^\/(?:admin|preview|customer|cart|checkout|partner)(?:\/|$)/;

/** 未显式关闭时计入。回退只把 STOREFRONT_TRAFFIC_ENABLED 设为 false。 */
export function isStorefrontTrafficEnabled(): boolean {
  return process.env.STOREFRONT_TRAFFIC_ENABLED !== "false";
}

/** 正式页路径。英文前缀并入同一页，后台和交易路径直接丢掉。 */
export function normalizeStorefrontPath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (
    !trimmed.startsWith("/")
    || trimmed.length > 300
    || trimmed.includes("?")
    || trimmed.includes("#")
    || trimmed.includes("\\")
    || trimmed.includes("//")
  ) {
    return null;
  }
  const normalized = trimmed.replace(/^\/en(?=\/|$)/, "") || "/";
  if (BLOCKED_PUBLIC_PATH.test(normalized)) return null;
  return normalized;
}

export function isStaffStorefrontRequest(cookieHeader: unknown): boolean {
  return hasSessionCookie(cookieHeader, "admin");
}
