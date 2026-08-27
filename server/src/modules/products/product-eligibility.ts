import { Prisma, ProductVisibility } from "@prisma/client";
import { customerFacingReleaseWhere } from "../../common/release/release-profile";

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
 * 客户侧可展示商品的共享门禁。公开列表、详情、推荐、收藏、页面引用与交易入口
 * 必须复用同一条件，避免 READY 隔离只在部分路径生效。
 */
export function customerFacingProductWhere(
  customer?: CustomerProductAccess,
): Prisma.ProductWhereInput {
  return customerFacingProductWhereForVisibilities(
    resolveCustomerProductVisibilities(customer),
  );
}

export function customerFacingProductWhereForVisibilities(
  visibilities: ProductVisibility[],
): Prisma.ProductWhereInput {
  return {
    deletedAt: null,
    status: "PUBLISHED",
    publicationQualityStatus: "READY",
    visibility: { in: visibilities },
    ...customerFacingReleaseWhere(),
  };
}

/** 所有标准零售入口共享的发布状态与销售模式门禁。 */
export function directPurchaseProductBaseWhere(): Prisma.ProductWhereInput {
  return {
    deletedAt: null,
    status: "PUBLISHED",
    publicationQualityStatus: "READY",
    salesMode: "DIRECT_PURCHASE",
    ...customerFacingReleaseWhere(),
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
