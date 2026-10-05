const DATED_UPLOAD_URL = /^\/uploads\/\d{4}\/\d{2}\/\d{2}\/[^/?#]+$/;

export function isDatedUploadUrl(url: string) {
  return DATED_UPLOAD_URL.test(url);
}

/** 只替换完整字符串值，避免把路径片段写进更长的地址。 */
export function replaceExactStringValues<T>(value: T, replacements: ReadonlyMap<string, string>): T {
  if (typeof value === "string") {
    return (replacements.get(value) ?? value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceExactStringValues(item, replacements)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        replaceExactStringValues(item, replacements),
      ]),
    ) as T;
  }
  return value;
}
