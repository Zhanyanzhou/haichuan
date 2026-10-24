export const BUSINESS_TIME_ZONE = "Asia/Shanghai";
const BUSINESS_OFFSET = "+08:00";
const DAY_MS = 86_400_000;

function businessDateParts(date: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: values.get("year") || "",
    month: values.get("month") || "",
    day: values.get("day") || "",
  };
}

/** 交易编号使用中国运营日，而不是服务器或 UTC 日界。 */
export function businessDateKey(date = new Date()): string {
  const { year, month, day } = businessDateParts(date);
  return `${year}${month}${day}`;
}

/** 中国运营日 `YYYY-MM-DD`。经营统计的日界与趋势分桶都使用这一天。 */
export function businessDateStamp(date = new Date()): string {
  const { year, month, day } = businessDateParts(date);
  return `${year}-${month}-${day}`;
}

/** 中国运营日的日期和小时。小时使用 0–23，不随服务器本地时区变化。 */
export function businessHourParts(date = new Date()): { stamp: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const parsedHour = Number(values.get("hour"));
  const hour = Number.isInteger(parsedHour) && parsedHour >= 0 && parsedHour <= 23
    ? parsedHour
    : 0;
  return {
    stamp: `${values.get("year")}-${values.get("month")}-${values.get("day")}`,
    hour,
  };
}

/** 今日从 0 点到此刻，以及昨日同样长度的区间。 */
export function businessSamePeriod(now = new Date()) {
  const todayStart = businessDayStart(now);
  const yesterdayStart = businessDayStart(now, -1);
  const elapsed = Math.max(0, now.getTime() - todayStart.getTime());
  const { stamp, hour } = businessHourParts(now);
  return {
    todayStart,
    todayEnd: now,
    yesterdayStart,
    yesterdayEnd: new Date(yesterdayStart.getTime() + elapsed),
    hour,
    todayStamp: stamp,
    yesterdayStamp: shiftBusinessDate(stamp, -1),
  };
}

export function shiftBusinessDate(stamp: string, dayOffset: number): string {
  const start = new Date(`${stamp}T00:00:00${BUSINESS_OFFSET}`);
  return businessDateStamp(new Date(start.getTime() + dayOffset * DAY_MS));
}

/** 中国运营日 00:00 的绝对时刻。`dayOffset` 为负时回到更早的运营日。 */
export function businessDayStart(date = new Date(), dayOffset = 0): Date {
  const stamp = dayOffset === 0
    ? businessDateStamp(date)
    : shiftBusinessDate(businessDateStamp(date), dayOffset);
  return new Date(`${stamp}T00:00:00${BUSINESS_OFFSET}`);
}

export function businessMonthStart(date = new Date()): Date {
  const stamp = businessDateStamp(date);
  return new Date(`${stamp.slice(0, 7)}-01T00:00:00${BUSINESS_OFFSET}`);
}

/** 含当天在内、从早到晚的连续运营日。 */
export function businessTrendStamps(end: Date, days: number): string[] {
  const today = businessDateStamp(end);
  const stamps: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    stamps.push(offset === 0 ? today : shiftBusinessDate(today, -offset));
  }
  return stamps;
}
