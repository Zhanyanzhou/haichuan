export const BUSINESS_TIME_ZONE = "Asia/Shanghai";

/** 交易编号使用中国运营日，而不是服务器或 UTC 日界。 */
export function businessDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}${values.get("month")}${values.get("day")}`;
}
