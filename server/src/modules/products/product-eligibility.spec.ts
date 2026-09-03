import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
  customerFacingProductWhere,
  customerFacingProductWhereForVisibilities,
  directPurchaseProductBaseWhere,
  directPurchaseProductWhere,
  resolveCustomerProductVisibilities,
} from "./product-eligibility";

// customerFacingReleaseWhere 读取 process.env.RELEASE_PROFILE，测试内显式控制并恢复。
function withReleaseProfile<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env.RELEASE_PROFILE;
  if (value === undefined) {
    delete process.env.RELEASE_PROFILE;
  } else {
    process.env.RELEASE_PROFILE = value;
  }
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.RELEASE_PROFILE;
    } else {
      process.env.RELEASE_PROFILE = previous;
    }
  }
}

type SampleProduct = {
  status: string;
  publicationQualityStatus: string;
  visibility: string;
  deletedAt: Date | null;
  salesMode: string;
};

/**
 * 对真实函数产出的 Prisma where 条件做通用求值：求值器只解释条件本身。
 * 函数漏掉任何一类门禁都会让 should-accept 用例失败，
 * 多余或错误的条件会被 should-reject 用例捕获。
 */
function satisfies(where: Prisma.ProductWhereInput, product: SampleProduct): boolean {
  if ("deletedAt" in where && product.deletedAt !== where.deletedAt) return false;
  if ("status" in where && product.status !== where.status) return false;
  if (
    "publicationQualityStatus" in where &&
    product.publicationQualityStatus !== where.publicationQualityStatus
  ) {
    return false;
  }
  const visibility = where.visibility as { in?: string[] } | undefined;
  if (visibility?.in && !visibility.in.includes(product.visibility)) return false;
  const not = where.NOT as { salesMode?: string } | undefined;
  if (not?.salesMode !== undefined && product.salesMode === not.salesMode) return false;
  return true;
}

const READY_PUBLIC_CONSULTABLE: SampleProduct = {
  status: "PUBLISHED",
  publicationQualityStatus: "READY",
  visibility: "PUBLIC",
  deletedAt: null,
  salesMode: "CUSTOM_QUOTE",
};

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

test("账号类型与审核状态不同时满足时不得放宽可见范围", () => {
  assert.deepEqual(
    resolveCustomerProductVisibilities({ accountType: "PARTNER", partnerStatus: "PENDING" }),
    ["PUBLIC", "MEMBER"],
  );
  assert.deepEqual(
    resolveCustomerProductVisibilities({ accountType: "PARTNER", partnerStatus: null }),
    ["PUBLIC", "MEMBER"],
  );
  // partnerStatus 为 APPROVED 但账号类型不是 PARTNER 时不得放宽
  assert.deepEqual(
    resolveCustomerProductVisibilities({ accountType: "CUSTOMER", partnerStatus: "APPROVED" }),
    ["PUBLIC", "MEMBER"],
  );
});

test("commerce 发布档位不再排除直购商品", () => {
  const where = withReleaseProfile("commerce", () =>
    customerFacingProductWhereForVisibilities(["PUBLIC", "MEMBER"]),
  );
  assert.deepEqual(where, {
    deletedAt: null,
    status: "PUBLISHED",
    publicationQualityStatus: "READY",
    visibility: { in: ["PUBLIC", "MEMBER"] },
  });
});

test("游客可见面按真实 where 条件接受合规商品并拒绝七类违规样本", () => {
  const where = withReleaseProfile("lead-generation", () => customerFacingProductWhere(undefined));

  const cases: Array<{ name: string; product: SampleProduct; allowed: boolean }> = [
    { name: "public-ready", product: READY_PUBLIC_CONSULTABLE, allowed: true },
    {
      name: "quarantined",
      product: { ...READY_PUBLIC_CONSULTABLE, publicationQualityStatus: "QUARANTINED" },
      allowed: false,
    },
    {
      name: "draft",
      product: { ...READY_PUBLIC_CONSULTABLE, status: "DRAFT" },
      allowed: false,
    },
    {
      name: "member",
      product: { ...READY_PUBLIC_CONSULTABLE, visibility: "MEMBER" },
      allowed: false,
    },
    {
      name: "internal",
      product: { ...READY_PUBLIC_CONSULTABLE, visibility: "INTERNAL" },
      allowed: false,
    },
    {
      name: "deleted",
      product: { ...READY_PUBLIC_CONSULTABLE, deletedAt: new Date() },
      allowed: false,
    },
    {
      name: "direct-purchase-under-lead-generation",
      product: { ...READY_PUBLIC_CONSULTABLE, salesMode: "DIRECT_PURCHASE" },
      allowed: false,
    },
  ];

  for (const { name, product, allowed } of cases) {
    assert.equal(satisfies(where, product), allowed, `游客可见面判定错误：${name}`);
  }

  const commerceWhere = withReleaseProfile("commerce", () => customerFacingProductWhere(undefined));
  assert.equal(
    satisfies(commerceWhere, { ...READY_PUBLIC_CONSULTABLE, salesMode: "DIRECT_PURCHASE" }),
    true,
    "commerce 档位不应排除直购商品",
  );
});

test("直购门禁强制 DIRECT_PURCHASE 销售模式并按客户可见范围过滤", () => {
  const base = withReleaseProfile("commerce", () => directPurchaseProductBaseWhere());
  assert.deepEqual(base, {
    deletedAt: null,
    status: "PUBLISHED",
    publicationQualityStatus: "READY",
    salesMode: "DIRECT_PURCHASE",
  });

  const partnerWhere = withReleaseProfile("commerce", () =>
    directPurchaseProductWhere({ accountType: "PARTNER", partnerStatus: "APPROVED" }),
  );
  assert.deepEqual(partnerWhere, {
    ...base,
    visibility: { in: ["PUBLIC", "MEMBER", "PARTNER"] },
  });

  const guestWhere = withReleaseProfile("commerce", () => directPurchaseProductWhere(undefined));
  assert.deepEqual((guestWhere.visibility as { in: string[] }).in, ["PUBLIC"]);
});

test("lead-generation 档位下直购入口与发布画像条件组合后恒为空", () => {
  // 直购基础门禁在 lead-generation 下仍携带 NOT DIRECT_PURCHASE 画像条件，
  // 与 salesMode: DIRECT_PURCHASE 并存时查询恒为空：必须先切换 commerce 档位才可放出直购事实。
  const base = withReleaseProfile("lead-generation", () => directPurchaseProductBaseWhere());
  assert.deepEqual(base.NOT, { salesMode: "DIRECT_PURCHASE" });
  assert.equal(
    satisfies(base, { ...READY_PUBLIC_CONSULTABLE, salesMode: "DIRECT_PURCHASE" }),
    false,
  );
});
