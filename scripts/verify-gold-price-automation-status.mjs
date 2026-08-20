import assert from "node:assert/strict";

const { GoldPriceService } = await import(
  "../server/dist/modules/gold-price/gold-price.service.js"
);

const originalValue = process.env.GOLD_PRICE_API_URL;
const service = new GoldPriceService({}, {});

try {
  delete process.env.GOLD_PRICE_API_URL;
  assert.deepEqual(service.getAutomationStatus(), { autoFetchConfigured: false });

  process.env.GOLD_PRICE_API_URL = "https://example.test/gold-price";
  assert.deepEqual(service.getAutomationStatus(), { autoFetchConfigured: true });
} finally {
  if (originalValue === undefined) delete process.env.GOLD_PRICE_API_URL;
  else process.env.GOLD_PRICE_API_URL = originalValue;
}

console.log("gold price automation status verification passed");
