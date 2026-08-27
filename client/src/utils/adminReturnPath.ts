const ADMIN_FALLBACK_PATH = "/admin/dashboard";
const RETURN_PATH_MAX_LENGTH = 2048;
const RETURN_PATH_BASE = "https://admin-return.invalid";

type LocationLike = {
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
};

export function normalizeAdminReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const candidate = value.trim();
  const hasControlCharacter = Array.from(candidate).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (
    !candidate ||
    candidate.length > RETURN_PATH_MAX_LENGTH ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    hasControlCharacter
  ) {
    return null;
  }

  try {
    const parsed = new URL(candidate, RETURN_PATH_BASE);
    if (parsed.origin !== RETURN_PATH_BASE) return null;
    if (parsed.pathname !== "/admin" && !parsed.pathname.startsWith("/admin/")) {
      return null;
    }
    if (
      parsed.pathname === "/admin/login" ||
      parsed.pathname.startsWith("/admin/login/")
    ) {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function adminReturnPathFromLocation(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const location = value as LocationLike;
  const pathname = typeof location.pathname === "string" ? location.pathname : "";
  const search = typeof location.search === "string" ? location.search : "";
  const hash = typeof location.hash === "string" ? location.hash : "";
  return normalizeAdminReturnPath(`${pathname}${search}${hash}`);
}

export function resolveAdminReturnPath(
  search: string,
  stateFrom?: unknown,
): string {
  const queryReturnTo = new URLSearchParams(search).get("returnTo");
  return (
    normalizeAdminReturnPath(queryReturnTo) ||
    adminReturnPathFromLocation(stateFrom) ||
    ADMIN_FALLBACK_PATH
  );
}

export function buildAdminLoginPath(returnTo: unknown): string {
  const safeReturnTo = normalizeAdminReturnPath(returnTo);
  return safeReturnTo
    ? `/admin/login?returnTo=${encodeURIComponent(safeReturnTo)}`
    : "/admin/login";
}
