import assert from "node:assert/strict";
import test from "node:test";
import { StatisticsService } from "./statistics.service";

function withAnalyticsEnvironment(
  nodeEnv: string | undefined,
  dataset: string | undefined,
  run: () => Promise<void>,
) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDataset = process.env.ANALYTICS_DATASET;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  if (dataset === undefined) delete process.env.ANALYTICS_DATASET;
  else process.env.ANALYTICS_DATASET = dataset;

  return run().finally(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousDataset === undefined) delete process.env.ANALYTICS_DATASET;
    else process.env.ANALYTICS_DATASET = previousDataset;
  });
}

test("经营趋势：pageViews 只查询生产环境配置的 dataset", async () => {
  await withAnalyticsEnvironment("production", "production", async () => {
    let queryStrings: readonly string[] | undefined;
    let queryValues: readonly unknown[] | undefined;
    const prisma = {
      $queryRaw: async (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        queryStrings = strings;
        queryValues = values;
        return [];
      },
    };
    const service = new StatisticsService(prisma as never);

    const result = await service.getTrend(1, "pageViews");

    assert.ok(queryStrings);
    assert.ok(queryValues);
    assert.match(queryStrings.join("?"), /dataset = \?/);
    assert.ok(queryValues.includes("PRODUCTION"));
    assert.equal(result.length, 1);
    assert.equal(result[0]?.count, 0);
  });
});

test("经营趋势：生产环境 dataset 配置不安全时拒绝查询分析表", async () => {
  await withAnalyticsEnvironment("production", "test", async () => {
    let queryCount = 0;
    const prisma = {
      $queryRaw: async () => {
        queryCount += 1;
        return [];
      },
    };
    const service = new StatisticsService(prisma as never);

    const result = await service.getTrend(2, "pageViews");

    assert.equal(queryCount, 0);
    assert.deepEqual(result.map((item) => item.count), [0, 0]);
  });
});
