import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  AnalyticsService,
  extractTrustedAnalyticsGeo,
} from "./analytics.service";

test("分析入库服务端开关默认关闭", async () => {
  const previous = process.env.ANALYTICS_INGESTION_ENABLED;
  delete process.env.ANALYTICS_INGESTION_ENABLED;
  let writes = 0;
  const service = new AnalyticsService({
    analyticsEvent: { create: async () => { writes += 1; } },
  } as never);
  try {
    const accepted = await service.track({
      consentGranted: true,
      consentVersion: "analytics-v1",
      eventName: "page_view",
    });
    assert.equal(accepted, false);
    assert.equal(writes, 0);
  } finally {
    if (previous === undefined) delete process.env.ANALYTICS_INGESTION_ENABLED;
    else process.env.ANALYTICS_INGESTION_ENABLED = previous;
  }
});

test("显式开启且携带同意版本时才接受白名单事件写入", async () => {
  const previous = process.env.ANALYTICS_INGESTION_ENABLED;
  const previousDataset = process.env.ANALYTICS_DATASET;
  const previousRetention = process.env.ANALYTICS_RETENTION_DAYS;
  process.env.ANALYTICS_INGESTION_ENABLED = "true";
  process.env.ANALYTICS_DATASET = "test";
  process.env.ANALYTICS_RETENTION_DAYS = "30";
  let writes = 0;
  let writtenData: Record<string, unknown> | undefined;
  const service = new AnalyticsService({
    analyticsEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes += 1;
        writtenData = data;
      },
    },
  } as never);
  try {
    const accepted = await service.track({
      consentGranted: true,
      consentVersion: "analytics-v1",
      eventName: "page_view",
      visitorId: "v_550e8400-e29b-41d4-a716-446655440000",
    }, {
      countryCode: "CN",
      region: "Guangdong",
      city: "Shenzhen",
    });
    assert.equal(accepted, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(writes, 1);
    assert.equal(writtenData?.dataset, "TEST");
    assert.match(String(writtenData?.visitorIdHash), /^[a-f0-9]{64}$/);
    assert.notEqual(
      writtenData?.visitorIdHash,
      "v_550e8400-e29b-41d4-a716-446655440000",
    );
    assert.equal(writtenData?.countryCode, "CN");
    assert.equal(writtenData?.region, "Guangdong");
    assert.equal(writtenData?.city, "Shenzhen");
    assert.ok(writtenData?.retentionExpiresAt instanceof Date);
  } finally {
    if (previous === undefined) delete process.env.ANALYTICS_INGESTION_ENABLED;
    else process.env.ANALYTICS_INGESTION_ENABLED = previous;
    if (previousDataset === undefined) delete process.env.ANALYTICS_DATASET;
    else process.env.ANALYTICS_DATASET = previousDataset;
    if (previousRetention === undefined) delete process.env.ANALYTICS_RETENTION_DAYS;
    else process.env.ANALYTICS_RETENTION_DAYS = previousRetention;
  }
});

test("地域只读取显式信任的 Cloudflare 头，并过滤未知国家代码", () => {
  const previous = process.env.ANALYTICS_TRUSTED_GEO_HEADERS;
  try {
    delete process.env.ANALYTICS_TRUSTED_GEO_HEADERS;
    assert.deepEqual(
      extractTrustedAnalyticsGeo({
        "cf-ipcountry": "CN",
        "cf-region": "Guangdong",
        "cf-ipcity": "Shenzhen",
      }),
      { countryCode: null, region: null, city: null },
    );

    process.env.ANALYTICS_TRUSTED_GEO_HEADERS = "true";
    assert.deepEqual(
      extractTrustedAnalyticsGeo({
        "cf-ipcountry": "cn",
        "cf-region": "Guangdong",
        "cf-ipcity": "Shenzhen",
      }),
      { countryCode: "CN", region: "Guangdong", city: "Shenzhen" },
    );
    assert.equal(
      extractTrustedAnalyticsGeo({ "cf-ipcountry": "XX" }).countryCode,
      null,
    );
  } finally {
    if (previous === undefined) delete process.env.ANALYTICS_TRUSTED_GEO_HEADERS;
    else process.env.ANALYTICS_TRUSTED_GEO_HEADERS = previous;
  }
});

