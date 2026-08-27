import assert from "node:assert/strict";
import test from "node:test";
import {
  customerFacingProductWhere,
  directPurchaseProductWhere,
  resolveCustomerProductVisibilities,
} from "./product-eligibility";

test("客户商品门禁统一要求 READY、实时可见范围与发布档位", () => {
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
      publicationQualityStatus: "READY",
      visibility: { in: ["PUBLIC", "MEMBER"] },
      NOT: { salesMode: "DIRECT_PURCHASE" },
    },
  );
  const previousProfile = process.env.RELEASE_PROFILE;
  try {
    process.env.RELEASE_PROFILE = "commerce";
    const directPurchaseWhere = directPurchaseProductWhere(undefined);
    assert.equal(directPurchaseWhere.salesMode, "DIRECT_PURCHASE");
    assert.equal(directPurchaseWhere.publicationQualityStatus, "READY");
  } finally {
    if (previousProfile === undefined) delete process.env.RELEASE_PROFILE;
    else process.env.RELEASE_PROFILE = previousProfile;
  }
});
