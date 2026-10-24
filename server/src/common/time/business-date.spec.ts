import assert from "node:assert/strict";
import test from "node:test";
import {
  businessDateKey,
  businessDateStamp,
  businessDayStart,
  businessHourParts,
  businessMonthStart,
  businessSamePeriod,
  businessTrendStamps,
} from "./business-date";

test("交易编号日期按 Asia/Shanghai 运营日生成", () => {
  assert.equal(businessDateKey(new Date("2026-08-24T18:55:40.000Z")), "20260825");
  assert.equal(businessDateKey(new Date("2026-08-24T15:59:59.000Z")), "20260824");
  assert.equal(businessDateKey(new Date("2026-08-24T16:00:00.000Z")), "20260825");
});

test("经营统计日界固定为中国运营日，不跟随服务器本地时区", () => {
  // 2026-10-23 14:19 北京时间。公网容器若按 UTC 取本地零点，会把当天前 8 小时算进昨日。
  const afternoon = new Date("2026-10-23T06:19:00.000Z");
  assert.equal(businessDateStamp(afternoon), "2026-10-23");
  assert.equal(businessDayStart(afternoon).toISOString(), "2026-10-22T16:00:00.000Z");
  assert.equal(businessDayStart(afternoon, -1).toISOString(), "2026-10-21T16:00:00.000Z");
  assert.equal(businessMonthStart(afternoon).toISOString(), "2026-09-30T16:00:00.000Z");
  assert.equal(businessDateStamp(new Date("2026-10-22T16:00:00.000Z")), "2026-10-23");
  assert.equal(businessDateStamp(new Date("2026-10-22T15:59:59.000Z")), "2026-10-22");
  assert.deepEqual(businessTrendStamps(afternoon, 7), [
    "2026-10-17",
    "2026-10-18",
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-22",
    "2026-10-23",
  ]);
  assert.deepEqual(businessHourParts(afternoon), { stamp: "2026-10-23", hour: 14 });
  assert.deepEqual(businessHourParts(new Date("2026-10-22T16:00:00.000Z")), {
    stamp: "2026-10-23",
    hour: 0,
  });
  const period = businessSamePeriod(afternoon);
  assert.equal(period.todayStart.toISOString(), "2026-10-22T16:00:00.000Z");
  assert.equal(period.yesterdayStart.toISOString(), "2026-10-21T16:00:00.000Z");
  assert.equal(period.yesterdayEnd.toISOString(), "2026-10-22T06:19:00.000Z");
  assert.equal(period.hour, 14);
});