test("访问概览按数据集聚合 PV、UV、会话、回访和维度", async () => {
  const previousDataset = process.env.ANALYTICS_DATASET;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.ANALYTICS_DATASET = "test";
  process.env.NODE_ENV = "test";
  let queryIndex = 0;
  const queryResults = [
    [{ pageViews: 9n, visitors: 3n, sessions: 4n }],
    [{ visitors: 3n, returningVisitors: 1n }],
    [{ date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }), pageViews: 9n, visitors: 3n, sessions: 4n }],
    [{ pagePath: "/", pageViews: 7n, visitors: 3n }],
    [{ deviceType: "mobile", pageViews: 9n, visitors: 3n }],
    [{ source: "direct", pageViews: 9n, visitors: 3n }],
    [{ countryCode: "CN", region: "Guangdong", city: "Shenzhen", pageViews: 9n, visitors: 3n }],
  ];
  const service = new AnalyticsService({
    $queryRaw: async () => queryResults[queryIndex++] ?? [],
  } as never);

  try {
    const result = await service.getOverview(7);
    assert.deepEqual(result.totals, {
      pageViews: 9,
      visitors: 3,
      sessions: 4,
      newVisitors: 2,
      returningVisitors: 1,
      returnRate: 33.33,
      pagesPerSession: 2.25,
    });
    assert.equal(result.topPages[0]?.pagePath, "/");
    assert.equal(result.devices[0]?.deviceType, "mobile");
    assert.equal(result.sources[0]?.source, "direct");
    assert.equal(result.regions[0]?.city, "Shenzhen");
    assert.equal(result.trend.length, 7);
  } finally {
    if (previousDataset === undefined) delete process.env.ANALYTICS_DATASET;
    else process.env.ANALYTICS_DATASET = previousDataset;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("错误同意版本不会写入，查询按当前数据集隔离", async () => {
  const previousIngestion = process.env.ANALYTICS_INGESTION_ENABLED;
  const previousDataset = process.env.ANALYTICS_DATASET;
  process.env.ANALYTICS_INGESTION_ENABLED = "true";
  process.env.ANALYTICS_DATASET = "test";
  let writes = 0;
  let queryWhere: Record<string, unknown> | undefined;
  const service = new AnalyticsService({
    analyticsEvent: {
      create: async () => {
        writes += 1;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        queryWhere = where;
        return [];
      },
      count: async () => 0,
    },
    $transaction: async (queries: Array<Promise<unknown>>) => Promise.all(queries),
  } as never);
  try {
    const accepted = await service.track({
      consentGranted: true,
      consentVersion: "stale-version",
      eventName: "page_view",
    });
    assert.equal(accepted, false);
    assert.equal(writes, 0);
    await service.getEvents({ page: 1, pageSize: 20 });
    assert.equal(queryWhere?.dataset, "TEST");
  } finally {
    if (previousIngestion === undefined) delete process.env.ANALYTICS_INGESTION_ENABLED;
    else process.env.ANALYTICS_INGESTION_ENABLED = previousIngestion;
    if (previousDataset === undefined) delete process.env.ANALYTICS_DATASET;
    else process.env.ANALYTICS_DATASET = previousDataset;
  }
});

test("保留任务默认关闭，开启后只清理当前数据集的到期事件", async () => {
  const previousEnabled = process.env.ANALYTICS_RETENTION_ENABLED;
  const previousDataset = process.env.ANALYTICS_DATASET;
  process.env.ANALYTICS_DATASET = "test";
  let deleteWhere: Record<string, unknown> | undefined;
  const service = new AnalyticsService({
    analyticsEvent: {
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        deleteWhere = where;
        return { count: 3 };
      },
    },
  } as never);
  try {
    delete process.env.ANALYTICS_RETENTION_ENABLED;
    assert.equal(await service.purgeExpiredEvents(), 0);
    process.env.ANALYTICS_RETENTION_ENABLED = "true";
    assert.equal(await service.purgeExpiredEvents(), 3);
    assert.equal(deleteWhere?.dataset, "TEST");
    assert.ok(
      (deleteWhere?.retentionExpiresAt as { lte?: unknown } | undefined)?.lte instanceof Date,
    );
  } finally {
    if (previousEnabled === undefined) delete process.env.ANALYTICS_RETENTION_ENABLED;
    else process.env.ANALYTICS_RETENTION_ENABLED = previousEnabled;
    if (previousDataset === undefined) delete process.env.ANALYTICS_DATASET;
    else process.env.ANALYTICS_DATASET = previousDataset;
  }
});
