import assert from "node:assert/strict";
import test from "node:test";
import { SettingsService } from "./settings.service";

test("读取缺失的 SiteSettings 返回安全默认值且不写数据库", async () => {
  let upsertCalls = 0;
  const service = new SettingsService({
    siteSetting: {
      findUnique: async () => null,
      upsert: async () => {
        upsertCalls += 1;
        throw new Error("GET 不应写入 SiteSetting");
      },
    },
  } as any);

  const settings = await service.getSettings();

  assert.equal(settings.siteName, "海川珠宝");
  assert.equal(settings.siteDescription, "珠宝作品与顾问服务");
  assert.equal(settings.seoTitle, "海川珠宝");
  assert.equal(settings.seoDescription, "浏览珠宝作品，了解定制与顾问服务。");
  assert.equal(settings.contactPhone, "");
  assert.equal(upsertCalls, 0);
});

test("首次显式更新只执行一次 upsert 并合并安全默认值", async () => {
  const calls: any[] = [];
  const service = new SettingsService({
    siteSetting: {
      findUnique: async () => null,
      upsert: async (args: any) => {
        calls.push(args);
        return { value: args.create.value };
      },
    },
  } as any);

  const settings = await service.updateSettings({ contactPhone: "400-123-4567" }, 9);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].where.key, "site");
  assert.equal(calls[0].create.updatedBy, 9);
  assert.equal(calls[0].create.value.siteName, "海川珠宝");
  assert.equal(settings.contactPhone, "400-123-4567");
});
