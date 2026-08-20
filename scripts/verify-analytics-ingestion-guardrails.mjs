import assert from "node:assert/strict";

const { AnalyticsService } = await import(
  "../server/dist/modules/analytics/analytics.service.js"
);

let savedEvent;
const service = new AnalyticsService({
  analyticsEvent: {
    create({ data }) {
      savedEvent = data;
      return Promise.resolve(data);
    },
  },
});

await service.track({
  eventName: "filter",
  metadata: {
    filterType: "material",
    value: "GOLD_999",
    phone: "13800138000",
    nested: { unexpected: true },
  },
});
assert.deepEqual(savedEvent.metadata, {
  filterType: "material",
  value: "GOLD_999",
});
assert.equal(savedEvent.customerId, null);

await service.track({ eventName: "page_view", metadata: { arbitrary: "ignored" } });
assert.equal(savedEvent.metadata, undefined);

console.log("analytics ingestion guardrail verification passed");
