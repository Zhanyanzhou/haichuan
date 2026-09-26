import { ConflictException } from "@nestjs/common";

export type CheckoutShippingTemplate = {
  id: number;
  feeMode: "FREE" | "FIXED" | "CONDITIONAL";
  baseFee: unknown;
  remoteSurcharge: unknown;
  freeShippingThreshold: unknown;
  excludedRegions: unknown;
  isActive: boolean;
};

type ProductShippingFacts = {
  shippingTemplate?: CheckoutShippingTemplate | null;
};

function hasRegionRestrictions(value: unknown): boolean {
  if (value == null) return false;
  return Array.isArray(value) ? value.length > 0 : true;
}

function nonZeroOrInvalidMoney(value: unknown): boolean {
  const amount = Number(value);
  return !Number.isFinite(amount) || amount !== 0;
}

/**
 * 在线结算目前只能权威冻结 0 元运费。收费、满额、偏远附加和排除区域
 * 尚未形成可执行政策时必须失败关闭，不能把已有模板静默写成 0 元运费。
 */
export function assertZeroShippingCheckoutReady(
  products: readonly ProductShippingFacts[],
): void {
  const templates = new Map<number, CheckoutShippingTemplate>();
  for (const product of products) {
    // 生产查询始终显式选择 shippingTemplate；null 表示当前商品没有任何可冻结的
    // 配送计费事实。属性缺席只兼容不经过 Prisma select 的轻量旧测试桩。
    if ("shippingTemplate" in product && product.shippingTemplate == null) {
      throw new ConflictException(
        "当前订单的运费或配送区域尚未完成结算核算，请联系客服处理",
      );
    }
    if (product.shippingTemplate) {
      templates.set(product.shippingTemplate.id, product.shippingTemplate);
    }
  }

  for (const template of templates.values()) {
    const safeFreeTemplate = template.isActive === true
      && template.feeMode === "FREE"
      && !nonZeroOrInvalidMoney(template.baseFee)
      && !nonZeroOrInvalidMoney(template.remoteSurcharge)
      && template.freeShippingThreshold == null
      && !hasRegionRestrictions(template.excludedRegions);
    if (!safeFreeTemplate) {
      throw new ConflictException(
        "当前订单的运费或配送区域尚未完成结算核算，请联系客服处理",
      );
    }
  }
}
