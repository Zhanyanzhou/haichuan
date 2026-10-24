import assert from "node:assert/strict";
import test from "node:test";
import { businessTrendStamps } from "../../common/time/business-date";
import { StatisticsService } from "./statistics.service";

const staffActor = { id: 29 };

test("经营趋势：浏览量读取无身份的小时累计，启用前的日期标为未计数", async () => {
  const previousTraffic = process.env.STOREFRONT_TRAFFIC_ENABLED;
  delete process.env.STOREFRONT_TRAFFIC_ENABLED;
  try {
    const queries: string[] = [];
    const prisma: any = {
      $queryRaw: async (
        query: TemplateStringsArray | { sql?: string },
        ...values: unknown[]
      ) => {
        const sql = (query as { sql?: string }).sql
          ?? (query as TemplateStringsArray).join("?");
        if (sql.includes("FROM users")) return [{ id: staffActor.id }];
        queries.push(`${sql} ${values.map(String).join(" ")}`);
        return [];
      },
    };
    prisma.$transaction = async (operation: (transaction: any) => Promise<unknown>) => (
      operation(prisma)
    );
    const service = new StatisticsService(prisma);
    const result = await service.getTrend(1, "pageViews", staffActor);
    assert.match(queries.join("\n"), /storefront_traffic_hourly/);
    assert.equal(queries.some((query) => query.includes("analytics_events")), false);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.count, 0);
    assert.equal(result[0]?.counted, false);
    assert.deepEqual(
      result.map((item) => item.date),
      businessTrendStamps(new Date(), 1),
    );
  } finally {
    if (previousTraffic === undefined) delete process.env.STOREFRONT_TRAFFIC_ENABLED;
    else process.env.STOREFRONT_TRAFFIC_ENABLED = previousTraffic;
  }
});

test("店内访问计数关闭时，浏览趋势不查询累计表", async () => {
  const previousTraffic = process.env.STOREFRONT_TRAFFIC_ENABLED;
  process.env.STOREFRONT_TRAFFIC_ENABLED = "false";
  try {
    let queryCount = 0;
    const prisma: any = {
      $queryRaw: async (query: { sql?: string }) => {
        if (query.sql?.includes("FROM users")) return [{ id: staffActor.id }];
        queryCount += 1;
        return [];
      },
    };
    prisma.$transaction = async (operation: (transaction: any) => Promise<unknown>) => (
      operation(prisma)
    );
    const service = new StatisticsService(prisma);
    const result = await service.getTrend(2, "visitors", staffActor);
    assert.equal(queryCount, 0);
    assert.deepEqual(result.map((item) => item.count), [0, 0]);
    assert.deepEqual(result.map((item) => item.counted), [false, false]);
  } finally {
    if (previousTraffic === undefined) delete process.env.STOREFRONT_TRAFFIC_ENABLED;
    else process.env.STOREFRONT_TRAFFIC_ENABLED = previousTraffic;
  }
});

function dashboardPrisma() {
  const model = () => ({
    count: async () => 0,
    aggregate: async () => ({ _sum: { finalAmount: 0 } }),
  });
  const prisma: any = {
    product: model(),
    order: model(),
    customer: model(),
    inventory: model(),
    analyticsEvent: model(),
    inquiry: model(),
    selectionInquiry: model(),
    lead: model(),
    outboxEvent: model(),
    $queryRaw: async (query: { sql?: string }) => (
      query.sql?.includes("FROM users") ? [{ id: staffActor.id }] : []
    ),
  };
  prisma.$transaction = async (operation: (transaction: any) => Promise<unknown>) => (
    operation(prisma)
  );
  return prisma;
}

test("今日经营在店内访问计数关闭时标明未采集", async () => {
  const previousTraffic = process.env.STOREFRONT_TRAFFIC_ENABLED;
  process.env.STOREFRONT_TRAFFIC_ENABLED = "false";
  try {
    const service = new StatisticsService(dashboardPrisma());
    const dashboard = await service.getDashboard(staffActor);
    assert.equal(dashboard.pageViewsToday, 0);
    assert.equal(dashboard.visitorsToday, 0);
    assert.deepEqual(dashboard.storefrontTraffic, {
      enabled: false,
      earliestDate: null,
    });
  } finally {
    if (previousTraffic === undefined) delete process.env.STOREFRONT_TRAFFIC_ENABLED;
    else process.env.STOREFRONT_TRAFFIC_ENABLED = previousTraffic;
  }
});

test("店内访问计数只累计正式页面，员工访问和非法路径不写库", async () => {
  const previousTraffic = process.env.STOREFRONT_TRAFFIC_ENABLED;
  delete process.env.STOREFRONT_TRAFFIC_ENABLED;
  const writes: string[] = [];
  const prisma: any = {
    $executeRaw: async (query: TemplateStringsArray) => {
      writes.push(query.join("?"));
      return 1;
    },
  };
  const service = new StatisticsService(prisma);
  try {
    assert.deepEqual(
      await service.recordStorefrontTraffic({ pagePath: "/catalog", visitor: true }, ""),
      { accepted: true },
    );
    assert.deepEqual(
      await service.recordStorefrontTraffic(
        { pagePath: "/en/about", visitor: false },
        "hc_admin_access=staff",
      ),
      { accepted: false },
    );
    assert.deepEqual(
      await service.recordStorefrontTraffic({ pagePath: "/admin/dashboard", visitor: true }, ""),
      { accepted: false },
    );
    assert.equal(writes.length, 1);
    assert.match(writes[0], /storefront_traffic_hourly/);
  } finally {
    if (previousTraffic === undefined) delete process.env.STOREFRONT_TRAFFIC_ENABLED;
    else process.env.STOREFRONT_TRAFFIC_ENABLED = previousTraffic;
  }
});
