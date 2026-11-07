import { Prisma, ProductVisibility } from "@prisma/client";
import {
  customerFacingReleaseWhere,
  isCommerceReleaseProfile,
} from "../../common/release/release-profile";

export type CustomerProductAccess = {
  accountType?: string | null;
  partnerStatus?: string | null;
} | null | undefined;

/** 后台商品工作列表与分类预览统一排除回收站和已删除记录。 */
export const staffWorkingProductWhere = {
  deletedAt: null,
  status: { not: "ARCHIVED" },
} satisfies Prisma.ProductWhereInput;

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

export function publicMediaAssetWhere(now: Date): Prisma.MediaAssetWhereInput {
  return {
    status: "READY",
    accessLevel: "PUBLIC",
    authorization: {
      is: {
        reviewStatus: "APPROVED",
        revocationStatus: "ACTIVE",
        publicWebUseAllowed: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        ],
      },
    },
  };
}

/** 公开媒体失效时按商品公开入口的同一规则收起整件作品。 */
export function withPublicMediaEligibility(
  base: Prisma.ProductWhereInput,
  now: Date = new Date(),
): Prisma.ProductWhereInput {
  const eligibleImage: Prisma.ProductImageWhereInput = { mediaAsset: { is: publicMediaAssetWhere(now) } };
  return {
    ...base,
    primaryImage: { is: eligibleImage },
    listingImage: { is: eligibleImage },
    images: { every: eligibleImage },
  };
}

/** 所有标准零售入口共享的发布状态与销售模式门禁。线索型档位下与直购条件互斥，查询恒为空。 */
export function directPurchaseProductBaseWhere(): Prisma.ProductWhereInput {
  return {
    deletedAt: null,
    status: "PUBLISHED",
    publicationQualityStatus: "READY",
    salesMode: "DIRECT_PURCHASE",
    ...(isCommerceReleaseProfile()
      ? {}
      : { NOT: { salesMode: "DIRECT_PURCHASE" as const } }),
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
