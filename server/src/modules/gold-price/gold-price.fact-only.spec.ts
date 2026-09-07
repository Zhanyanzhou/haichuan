import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { GoldPriceService } from "./gold-price.service";

type GoldPriceServiceInternals = {
  fetchAndUpdateGoldPrice(source: string): Promise<void>;
  extractPrice(data: unknown): number | null;
};

const accessInternals = (service: GoldPriceService) =>
  service as unknown as GoldPriceServiceInternals;

test("手动金价写入只创建金价记录且不读取或改写商品价格", async () => {
  let goldPriceWrites = 0;
  let productPriceCalls = 0;
  const prisma = {
    goldPrice: {
      create: async (args: { data: { price: number } }) => {
        goldPriceWrites += 1;
        return {
          price: args.data.price,
          source: "MANUAL",
          recordDate: new Date("2026-08-23T00:00:00Z"),
        };
      },
    },
    product: {
      findMany: async () => {
        productPriceCalls += 1;
        return [];
      },
    },
  };
  const service = new GoldPriceService(
    prisma as unknown as PrismaService,
    {} as ProductsService,
  );

  const result = await service.updateManually({ price: 888, operatorId: 1 });

  assert.equal(result.price, 888);
  assert.equal(goldPriceWrites, 1);
  assert.equal(productPriceCalls, 0);
});

test("自动金价采集只写金价事实且不改写 SKU 或 Product 价格", async () => {
  let goldPriceWrites = 0;
  let productPriceCalls = 0;
  const prisma = {
    goldPrice: {
      create: async () => {
        goldPriceWrites += 1;
      },
    },
    product: {
      findMany: async () => {
        productPriceCalls += 1;
        return [];
      },
    },
  };
  const service = new GoldPriceService(
    prisma as unknown as PrismaService,
    {} as ProductsService,
  );
  const originalFetch = globalThis.fetch;
  process.env.GOLD_PRICE_API_URL = "https://example.test/gold";
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({ price: 888 }),
    }) as Response;

  try {
    await accessInternals(service).fetchAndUpdateGoldPrice("TEST");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GOLD_PRICE_API_URL;
  }

  assert.equal(goldPriceWrites, 1);
  assert.equal(productPriceCalls, 0);
});

test("行情响应只从受支持的直接、嵌套或数组价格字段提取正数", () => {
  const service = new GoldPriceService(
    {} as PrismaService,
    {} as ProductsService,
  );
  const internals = accessInternals(service);

  assert.equal(internals.extractPrice({ data: { latestPrice: "886.50" } }), 886.5);
  assert.equal(internals.extractPrice([{ ignored: 1 }, { Au9999: 887 }]), 887);
  assert.equal(internals.extractPrice({ data: { price: "invalid" } }), null);
  assert.equal(internals.extractPrice(null), null);
});

test("自动化状态只在配置行情地址后开启", () => {
  const original = process.env.GOLD_PRICE_API_URL;
  const service = new GoldPriceService(
    {} as PrismaService,
    {} as ProductsService,
  );
  try {
    delete process.env.GOLD_PRICE_API_URL;
    assert.deepEqual(service.getAutomationStatus(), {
      autoFetchConfigured: false,
    });
    process.env.GOLD_PRICE_API_URL = "https://example.test/gold-price";
    assert.deepEqual(service.getAutomationStatus(), {
      autoFetchConfigured: true,
    });
  } finally {
    if (original === undefined) delete process.env.GOLD_PRICE_API_URL;
    else process.env.GOLD_PRICE_API_URL = original;
  }
});
