import assert from "node:assert/strict";
import test from "node:test";
import {
  customerFacingProductWhere,
  directPurchaseProductWhere,
  resolveCustomerProductVisibilities,
} from "./product-eligibility";

test("第一阶段客户商品门禁保留实时可见范围且不强制质量状态", () => {
  assert.deepEqual(resolveCustomerProductVisibilities(undefined), ["PUBLIC"]);
  assert.deepEqual(resolveCustomerProductVisibilities({ accountType: "MEMBER" }), [
    "PUBLIC",
    "MEMBER",
  ]);
  assert.deepEqual(
    resolveCustomerProductVisibilities({
      accountType: "PARTNER",
      partnerStatus: "APPROVED",
    }),
    ["PUBLIC", "MEMBER", "PARTNER"],
  );
  assert.deepEqual(
    customerFacingProductWhere({
      accountType: "PARTNER",
      partnerStatus: "SUSPENDED",
    }),
    {
      deletedAt: null,
      status: "PUBLISHED",
      visibility: { in: ["PUBLIC", "MEMBER"] },
    },
  );
  const directPurchaseWhere = directPurchaseProductWhere(undefined);
  assert.equal(directPurchaseWhere.salesMode, "DIRECT_PURCHASE");
  assert.equal("publicationQualityStatus" in directPurchaseWhere, false);
});
