import { Prisma, ProductVisibility } from "@prisma/client";

export type CustomerProductAccess = {
  accountType?: string | null;
  partnerStatus?: string | null;
} | null | undefined;

/**
 * 客户可见范围的唯一业务判断：普通客户可见 PUBLIC/MEMBER，
 * 只有审核通过的合作客户额外可见 PARTNER；游客仅可见 PUBLIC。
 */
export function resolveCustomerProductVisibilities(
  customer?: CustomerProductAccess,
): ProductVisibility[] {
  if (!customer) return ["PUBLIC"];
  const isApprovedPartner =
    customer.accountType === "PARTNER" &&
    customer.partnerStatus === "APPROVED";
  return isApprovedPartner
    ? ["PUBLIC", "MEMBER", "PARTNER"]
    : ["PUBLIC", "MEMBER"];
}

/**
 * 客户侧可展示商品的共享门禁，供目录与推荐复用。
 * 第一阶段仅记录发布质量状态，不用它隐藏迁移前已发布商品。
 */
export function customerFacingProductWhere(
  customer?: CustomerProductAccess,
): Prisma.ProductWhereInput {
  return {
    deletedAt: null,
    status: "PUBLISHED",
    visibility: { in: resolveCustomerProductVisibilities(customer) },
  };
}

/** 所有标准零售入口共享的发布状态与销售模式门禁。 */
export function directPurchaseProductBaseWhere(): Prisma.ProductWhereInput {
  return {
    deletedAt: null,
    status: "PUBLISHED",
    salesMode: "DIRECT_PURCHASE",
  };
}

/** 标准零售可交易商品的共享门禁。 */
export function directPurchaseProductWhere(
  customer?: CustomerProductAccess,
): Prisma.ProductWhereInput {
  return {
    ...directPurchaseProductBaseWhere(),
    visibility: { in: resolveCustomerProductVisibilities(customer) },
  };
}
