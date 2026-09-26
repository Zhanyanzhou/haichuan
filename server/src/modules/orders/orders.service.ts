import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  OrderStatus,
  OrderType,
  DeliveryStatus,
  CustomStage,
  PaymentStatus,
  QuoteChannel,
  Coupon,
  Prisma,
} from "@prisma/client";
import { createHash, randomUUID } from "crypto";
import { Cron, CronExpression } from "@nestjs/schedule";
import { TradeEventsService } from "../trade-events/trade-events.service";
import { MailerService } from "../../common/mailer/mailer.service";
import { LogisticsTrackingService } from "../../common/logistics-tracking/logistics-tracking.service";
import { evaluateCoupon } from "../../common/marketing/coupon-calculation";
import {
  OPERATOR_TYPE,
  TRADE_ENTITY_TYPE,
  TRADE_EVENT_TYPE,
  type OperatorContext,
} from "../trade-events/trade-events.constants";
import {
  directPurchaseProductBaseWhere,
  directPurchaseProductWhere,
  type CustomerProductAccess,
} from "../products/product-eligibility";
import { businessDateKey } from "../../common/time/business-date";
import { runWithDocumentNumberRetry } from "../../common/trade/document-number-retry";
import { ReliableNotificationIntentService } from "../../common/notifications/reliable-notification-intent.service";
import { FulfillmentService } from "../fulfillment/fulfillment.service";
import { hashBusinessSnapshot } from "../quotations/quotation-snapshot";
import { resolveInstallmentPaymentType } from "../payments/payment-plan-installment-type";
import {
  resolveCustomerPaymentProof,
  storedCustomerPaymentProofExists,
} from "../payment-proofs/payment-proof-storage";
import {
  MAX_ACTIVE_PENDING_PROOF_ORDERS_PER_CUSTOMER,
  MAX_ATTACHED_PAYMENT_PROOF_BYTES_PER_CUSTOMER,
  MAX_ATTACHED_PAYMENT_PROOFS_PER_CUSTOMER,
  MAX_ATTACHED_PAYMENT_PROOFS_PER_ORDER,
} from "../payment-proofs/payment-proof-policy";
import type { CustomerPrincipal, StaffPrincipal } from "../../common/security/authenticated-principal";
import {
  lockAuthorizedStaffForPayment,
  type StaffPaymentAuthorization,
} from "../../common/security/staff-payment-authorization";
import {
  lockAuthorizedStaffForOrder,
  type StaffOrderActor,
} from "../../common/security/staff-order-authorization";
import {
  lockActiveCustomerForRead,
  lockActiveCustomerForWrite,
} from "../customers/customer-write-gate";
import { parseIdempotencyKey } from "../../common/idempotency/idempotency-key";
import { assertZeroShippingCheckoutReady } from "./shipping-pricing-boundary";
import { findDeliveryBlockingDisputes } from "../../common/trade/delivery-blocking-disputes";

/** 订单状态机：定义合法状态转换（导出供行为级测试消费） */
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PENDING_SHIP", "CANCELLED"],
  PENDING_SHIP: ["SHIPPED"],
  SHIPPED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

const OFFLINE_PAYMENT_RESERVATION_MS = 24 * 60 * 60 * 1000;
const CONFIRMED_PAYMENT_STATUSES = ["PAID", "PARTIAL_REFUND", "REFUNDED"] as const;
const MANUAL_RECEIPT_METHODS = ["bank_transfer", "store"] as const;
const ONLINE_PAYMENT_METHODS = ["alipay", "wechat"] as const;
const MANUAL_RECEIPT_IDEMPOTENCY_SOURCE = "MANUAL_RECEIPT";
const CUSTOMER_VISIBLE_EVENT_TYPES: ReadonlySet<string> = new Set([
  TRADE_EVENT_TYPE.ORDER_CREATED,
  TRADE_EVENT_TYPE.ORDER_CANCELLED,
  TRADE_EVENT_TYPE.ORDER_COMPLETED,
  TRADE_EVENT_TYPE.ORDER_CUSTOM_STAGE_CHANGED,
  TRADE_EVENT_TYPE.PAYMENT_APPROVED,
  TRADE_EVENT_TYPE.FULFILLMENT_CREATED,
  TRADE_EVENT_TYPE.SHIPMENT_DISPATCHED,
  TRADE_EVENT_TYPE.FULFMENT_DELIVERED,
  TRADE_EVENT_TYPE.FULFILLMENT_ABNORMAL,
  TRADE_EVENT_TYPE.AFTER_SALES_REQUESTED,
  TRADE_EVENT_TYPE.AFTER_SALES_APPROVED,
  TRADE_EVENT_TYPE.AFTER_SALES_REJECTED,
  TRADE_EVENT_TYPE.AFTER_SALES_STATUS_CHANGED,
  TRADE_EVENT_TYPE.REFUND_REQUESTED,
  TRADE_EVENT_TYPE.REFUND_APPROVED,
  TRADE_EVENT_TYPE.REFUND_REJECTED,
  TRADE_EVENT_TYPE.REFUND_PROCESSING,
  TRADE_EVENT_TYPE.REFUND_ATTENTION,
  TRADE_EVENT_TYPE.REFUND_COMPLETED,
  TRADE_EVENT_TYPE.REFUND_EXECUTE_FAILED,
]);

function usesTradeResourceReservations(channel: QuoteChannel | null | undefined) {
  return channel === 'CUSTOM' || channel === 'PARTNER_WAX';
}

function hasSameCouponEconomicTerms(left: Coupon, right: Coupon): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.type === right.type &&
    Number(left.value) === Number(right.value) &&
    Number(left.minAmount) === Number(right.minAmount) &&
    left.totalCount === right.totalCount &&
    left.startTime.getTime() === right.startTime.getTime() &&
    left.endTime.getTime() === right.endTime.getTime() &&
    left.isActive === right.isActive
  );
}

/** 订单列表查询参数（服务端分页 + 多维筛选） */
export interface OrderListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
  /** 商品名/货号筛选 */
  productKeyword?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: number | string;
  maxAmount?: number | string;
  customerId?: number;
  /** 交易中心多维筛选 */
  orderType?: string;
  deliveryStatus?: string;
  salesConsultantId?: number;
  source?: string;
  /** 支付状态派生筛选：UNPAID（未收款）/ PARTIAL（部分收款）/ PAID（已收齐） */
  paymentStatus?: string;
}

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  private storedPaymentProofExists(customerId: number, storageKey: string) {
    return storedCustomerPaymentProofExists(customerId, storageKey);
  }

  private async claimPaymentProofAsset(
    tx: Prisma.TransactionClient,
    customerId: number,
    orderId: number,
    assetId: number,
    storageKey: string,
  ) {
    const asset = await tx.paymentProofAsset.findUniqueOrThrow({
      where: { id: assetId },
      select: {
        id: true,
        storageKey: true,
        customerId: true,
        orderId: true,
        paymentId: true,
        submissionOrderId: true,
        fileSize: true,
        status: true,
      },
    });
    if (
      asset.storageKey !== storageKey
      || asset.customerId !== customerId
      || asset.submissionOrderId !== orderId
    ) {
      throw new ConflictException("付款凭证归属不一致，请重新上传");
    }
    if (asset.status === "ATTACHED" && asset.orderId === orderId) {
      if (asset.paymentId === null) {
        throw new ConflictException("付款凭证缺少原付款关联，请联系人工核对");
      }
      return { assetId: asset.id, paymentId: asset.paymentId, replayed: true as const };
    }

    if (!asset.fileSize || asset.fileSize <= 0) {
      throw new ConflictException("付款凭证缺少可核验的文件大小，请联系人工核对");
    }

    const customerAttachedCount = await tx.paymentProofAsset.count({
      where: { customerId, status: "ATTACHED" },
    });
    if (customerAttachedCount >= MAX_ATTACHED_PAYMENT_PROOFS_PER_CUSTOMER) {
      throw new ConflictException(
        `该客户已保留 ${MAX_ATTACHED_PAYMENT_PROOFS_PER_CUSTOMER} 张付款凭证，请先联系人工核对`,
      );
    }

    const customerAttachedBytes = await tx.paymentProofAsset.aggregate({
      where: { customerId, status: "ATTACHED" },
      _sum: { fileSize: true },
    });
    const attachedBytes = customerAttachedBytes._sum.fileSize ?? 0;
    if (attachedBytes + asset.fileSize > MAX_ATTACHED_PAYMENT_PROOF_BYTES_PER_CUSTOMER) {
      throw new ConflictException("该客户付款凭证累计大小已达到 240 MiB，请先联系人工核对");
    }

    const activePendingProofOrderCount = await tx.order.count({
      where: {
        customerId,
        id: { not: orderId },
        status: "PENDING_PAYMENT",
        payments: {
          some: {
            status: "PENDING",
            method: "bank_transfer",
            proofUrl: { not: null },
          },
        },
        paymentProofAssets: { some: { status: "ATTACHED" } },
      },
    });
    if (activePendingProofOrderCount >= MAX_ACTIVE_PENDING_PROOF_ORDERS_PER_CUSTOMER) {
      throw new ConflictException(
        `该客户已有 ${MAX_ACTIVE_PENDING_PROOF_ORDERS_PER_CUSTOMER} 笔活跃待审凭证订单，请先完成审核`,
      );
    }

    const attachedCount = await tx.paymentProofAsset.count({
      where: { orderId, status: "ATTACHED" },
    });
    if (attachedCount >= MAX_ATTACHED_PAYMENT_PROOFS_PER_ORDER) {
      throw new ConflictException(
        `该订单已保留 ${MAX_ATTACHED_PAYMENT_PROOFS_PER_ORDER} 张付款凭证，请先联系人工核对`,
      );
    }

    const attachedAt = new Date();
    const claimed = await tx.paymentProofAsset.updateMany({
      where: {
        id: asset.id,
        customerId,
        status: "UPLOADED",
        orderId: null,
      },
      data: { status: "ATTACHED", orderId, attachedAt, deletingAt: null },
    });
    if (claimed.count === 1) {
      return { assetId: asset.id, paymentId: null, replayed: false as const };
    }

    const current = await tx.paymentProofAsset.findUnique({
      where: { id: asset.id },
      select: { customerId: true, orderId: true, paymentId: true, status: true },
    });
    if (current?.customerId === customerId && current.status === "ATTACHED" && current.orderId === orderId) {
      if (current.paymentId === null) {
        throw new ConflictException("付款凭证缺少原付款关联，请联系人工核对");
      }
      return { assetId: asset.id, paymentId: current.paymentId, replayed: true as const };
    }
    throw new ConflictException("该付款凭证已用于其他订单或正在清理，请重新上传");
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly tradeEvents: TradeEventsService,
    private readonly mailer: MailerService,
    private readonly logistics: LogisticsTrackingService,
    @Optional()
    private readonly reliableNotifications?: ReliableNotificationIntentService,
    @Optional()
    private readonly fulfillmentService?: FulfillmentService,
  ) {}

  onModuleInit() {
    if (!this.reliableNotifications) {
      throw new Error("ReliableNotificationIntentService is not configured");
    }
    if (!this.fulfillmentService) {
      throw new Error("FulfillmentService is not configured");
    }
  }

  private fulfillmentAuthority(): FulfillmentService {
    if (!this.fulfillmentService) {
      throw new Error("FulfillmentService is not configured");
    }
    return this.fulfillmentService;
  }

  /**
   * 订单状态邮件通知（OR-2 触达）。fire-and-forget：不 await、不抛错，
   * 失败仅落邮件服务日志，绝不影响订单主流程；SMTP 未配置时诚实降级为日志。
   */
  private notifyCustomerOrderStatus(
    order: {
      orderNo: string;
      customerEmail: string | null;
      customerName: string | null;
    },
    statusText: string,
    extraHtml = "",
  ) {
    if (!order?.customerEmail) return;
    const escapeHtml = (value: string) =>
      String(value).replace(
        /[&<>"']/g,
        (c) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
            c
          ] ?? c,
      );
    void this.mailer
      .send({
        to: order.customerEmail,
        subject: `订单 ${order.orderNo} ${statusText} - 海川珠宝`,
        html: this.mailer.renderShell(`
          <p>您好，${escapeHtml(order.customerName ?? "尊敬的客户")}：</p>
          <p>您的订单 <strong>${escapeHtml(order.orderNo)}</strong> 状态已更新为：<strong>${escapeHtml(statusText)}</strong>。</p>
          ${extraHtml}
          <p>欢迎登录<a href="${this.mailer.getSiteBaseUrl()}/customer">客户中心</a>查看订单详情。</p>
        `),
      }, { requireNotificationDeliveryEnabled: true })
      .catch(() => undefined);
  }

  /**
   * 生成订单号：ORD + 日期 + 4 位日内流水（如 ORD202608130001）。
   * 事务内按数值后缀取当日最大序号 +1；并发冲突由 orderNo @unique 约束 + create 外层重试兜底。
   * 重试有明确上限，且每次失败的完整事务必须先回滚。
   */
  private async generateOrderNo(tx: Prisma.TransactionClient): Promise<string> {
    const date = businessDateKey();
    const prefix = `ORD${date}`;
    const suffixStart = prefix.length + 1;
    const [latest] = await tx.$queryRaw<
      Array<{ max_sequence: bigint | number | string | null }>
    >(
      Prisma.sql`
        SELECT MAX(CAST(SUBSTRING(order_no, ${suffixStart}) AS UNSIGNED)) AS max_sequence
        FROM orders
        WHERE order_no LIKE ${`${prefix}%`}
          AND SUBSTRING(order_no, ${suffixStart}) REGEXP '^[0-9]+$'
      `,
    );
    const seq = BigInt(String(latest?.max_sequence ?? 0)) + 1n;
    return `${prefix}${seq.toString().padStart(4, "0")}`;
  }

  private createPaymentNo(): string {
    const date = businessDateKey();
    return `PAY${date}${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  }

  private createFulfillmentNo(): string {
    const date = businessDateKey();
    return `FUL${date}${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  }

  private moneyToCents(value: Prisma.Decimal | number | string, fieldName: string) {
    const amount = Number(value);
    const cents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || !Number.isSafeInteger(cents)) {
      throw new BadRequestException(`${fieldName}无效`);
    }
    if (Math.abs(amount * 100 - cents) > 1e-8) {
      throw new BadRequestException(`${fieldName}最多保留两位小数`);
    }
    return cents;
  }

  /**
   * 支付、退款和履约都以订单行为串行化边界。MySQL 行锁避免两笔不同 Payment
   * 同时核销时都基于旧余额推进订单或创建两张履约单。
   */
  private async lockOrderForTrade(
    tx: Prisma.TransactionClient,
    orderId: number,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException("订单不存在");
  }

  /** 结算核销前锁定优惠券行，确保经济条款、启用状态与额度在本事务内稳定。 */
  private async lockCouponForCheckout(
    tx: Prisma.TransactionClient,
    couponId: number,
  ): Promise<Coupon> {
    const rows = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM coupons WHERE id = ${couponId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new BadRequestException("优惠券不存在");
    const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) throw new BadRequestException("优惠券不存在");
    return coupon;
  }

  /**
   * 未付款取消时归还一次优惠券容量。调用方必须已持有订单行锁；本方法随后锁 Coupon，
   * 以订单状态转换作为一次性边界，不清空 Order.couponId，保留历史优惠事实。
   */
  private async releaseCouponCapacityForUnpaidCancellation(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      couponId: number | null;
      status: OrderStatus;
      paidAmount: Prisma.Decimal;
    },
    operator: OperatorContext,
    trigger: 'MANUAL_CANCEL' | 'PAYMENT_TIMEOUT',
  ) {
    if (
      !order.couponId ||
      order.status !== 'PENDING_PAYMENT' ||
      Number(order.paidAmount) !== 0
    ) {
      return false;
    }

    const rows = await tx.$queryRaw<Array<{ id: number; usedCount: number }>>(
      Prisma.sql`SELECT id, used_count AS usedCount FROM coupons WHERE id = ${order.couponId} FOR UPDATE`,
    );
    if (rows.length === 0) return false;
    const previousUsedCount = Number(rows[0].usedCount);
    const released = await tx.coupon.updateMany({
      where: { id: order.couponId, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
    if (released.count === 0) return false;

    await this.tradeEvents.record(tx, {
      orderId: order.id,
      entityType: TRADE_ENTITY_TYPE.ORDER,
      entityId: order.id,
      eventType: TRADE_EVENT_TYPE.COUPON_RELEASED,
      operator,
      reason:
        trigger === 'PAYMENT_TIMEOUT'
          ? '未付款超时取消归还优惠券容量'
          : '未付款订单取消归还优惠券容量',
      metadata: {
        couponId: order.couponId,
        trigger,
        previousUsedCount,
        currentUsedCount: previousUsedCount - 1,
      },
    });
    return true;
  }

  /** Payment 状态会随退款改变；毛收款仍包含部分退款和已退款的原支付金额。 */
  private async getConfirmedPaymentCents(
    tx: Prisma.TransactionClient,
    orderId: number,
  ) {
    const payments = await tx.payment.findMany({
      where: {
        orderId,
        status: { in: [...CONFIRMED_PAYMENT_STATUSES] },
      },
      select: { amount: true },
    });
    return payments.reduce(
      (sum, payment) => sum + this.moneyToCents(payment.amount, "收款金额"),
      0,
    );
  }

  private async ensurePendingFulfillments(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      items: Array<{ id: number; skuId: number }>;
    },
    operator: OperatorContext,
  ) {
    const existing = await tx.fulfillment.findMany({
      where: { orderId: order.id },
      orderBy: { id: "asc" },
    });
    if (existing.length > 0) {
      if (existing.some((fulfillment) =>
        !["PENDING_PICK", "PENDING_CHECK", "PENDING_SHIP"].includes(
          fulfillment.status,
        ))) {
        throw new ConflictException("订单已存在非待处理履约单，请先核对交易状态");
      }
      return { fulfillments: existing, created: false };
    }

    const reservations = await tx.inventoryReservation.findMany({
      where: {
        orderId: order.id,
        releasedAt: null,
        consumedAt: { not: null },
        inventoryId: { not: null },
      },
      select: {
        id: true,
        skuId: true,
        quantity: true,
        inventory: { select: { warehouseId: true } },
      },
    });
    if (reservations.length === 0 || reservations.some((item) => !item.inventory)) {
      throw new ConflictException("订单缺少可追溯的仓库预占，不能生成履约单");
    }
    const orderItemBySku = new Map(order.items.map((item) => [item.skuId, item.id]));
    const byWarehouse = new Map<number, typeof reservations>();
    for (const reservation of reservations) {
      const warehouseId = reservation.inventory!.warehouseId;
      if (!orderItemBySku.has(reservation.skuId)) {
        throw new ConflictException("库存预占与订单商品不一致，不能生成履约单");
      }
      const group = byWarehouse.get(warehouseId) ?? [];
      group.push(reservation);
      byWarehouse.set(warehouseId, group);
    }

    const fulfillments = [];
    for (const warehouseId of [...byWarehouse.keys()].sort((a, b) => a - b)) {
      const allocations = byWarehouse.get(warehouseId)!;
      const fulfillment = await tx.fulfillment.create({
        data: {
          fulfillmentNo: this.createFulfillmentNo(),
          orderId: order.id,
          warehouseId,
          status: "PENDING_PICK",
          createdBy:
            operator.type === OPERATOR_TYPE.ADMIN ? operator.id ?? null : null,
          items: {
            create: allocations.map((allocation) => ({
              orderItemId: orderItemBySku.get(allocation.skuId)!,
              inventoryReservationId: allocation.id,
              quantity: allocation.quantity,
            })),
          },
        },
      });
      await this.tradeEvents.record(tx, {
        orderId: order.id,
        entityType: TRADE_ENTITY_TYPE.FULFILLMENT,
        entityId: fulfillment.id,
        eventType: TRADE_EVENT_TYPE.FULFILLMENT_CREATED,
        toStatus: "PENDING_PICK",
        operator,
        metadata: {
          warehouseId,
          reservationIds: allocations.map((allocation) => allocation.id),
        },
      });
      fulfillments.push(fulfillment);
    }
    return { fulfillments, created: true };
  }

  /**
   * 一笔 Payment 确认后统一刷新订单实收。零售订单全额到账后消费 Inventory
   * 并创建仓库履约单；定制/合作订单消费报价资源预占并进入定制阶段，
   * 不把资源桶强行映射为零售仓库与 InventoryReservation。
   */
  private async applyConfirmedPaymentToOrder(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      status: OrderStatus;
      quoteChannel?: QuoteChannel | null;
      customStage?: CustomStage | null;
      finalAmount: Prisma.Decimal;
      depositAmount: Prisma.Decimal;
      balanceAmount: Prisma.Decimal;
      items: Array<{
        id: number;
        productId: number;
        skuId: number;
        quantity: number;
      }>;
    },
    paymentMethod: string,
    now: Date,
    operator: OperatorContext,
    stockReason: string,
  ) {
    const paidCents = await this.getConfirmedPaymentCents(tx, order.id);
    const finalCents = this.moneyToCents(order.finalAmount, "订单应收金额");
    if (paidCents > finalCents) {
      throw new BadRequestException(
        `确认后将超过订单应收金额，请核对付款记录（订单应收 ¥${(finalCents / 100).toFixed(2)}）`,
      );
    }
    if (order.status !== "PENDING_PAYMENT") {
      throw new BadRequestException("订单状态已变化，不能确认收款");
    }

    const paidAmount = new Prisma.Decimal(paidCents).div(100);
    if (paidCents < finalCents) {
      const refreshed = await tx.order.updateMany({
        where: { id: order.id, status: "PENDING_PAYMENT" },
        data: { paidAmount, paymentMethod },
      });
      if (refreshed.count === 0) {
        throw new ConflictException("订单状态已变化，请刷新后重试");
      }
      return { fullyPaid: false, paidCents };
    }

    if (usesTradeResourceReservations(order.quoteChannel)) {
      const consumedResources = await this.consumeTradeResourceReservations(
        tx,
        order.id,
        now,
      );
      if (consumedResources === 0) {
        throw new ConflictException("订单缺少可核销的定制资源预占，不能确认全额收款");
      }

      const advanced = await tx.order.updateMany({
        where: { id: order.id, status: "PENDING_PAYMENT" },
        data: {
          status: "PENDING_SHIP",
          paymentConfirmedAt: now,
          paidAmount,
          paymentMethod,
          deliveryStatus: "NONE",
          paidDeposit: order.depositAmount,
          paidBalance: order.balanceAmount,
          customStage: "BALANCE_PAID",
          reservedAt: null,
        },
      });
      if (advanced.count === 0) {
        throw new ConflictException("订单状态已变化，请刷新后重试");
      }

      await this.tradeEvents.record(tx, {
        orderId: order.id,
        entityType: TRADE_ENTITY_TYPE.ORDER,
        entityId: order.id,
        eventType: TRADE_EVENT_TYPE.ORDER_CUSTOM_STAGE_CHANGED,
        fromStatus: order.customStage ?? null,
        toStatus: "BALANCE_PAID",
        operator,
        reason: "全额收款已确认，报价资源预占已核销",
        metadata: { quoteChannel: order.quoteChannel, consumedResources },
      });
      return { fullyPaid: true, paidCents };
    }

    const consumed = await this.consumeStockReservations(tx, order.id, now);
    if (consumed.count === 0 && order.items.length > 0) {
      const expiresAt = this.getReservationExpiry(now);
      for (const item of [...order.items].sort(
        (a, b) => a.productId - b.productId || a.skuId - b.skuId,
      )) {
        await this.reserveStock(
          tx,
          order.id,
          item.skuId,
          item.quantity,
          expiresAt,
        );
      }
      await this.consumeStockReservations(tx, order.id, now);
    }

    const advanced = await tx.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: {
        status: "PENDING_SHIP",
        paymentConfirmedAt: now,
        paidAmount,
        paymentMethod,
        deliveryStatus: "PENDING_SHIP",
      },
    });
    if (advanced.count === 0) {
      throw new ConflictException("订单状态已变化，请刷新后重试");
    }

    await this.ensurePendingFulfillments(tx, order, operator);
    await this.tradeEvents.record(tx, {
      orderId: order.id,
      entityType: TRADE_ENTITY_TYPE.INVENTORY,
      entityId: order.id,
      eventType: TRADE_EVENT_TYPE.STOCK_CONSUMED,
      operator,
      reason: stockReason,
    });
    return { fullyPaid: true, paidCents };
  }

  private validateCustomerData(data: {
    customerName: string;
    customerPhone: string;
    address: string;
  }) {
    const customerName = data.customerName?.trim();
    const customerPhone = data.customerPhone?.trim();
    const address = data.address?.trim();
    if (!customerName || customerName.length > 50)
      throw new BadRequestException("请提供有效的收货人姓名");
    if (!/^1\d{10}$/.test(customerPhone))
      throw new BadRequestException("请提供有效的手机号码");
    if (!address || address.length > 500)
      throw new BadRequestException("请提供有效的收货地址");
    return { customerName, customerPhone, address };
  }

  private normalizeItems(items: unknown): Map<number, number> {
    if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
      throw new BadRequestException("订单商品数量必须在 1 到 20 件之间");
    }

    const quantities = new Map<number, number>();
    for (const item of items) {
      const skuId = Number((item as { skuId?: unknown }).skuId);
      const quantity = Number((item as { quantity?: unknown }).quantity);
      if (
        !Number.isInteger(skuId) ||
        skuId < 1 ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
      ) {
        throw new BadRequestException("订单商品规格或数量无效");
      }
      const nextQuantity = (quantities.get(skuId) || 0) + quantity;
      if (nextQuantity > 99)
        throw new BadRequestException("同一商品规格的数量不能超过 99");
      quantities.set(skuId, nextQuantity);
    }
    return quantities;
  }

  private getReservationExpiry(now = new Date()) {
    return new Date(now.getTime() + OFFLINE_PAYMENT_RESERVATION_MS);
  }

  /**
   * 库存策略切换、预占与释放共用商品行锁，避免事务读取到切换前策略后再写库存。
   * 这里只串行化交易事实，不修改商品本身。
   */
  private async lockTradeProduct(
    tx: Prisma.TransactionClient,
    productId: number,
  ) {
    const rows = await tx.$queryRaw<
      Array<{ id: number; inventoryPolicy: "STANDARD" | "SINGLE_UNIT" }>
    >(
      Prisma.sql`SELECT id, inventory_policy AS inventoryPolicy FROM products WHERE id = ${productId} AND deleted_at IS NULL FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException("商品不存在或已删除");
    return rows[0].inventoryPolicy;
  }

  /** 由 SKU 直接锁定所属商品，避免锁前普通读取建立旧事务快照。 */
  private async lockTradeProductBySku(
    tx: Prisma.TransactionClient,
    skuId: number,
  ) {
    const rows = await tx.$queryRaw<
      Array<{
        id: number;
        inventoryPolicy: "STANDARD" | "SINGLE_UNIT";
      }>
    >(
      Prisma.sql`SELECT p.id, p.inventory_policy AS inventoryPolicy FROM products p INNER JOIN product_skus sku ON sku.product_id = p.id WHERE sku.id = ${skuId} AND p.deleted_at IS NULL FOR UPDATE`,
    );
    if (rows.length === 0) throw new BadRequestException("商品规格不存在");
    return {
      productId: rows[0].id,
      inventoryPolicy: rows[0].inventoryPolicy,
    };
  }

  /** SINGLE_UNIT 校验使用当前读并锁定库存行，不受事务旧快照影响。 */
  private async getLockedInventoryTotal(
    tx: Prisma.TransactionClient,
    productId: number,
  ) {
    const rows = await tx.$queryRaw<Array<{ quantity: number }>>(
      Prisma.sql`SELECT inventory.quantity FROM inventories inventory INNER JOIN product_skus sku ON sku.id = inventory.sku_id INNER JOIN warehouses warehouse ON warehouse.id = inventory.warehouse_id WHERE sku.product_id = ${productId} AND warehouse.is_active = 1 FOR UPDATE`,
    );
    return rows.reduce((sum, row) => sum + Number(row.quantity), 0);
  }

  private async reserveStock(
    tx: Prisma.TransactionClient,
    orderId: number,
    skuId: number,
    quantity: number,
    expiresAt: Date,
  ) {
    const { productId, inventoryPolicy } = await this.lockTradeProductBySku(
      tx,
      skuId,
    );
    if (inventoryPolicy === "SINGLE_UNIT") {
      if (quantity !== 1) {
        throw new ConflictException("一物一件商品每个订单最多购买 1 件");
      }
      const total = await this.getLockedInventoryTotal(tx, productId);
      if (total < 0 || total > 1) {
        throw new ConflictException("一物一件商品库存状态异常，请先核对库存");
      }
    }

    const inventories = await tx.inventory.findMany({
      where: { skuId, warehouse: { isActive: true } },
      orderBy: { quantity: "desc" },
      select: { id: true, quantity: true },
    });

    if (inventories.length === 0) {
      // Inventory 为唯一库存来源（DECISIONS D.1 已定）：无库存记录视为无库存，
      // 不再 fallback 到已废弃的 ProductSKU.stock。管理员需先在库存管理为 SKU 配置 Inventory。
      throw new BadRequestException("商品库存不足，请刷新后重试");
    }

    let remaining = quantity;
    for (const inventory of inventories) {
      if (remaining <= 0) break;
      const deduction = Math.min(remaining, inventory.quantity);
      if (deduction <= 0) continue;
      const result = await tx.inventory.updateMany({
        where: { id: inventory.id, quantity: { gte: deduction } },
        data: { quantity: { decrement: deduction } },
      });
      if (result.count !== 1)
        throw new BadRequestException("商品库存已变动，请刷新后重试");
      await tx.inventoryReservation.create({
        data: {
          orderId,
          inventoryId: inventory.id,
          skuId,
          quantity: deduction,
          expiresAt,
        },
      });
      remaining -= deduction;
    }
    if (remaining > 0)
      throw new BadRequestException("商品库存不足，请刷新后重试");
  }

  private async releaseStockReservations(
    tx: Prisma.TransactionClient,
    orderId: number,
    releasedAt: Date,
  ) {
    const reservations = await tx.inventoryReservation.findMany({
      where: { orderId, releasedAt: null, consumedAt: null },
      select: {
        id: true,
        inventoryId: true,
        skuId: true,
        quantity: true,
        sku: { select: { productId: true } },
      },
    });

    // 历史预占若缺少 Inventory 归属，无法安全判断应恢复到哪个仓位。
    // 必须在抢占 releasedAt 之前失败关闭，让外层事务完整回滚；禁止再回写非权威的 SKU.stock。
    if (reservations.some((reservation) => reservation.inventoryId === null)) {
      throw new ConflictException(
        "订单库存归属异常，暂时无法释放库存，请联系管理员核对后重试",
      );
    }

    const byProduct = new Map<number, typeof reservations>();
    for (const reservation of reservations) {
      const group = byProduct.get(reservation.sku.productId) ?? [];
      group.push(reservation);
      byProduct.set(reservation.sku.productId, group);
    }

    let releasedCount = 0;
    for (const productId of [...byProduct.keys()].sort((a, b) => a - b)) {
      const inventoryPolicy = await this.lockTradeProduct(tx, productId);
      const claimed = [] as typeof reservations;
      for (const reservation of byProduct.get(productId) ?? []) {
        // 先用状态条件原子抢占释放权；库存写入失败会随整个事务回滚该标记。
        const result = await tx.inventoryReservation.updateMany({
          where: {
            id: reservation.id,
            releasedAt: null,
            consumedAt: null,
          },
          data: { releasedAt },
        });
        if (result.count === 1) claimed.push(reservation);
      }
      if (claimed.length === 0) continue;
      releasedCount += claimed.length;

      if (inventoryPolicy === "SINGLE_UNIT") {
        const total = await this.getLockedInventoryTotal(tx, productId);
        if (total < 0 || total > 1) {
          throw new ConflictException("一物一件商品库存状态异常，请先核对库存");
        }
        if (total === 0) {
          const target = claimed.find(
            (reservation) => reservation.inventoryId !== null,
          );
          if (target?.inventoryId) {
            await tx.inventory.update({
              where: { id: target.inventoryId },
              data: { quantity: 1 },
            });
          }
        }
        // SINGLE_UNIT 只恢复一次，避免策略切换后把一物一件恢复为大于 1。
        continue;
      }

      for (const reservation of claimed) {
        if (!reservation.inventoryId) {
          throw new ConflictException(
            "订单库存归属异常，暂时无法释放库存，请联系管理员核对后重试",
          );
        }
        await tx.inventory.update({
          where: { id: reservation.inventoryId },
          data: { quantity: { increment: reservation.quantity } },
        });
      }
    }

    return releasedCount;
  }

  private async consumeStockReservations(
    tx: Prisma.TransactionClient,
    orderId: number,
    consumedAt: Date,
  ) {
    return tx.inventoryReservation.updateMany({
      where: { orderId, releasedAt: null, consumedAt: null },
      data: { consumedAt },
    });
  }

  private async releaseTradeResourceReservations(
    tx: Prisma.TransactionClient,
    orderId: number,
    releasedAt: Date,
  ) {
    const reservations = await tx.orderResourceReservation.findMany({
      where: { orderId, status: "RESERVED" },
      select: { id: true, resourceBucketId: true, quantity: true },
      orderBy: [{ resourceBucketId: "asc" }, { id: "asc" }],
    });
    let releasedCount = 0;
    for (const reservation of reservations) {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM trade_resource_buckets WHERE id = ${reservation.resourceBucketId} FOR UPDATE`,
      );
      const claimed = await tx.orderResourceReservation.updateMany({
        where: { id: reservation.id, status: "RESERVED" },
        data: { status: "RELEASED", releasedAt },
      });
      if (claimed.count !== 1) continue;
      const bucket = await tx.tradeResourceBucket.updateMany({
        where: {
          id: reservation.resourceBucketId,
          reservedQuantity: { gte: reservation.quantity },
        },
        data: {
          reservedQuantity: { decrement: reservation.quantity },
          version: { increment: 1 },
        },
      });
      if (bucket.count !== 1) throw new ConflictException("资源预占数据不一致，不能释放");
      releasedCount += 1;
    }
    return releasedCount;
  }

  private async consumeTradeResourceReservations(
    tx: Prisma.TransactionClient,
    orderId: number,
    consumedAt: Date,
  ) {
    const reservations = await tx.orderResourceReservation.findMany({
      where: { orderId, status: "RESERVED" },
      select: { id: true, resourceBucketId: true, quantity: true },
      orderBy: [{ resourceBucketId: "asc" }, { id: "asc" }],
    });
    let consumedCount = 0;
    for (const reservation of reservations) {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM trade_resource_buckets WHERE id = ${reservation.resourceBucketId} FOR UPDATE`,
      );
      const claimed = await tx.orderResourceReservation.updateMany({
        where: { id: reservation.id, status: "RESERVED" },
        data: { status: "CONSUMED", consumedAt },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("资源预占状态已变化，不能核销");
      }
      const bucket = await tx.tradeResourceBucket.updateMany({
        where: {
          id: reservation.resourceBucketId,
          availableQuantity: { gte: reservation.quantity },
          reservedQuantity: { gte: reservation.quantity },
        },
        data: {
          availableQuantity: { decrement: reservation.quantity },
          reservedQuantity: { decrement: reservation.quantity },
          version: { increment: 1 },
        },
      });
      if (bucket.count !== 1) throw new ConflictException("资源预占数据不一致，不能核销");
      consumedCount += 1;
    }
    return consumedCount;
  }

  private async cancelActivePaymentPlanInTx(
    tx: Prisma.TransactionClient,
    orderId: number,
    required = false,
  ) {
    const plan = await tx.paymentPlan.findUnique({
      where: { orderId },
      include: { installments: true },
    });
    if (!plan) {
      if (required) {
        throw new ConflictException("订单缺少应有的付款计划，不能取消");
      }
      return;
    }
    if (plan.status !== "ACTIVE") {
      if (plan.status === "CANCELLED") return;
      throw new ConflictException("付款计划状态不允许取消订单");
    }
    if (
      plan.installments.some((installment) =>
        ["PAID", "WAIVED"].includes(installment.status) ||
        installment.paymentId !== null,
      )
    ) {
      throw new ConflictException("付款计划已有完成或仍绑定的分期，不能取消订单");
    }
    await tx.paymentPlanInstallment.updateMany({
      where: {
        paymentPlanId: plan.id,
        status: { in: ["PENDING", "DUE"] },
        paymentId: null,
      },
      data: { status: "CANCELLED", paidAt: null },
    });
    const cancelled = await tx.paymentPlan.updateMany({
      where: { id: plan.id, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });
    if (cancelled.count !== 1) {
      throw new ConflictException("付款计划状态已变化，请刷新后重试");
    }
  }

  private async expireReservationIfNeeded(
    tx: Prisma.TransactionClient,
    orderId: number,
    now = new Date(),
  ) {
    const order = await tx.order.findFirst({
      where: { id: orderId, status: "PENDING_PAYMENT" },
      include: {
        payments: { select: { status: true, proofUrl: true, method: true } },
        paymentPlans: { select: { id: true } },
      },
    });
    const hasPendingProof = order?.payments.some(
      (payment) => payment.status === 'PENDING' && payment.proofUrl !== null,
    );
    const hasPendingOnlinePayment = order?.payments.some(
      (payment) =>
        payment.status === "PENDING"
        && (ONLINE_PAYMENT_METHODS as readonly string[]).includes(payment.method),
    );
    const hasConfirmedPayment = order?.payments.some((payment) =>
      (CONFIRMED_PAYMENT_STATUSES as readonly string[]).includes(payment.status),
    );
    const hasPendingPayment = order?.payments.some(
      (payment) => payment.status === "PENDING",
    );
    if (
      !order?.reservedAt ||
      hasPendingProof ||
      hasPendingOnlinePayment ||
      hasPendingPayment ||
      hasConfirmedPayment ||
      Number(order.paidAmount) !== 0
    ) {
      return false;
    }
    const expiresAt = new Date(
      order.reservedAt.getTime() + OFFLINE_PAYMENT_RESERVATION_MS,
    );
    if (expiresAt > now) {
      return false;
    }

    await this.releaseCouponCapacityForUnpaidCancellation(
      tx,
      order,
      { type: OPERATOR_TYPE.SYSTEM },
      'PAYMENT_TIMEOUT',
    );
    const releasedCount = await this.releaseStockReservations(tx, order.id, now);
    if (usesTradeResourceReservations(order.quoteChannel)) {
      await this.releaseTradeResourceReservations(tx, order.id, now);
    }
    if (
      order.quotationVersionId != null ||
      (order.paymentPlans?.length ?? 0) > 0
    ) {
      await this.cancelActivePaymentPlanInTx(tx, order.id, true);
    }
    const cancelled = await tx.order.updateMany({
      where: { id: order.id, status: 'PENDING_PAYMENT', paidAmount: 0 },
      data: { status: "CANCELLED", cancelledAt: now, reservedAt: null },
    });
    if (cancelled.count === 0) {
      throw new ConflictException('订单状态或收款事实已变化，请刷新后重试');
    }
    // 超时取消：库存释放事件 + 订单取消事件（操作人为系统）
    if (releasedCount > 0) {
      await this.tradeEvents.record(tx, {
        orderId: order.id,
        entityType: TRADE_ENTITY_TYPE.INVENTORY,
        entityId: order.id,
        eventType: TRADE_EVENT_TYPE.STOCK_RELEASED,
        operator: { type: OPERATOR_TYPE.SYSTEM },
        reason: "超时未付款自动释放库存",
      });
    }
    await this.tradeEvents.record(tx, {
      orderId: order.id,
      entityType: TRADE_ENTITY_TYPE.ORDER,
      entityId: order.id,
      eventType: TRADE_EVENT_TYPE.ORDER_CANCELLED,
      fromStatus: "PENDING_PAYMENT",
      toStatus: "CANCELLED",
      operator: { type: OPERATOR_TYPE.SYSTEM },
      reason: "超时未付款自动取消",
    });
    return true;
  }

  /** 构建订单列表 where 条件（服务端筛选） */
  private buildListWhere(params: OrderListParams): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};
    if (params.status && params.status !== "all")
      where.status = params.status as OrderStatus;
    if (params.customerId) where.customerId = params.customerId;

    if (params.keyword) {
      where.OR = [
        { orderNo: { contains: params.keyword } },
        { customerName: { contains: params.keyword } },
        { customerPhone: { contains: params.keyword } },
      ];
    }

    // 时间范围
    if (params.startDate || params.endDate) {
      const start = params.startDate ? new Date(params.startDate) : null;
      const end = params.endDate ? new Date(params.endDate) : null;
      if (
        (start && Number.isNaN(start.getTime())) ||
        (end && Number.isNaN(end.getTime()))
      ) {
        throw new BadRequestException("订单时间范围无效");
      }
      if (start && end && start.getTime() > end.getTime()) {
        throw new BadRequestException("订单开始时间不能晚于结束时间");
      }
      where.createdAt = {};
      if (start) where.createdAt.gte = start;
      if (end) {
        // endDate 含当天：加一天作为上界，实现闭区间
        const exclusiveEnd = new Date(end);
        exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
        where.createdAt.lt = exclusiveEnd;
      }
    }

    // 金额范围（按 finalAmount）
    if (params.minAmount !== undefined || params.maxAmount !== undefined) {
      const min =
        params.minAmount !== undefined && params.minAmount !== ""
          ? Number(params.minAmount)
          : null;
      const max =
        params.maxAmount !== undefined && params.maxAmount !== ""
          ? Number(params.maxAmount)
          : null;
      if (
        (min !== null && (!Number.isFinite(min) || min < 0)) ||
        (max !== null && (!Number.isFinite(max) || max < 0))
      ) {
        throw new BadRequestException("订单金额范围无效");
      }
      if (min !== null && max !== null && min > max) {
        throw new BadRequestException("订单最小金额不能大于最大金额");
      }
      where.finalAmount = {};
      if (min !== null) where.finalAmount.gte = new Prisma.Decimal(min);
      if (max !== null) where.finalAmount.lte = new Prisma.Decimal(max);
    }

    // 商品名/货号筛选：通过 items 关联
    if (params.productKeyword) {
      where.items = {
        some: {
          OR: [
            { productNameSnapshot: { contains: params.productKeyword } },
            { productCodeSnapshot: { contains: params.productKeyword } },
          ],
        },
      };
    }

    // 交易中心多维筛选：订单类型 / 发货维度 / 销售顾问 / 来源渠道
    if (params.orderType && params.orderType !== "all")
      where.orderType = params.orderType as OrderType;
    if (params.deliveryStatus && params.deliveryStatus !== "all")
      where.deliveryStatus = params.deliveryStatus as DeliveryStatus;
    if (params.salesConsultantId)
      where.salesConsultantId = Number(params.salesConsultantId);
    if (params.source && params.source !== "all") where.source = params.source;

    // 支付状态派生筛选（基于 paidAmount 与 finalAmount 的比较）
    if (params.paymentStatus && params.paymentStatus !== "all") {
      if (params.paymentStatus === "UNPAID") {
        // 未收款：paidAmount = 0
        where.paidAmount = 0;
      } else if (params.paymentStatus === "PAID") {
        // Prisma 字段引用在数据库侧精确比较，不把部分收款混入已收齐。
        where.paidAmount = { gte: this.prisma.order.fields.finalAmount };
      } else if (params.paymentStatus === "PARTIAL") {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          { paidAmount: { gt: 0 } },
          { paidAmount: { lt: this.prisma.order.fields.finalAmount } },
        ];
      }
    }

    return where;
  }

  async findAll(params: OrderListParams, actor: StaffOrderActor) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where = this.buildListWhere(params);

    return this.prisma.$transaction(async (tx) => {
      await lockAuthorizedStaffForOrder(tx, actor, "ORDER_QUERY");
      const [list, total] = await Promise.all([
        tx.order.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, code: true } },
              },
            },
            payments: {
              select: {
                id: true,
                status: true,
                method: true,
                amount: true,
                createdAt: true,
              },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        tx.order.count({ where }),
      ]);
      return { list, total, page, pageSize };
    });
  }

  /** 订单导出：数据读取与操作日志同成同败，避免客户信息被无痕导出。 */
  async findAllForExport(
    params: OrderListParams,
    actor: StaffOrderActor,
    limit = 1000,
  ) {
    const operatorId = actor.id;
    if (!operatorId) {
      throw new BadRequestException("订单导出缺少可审计的操作人");
    }
    const where = this.buildListWhere(params);
    const boundedLimit = Math.min(Math.max(limit, 1), 1000);
    return this.prisma.$transaction(async (tx) => {
      const operator = await lockAuthorizedStaffForOrder(tx, actor, "ORDER_ADMIN");
      const rows = await tx.order.findMany({
        where,
        take: boundedLimit,
        select: {
          orderNo: true,
          customerName: true,
          customerPhone: true,
          finalAmount: true,
          status: true,
          createdAt: true,
          paymentConfirmedAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
      await tx.operationLog.create({
        data: {
          userId: operator.id!,
          action: "export",
          module: "orders",
          detail: JSON.stringify({
            exportedCount: rows.length,
            limit: boundedLimit,
            filters: {
              status: params.status ?? null,
              orderType: params.orderType ?? null,
              deliveryStatus: params.deliveryStatus ?? null,
              paymentStatus: params.paymentStatus ?? null,
              startDate: params.startDate ?? null,
              endDate: params.endDate ?? null,
              hasKeyword: Boolean(params.keyword || params.productKeyword),
              salesConsultantId: params.salesConsultantId ?? null,
              source: params.source ?? null,
            },
          }),
        },
      });
      return rows;
    });
  }

  async findById(id: number, actor: StaffOrderActor) {
    return this.prisma.$transaction(async (tx) => {
      await lockAuthorizedStaffForOrder(tx, actor, "ORDER_QUERY");
      const order = await tx.order.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, code: true, materialType: true },
              },
              sku: { select: { skuCode: true, material: true, size: true } },
            },
          },
          payments: { orderBy: { createdAt: "desc" } },
          refunds: { orderBy: { createdAt: "desc" } },
          reservations: { orderBy: { createdAt: "asc" } },
          quotedLines: { orderBy: { id: "asc" } },
          resourceReservations: {
            orderBy: { id: "asc" },
            include: {
              resourceBucket: {
                select: {
                  id: true,
                  channel: true,
                  kind: true,
                  code: true,
                  bucketKey: true,
                  displayName: true,
                  unit: true,
                },
              },
            },
          },
          quotationVersion: {
            select: {
              id: true,
              quotationId: true,
              version: true,
              status: true,
              snapshotSchemaVersion: true,
              contentHash: true,
            },
          },
          quotationSource: {
            select: { id: true, quoteNo: true, channel: true, status: true },
          },
          quotationConversion: {
            select: { id: true, quotationVersionId: true, customerId: true, createdAt: true },
          },
          fulfillments: { orderBy: { createdAt: "desc" } },
          afterSalesCases: { orderBy: { createdAt: "desc" } },
          tradeEvents: { orderBy: { createdAt: "asc" } },
          customer: {
            select: { id: true, name: true, phone: true, email: true },
          },
        },
      });
      if (!order) throw new NotFoundException("订单不存在");
      if (
        order.transactionSnapshot != null
        && (
          order.snapshotSchemaVersion !== 2
          || !order.transactionSnapshotHash
          || hashBusinessSnapshot(order.transactionSnapshot) !== order.transactionSnapshotHash
        )
      ) {
        throw new ConflictException("订单交易快照完整性校验失败");
      }
      return order;
    });
  }

  /**
   * 客户查看自己订单的物流轨迹（归属校验 + 已发货才可查）。
   * 查询由快递100 服务完成（未配置凭据时诚实 503）。
   */
  async trackForCustomer(
    customer: Pick<CustomerPrincipal, "id" | "authVersion">,
    orderId: number,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, customer);
      const order = await transaction.order.findFirst({
        where: { id: orderId, customerId: customer.id },
        select: {
          id: true,
          orderNo: true,
          status: true,
          logisticsCompany: true,
          logisticsNo: true,
        },
      });
      if (!order) throw new NotFoundException("订单不存在");
      if (!order.logisticsNo || !["SHIPPED", "COMPLETED"].includes(order.status)) {
        throw new BadRequestException("订单尚未发货，暂无物流轨迹");
      }
      // 物流正文也是客户私有数据；在共享锁释放前完成受超时约束的查询，
      // 避免账户注销先提交后，旧 principal 仍向外部渠道发送运单号并收到结果。
      return this.logistics.track(order.logisticsCompany, order.logisticsNo);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async findForCustomer(
    customer: Pick<CustomerPrincipal, "id" | "authVersion">,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, customer);
      return this.findCustomerOrders(transaction, customer.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async findOneForCustomer(
    customer: Pick<CustomerPrincipal, "id" | "authVersion">,
    orderId: number | string,
  ) {
    const normalizedOrderId = typeof orderId === "number"
      ? orderId
      : /^[1-9]\d*$/.test(orderId)
        ? Number(orderId)
        : Number.NaN;
    if (!Number.isSafeInteger(normalizedOrderId) || normalizedOrderId <= 0) {
      throw new BadRequestException("订单编号无效");
    }
    const [order] = await this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, customer);
      return this.findCustomerOrders(transaction, customer.id, normalizedOrderId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!order) throw new NotFoundException("订单不存在");
    return order;
  }

  private async findCustomerOrders(
    transaction: Prisma.TransactionClient,
    customerId: number,
    orderId?: number,
  ) {
    // 客户订单字段白名单：internalNote（后台内部备注）、userId、salesConsultantId、
    // source、paymentProof 属于后台事实，不得进入客户响应。新增 Order 标量字段时
    // 必须先确认客户可见性，再显式加入本 select，避免随模型扩展自动外发。
    const orders = await transaction.order.findMany({
      where: {
        customerId,
        ...(orderId === undefined ? {} : { id: orderId }),
      },
      // 个人订单列表安全上限，防止极端账户全量加载；正常用户远不到此数
      take: orderId === undefined ? 100 : 1,
      select: {
        id: true,
        orderNo: true,
        customerName: true,
        customerId: true,
        customerPhone: true,
        customerEmail: true,
        address: true,
        totalAmount: true,
        discountAmount: true,
        finalAmount: true,
        status: true,
        paymentMethod: true,
        logisticsCompany: true,
        logisticsNo: true,
        lockedGoldPrice: true,
        reservedAt: true,
        paymentConfirmedAt: true,
        shippedAt: true,
        completedAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
        orderType: true,
        adjustmentAmount: true,
        depositAmount: true,
        paidDeposit: true,
        balanceAmount: true,
        paidBalance: true,
        paidAmount: true,
        refundedAmount: true,
        customStage: true,
        deliveryStatus: true,
        receivedAt: true,
        quoteChannel: true,
        couponId: true,
        items: {
          select: {
            id: true,
            productId: true,
            skuId: true,
            quantity: true,
            unitPrice: true,
            subtotal: true,
            productNameSnapshot: true,
            productImageSnapshot: true,
            productCodeSnapshot: true,
            skuSnapshot: true,
            actualWeight: true,
            certNumber: true,
            product: { select: { id: true, name: true, code: true } },
            sku: { select: { skuCode: true, material: true, size: true } },
          },
        },
        quotedLines: {
          select: {
            id: true,
            productId: true,
            skuId: true,
            waxType: true,
            description: true,
            quantity: true,
            unitAmount: true,
            lineAmount: true,
          },
        },
        payments: {
          select: {
            id: true,
            paymentNo: true,
            method: true,
            status: true,
            proofUrl: true,
            createdAt: true,
          },
        },
        fulfillments: {
          select: {
            id: true,
            status: true,
            carrier: true,
            trackingNo: true,
            shippedAt: true,
            deliveredAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        refunds: {
          // reason/reviewNote 均由后台退款链路写入，不是已批准的客户公开说明。
          select: {
            id: true,
            refundNo: true,
            amount: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        afterSalesCases: {
          select: {
            id: true,
            caseNo: true,
            orderItemId: true,
            type: true,
            status: true,
            reason: true,
            requestedRefundAmount: true,
            approvedRefundAmount: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        tradeEvents: {
          // 先按客户可见类型过滤，再取最近 20 条；否则大量更新的内部事件会在
          // 数据库截断阶段挤掉较早但应公开的定制、履约或售后进度。
          where: {
            eventType: { in: [...CUSTOMER_VISIBLE_EVENT_TYPES] },
          },
          select: {
            id: true,
            eventType: true,
            entityType: true,
            fromStatus: true,
            toStatus: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
      orderBy: { createdAt: "desc" },
    });
    // 客户订单接口不返回凭证真实路径、后台备注、操作者或渠道原始数据。
    // 下列五个后台字段不在 select 白名单内；此处按"可能存在"再剔除一次，
    // 即使查询层未来回退为 include，内部事实也不会外发（由 customer-visibility spec 断言）。
    return orders.map((order) => {
      const {
        payments,
        tradeEvents,
        internalNote: _internalNote,
        userId: _userId,
        salesConsultantId: _salesConsultantId,
        source: _source,
        paymentProof: _paymentProof,
        ...safeOrder
      } = order as typeof order & {
        internalNote?: unknown;
        userId?: unknown;
        salesConsultantId?: unknown;
        source?: unknown;
        paymentProof?: unknown;
      };
      return {
        ...safeOrder,
        payments: payments.map(({ proofUrl, ...payment }) => ({
          ...payment,
          hasProof: Boolean(proofUrl),
        })),
        refunds: safeOrder.refunds.map((refund) => {
          const {
            reason: _reason,
            reviewNote: _reviewNote,
            gatewayRefundNo: _gatewayRefundNo,
            requestedBy: _requestedBy,
            reviewedBy: _reviewedBy,
            processedBy: _processedBy,
            ...safeRefund
          } = refund as typeof refund & {
            reason?: unknown;
            reviewNote?: unknown;
            gatewayRefundNo?: unknown;
            requestedBy?: unknown;
            reviewedBy?: unknown;
            processedBy?: unknown;
          };
          return safeRefund;
        }),
        afterSalesCases: safeOrder.afterSalesCases.map((caseRecord) => {
          const {
            adminNote: _adminNote,
            handledBy: _handledBy,
            ...safeCase
          } = caseRecord as typeof caseRecord & {
            adminNote?: unknown;
            handledBy?: unknown;
          };
          return safeCase;
        }),
        timeline: tradeEvents
          .filter((event) => CUSTOMER_VISIBLE_EVENT_TYPES.has(event.eventType))
          .map((event) => ({
            id: event.id,
            eventType: event.eventType,
            entityType: event.entityType,
            fromStatus: event.fromStatus,
            toStatus: event.toStatus,
            createdAt: event.createdAt,
          })),
      };
    });
  }

  async create(data: {
    customerId?: number;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    address: string;
    paymentMethod?: string;
    items: { skuId: number; quantity: number }[];
    /** 订单类型（默认现货；定制/预订/线下由后台建单指定） */
    orderType?: OrderType;
    /** 销售顾问（后台建单可指定） */
    salesConsultantId?: number;
    /** 来源渠道：website/store/wechat/referral/offline */
    source?: string;
    /** 优惠券（营销生效：建单核销，折扣进 discountAmount/finalAmount/Order.couponId） */
    couponId?: number;
    /** 操作人上下文（客户结算=客户；后台人工建单=管理员） */
    operator?: OperatorContext;
    /** 仅由已认证客户结算服务设置；用于可见性校验、购物车绑定和原子清理。 */
    checkoutCustomer?: CustomerProductAccess & Pick<CustomerPrincipal, "id" | "authVersion">;
    /** 客户结算请求的作用域键与请求摘要；与订单、库存预占在同一事务内写入。 */
    checkoutIdempotency?: { keyHash: string; requestHash: string };
    /** 后台人工建单的员工域幂等上下文；复用订单现有摘要列，不扩展客户结算作用域。 */
    adminCreation?: { actorId: number; idempotencyKey: string };
    /** 后台人工建单的完整员工入口身份；服务端以数据库当前状态重新授权。 */
    staffPrincipal?: Pick<StaffPrincipal, "id">;
  }) {
    if (data.checkoutCustomer && !data.checkoutIdempotency) {
      throw new BadRequestException("客户结算缺少幂等上下文");
    }
    if (data.checkoutCustomer && data.adminCreation) {
      throw new BadRequestException("客户结算与后台人工建单上下文不能同时存在");
    }
    if (
      data.adminCreation
      && (!data.staffPrincipal || data.staffPrincipal.id !== data.adminCreation.actorId)
    ) {
      throw new BadRequestException("后台人工建单的员工身份上下文无效");
    }
    const operator: OperatorContext = data.operator ?? (
      data.adminCreation && data.staffPrincipal
        ? { type: OPERATOR_TYPE.ADMIN, id: data.staffPrincipal.id }
        : { type: OPERATOR_TYPE.SYSTEM }
    );
    if (
      !data.checkoutCustomer
      && operator.type === OPERATOR_TYPE.ADMIN
      && !data.adminCreation
    ) {
      throw new BadRequestException("后台人工建单缺少幂等上下文");
    }
    const adminIdempotency = data.adminCreation
      ? this.buildAdminOrderCreateIdempotency(data, operator)
      : null;
    if (adminIdempotency) {
      const replay = await this.prisma.$transaction(async (tx) => {
        await lockAuthorizedStaffForOrder(tx, data.staffPrincipal!, "ORDER_ADMIN");
        return this.findOrderCreateReplay(adminIdempotency, tx);
      });
      if (replay) return replay;
    }
    const customer = this.validateCustomerData(data);
    const quantities = this.normalizeItems(data.items);
    const skus = await this.prisma.productSKU.findMany({
      where: {
        id: { in: [...quantities.keys()] },
        isActive: true,
        product: data.checkoutCustomer
          ? directPurchaseProductWhere(data.checkoutCustomer)
          : directPurchaseProductBaseWhere(),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            code: true,
            inventoryPolicy: true,
            shippingTemplate: {
              select: {
                id: true,
                feeMode: true,
                baseFee: true,
                remoteSurcharge: true,
                freeShippingThreshold: true,
                excludedRegions: true,
                isActive: true,
              },
            },
            primaryImage: { select: { url: true } },
            images: {
              select: { url: true },
              orderBy: { sortOrder: "asc" },
              take: 1,
            },
          },
        },
      },
    });
    if (skus.length !== quantities.size)
      throw new BadRequestException(
        '订单中包含不可直接购买的商品（仅"直接购买"商品可下单，其余请走咨询/预约）',
      );
    assertZeroShippingCheckoutReady(skus.map((sku) => sku.product));

    // 一次性聚合所有 SKU 的可用库存，替代循环内 N 次 aggregate（避免 N+1）
    const stockRows = await this.prisma.inventory.groupBy({
      by: ["skuId"],
      where: {
        skuId: { in: skus.map((s) => s.id) },
        warehouse: { isActive: true },
      },
      _sum: { quantity: true },
    });
    const stockMap = new Map<number, number>();
    for (const r of stockRows) stockMap.set(r.skuId, r._sum.quantity ?? 0);

    // 用整数分累加，规避 JS Number 浮点误差（P1-18），最后转回 Decimal(10,2) 入库
    let totalCents = 0;
    const orderItems: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
    const singleUnitProductQuantities = new Map<number, number>();
    for (const sku of skus) {
      const quantity = quantities.get(sku.id)!;
      if (sku.product.inventoryPolicy === "SINGLE_UNIT") {
        const next =
          (singleUnitProductQuantities.get(sku.product.id) ?? 0) + quantity;
        if (quantity !== 1 || next > 1) {
          throw new ConflictException("一物一件商品每个订单最多购买 1 件");
        }
        singleUnitProductQuantities.set(sku.product.id, next);
      }
      const unitPrice = Number(sku.price);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new BadRequestException(`商品 ${sku.skuCode} 尚未设置有效售价`);
      }
      // Inventory 单一来源：无库存记录视为 0（不再 fallback sku.stock，DECISIONS D.1）
      const availableStock = stockMap.get(sku.id) ?? 0;
      if (availableStock < quantity) {
        throw new BadRequestException(`商品 ${sku.skuCode} 库存不足`);
      }
      const unitCents = Math.round(unitPrice * 100);
      const subtotalCents = unitCents * quantity;
      totalCents += subtotalCents;
      orderItems.push({
        skuId: sku.id,
        productId: sku.productId,
        quantity,
        unitPrice: new Prisma.Decimal(unitCents).div(100),
        subtotal: new Prisma.Decimal(subtotalCents).div(100),
        productNameSnapshot: sku.product.name,
        productCodeSnapshot: sku.product.code,
        productImageSnapshot:
          sku.product.primaryImage?.url || sku.product.images[0]?.url || null,
        skuSnapshot: [sku.skuCode, sku.material, sku.size]
          .filter(Boolean)
          .join(" / "),
      });
    }
    const totalAmount = new Prisma.Decimal(totalCents).div(100);

    // 营销生效：优惠券校验与试算（共享公式见 common/marketing/coupon-calculation）。
    // 预检在事务外给友好错误；并发安全由事务内的条件核销兜底。
    let preflightDiscountCents = 0;
    let coupon: Coupon | null = null;
    if (data.couponId) {
      const found = await this.prisma.coupon.findUnique({
        where: { id: data.couponId },
      });
      if (!found) throw new BadRequestException("优惠券不存在");
      const evaluation = evaluateCoupon(found, totalCents);
      if (!evaluation.ok) {
        throw new BadRequestException(evaluation.reason);
      }
      preflightDiscountCents = evaluation.discountCents;
      coupon = found;
    }

    const reservedAt = new Date();
    const expiresAt = this.getReservationExpiry(reservedAt);

    const run = () =>
      this.prisma.$transaction(async (tx) => {
        const transactionOperator = data.adminCreation
          ? await lockAuthorizedStaffForOrder(tx, data.staffPrincipal!, "ORDER_ADMIN")
          : operator;
        const lockedCheckoutAccess = data.checkoutCustomer
          ? await lockActiveCustomerForWrite(tx, data.checkoutCustomer)
          : undefined;
        // 商品写入口与结算共用商品行锁。先按稳定顺序锁定，再做事务内当前读，
        // 防止事务外试算后发生改价、停售、SKU 停用或销售模式切换仍按旧事实成交。
        const productIds = [...new Set(skus.map((sku) => sku.productId))]
          .sort((left, right) => left - right);
        for (const productId of productIds) {
          await this.lockTradeProduct(tx, productId);
        }
        const currentSkus = await tx.productSKU.findMany({
          where: {
            id: { in: [...quantities.keys()] },
            isActive: true,
            product: data.checkoutCustomer
              ? directPurchaseProductWhere(lockedCheckoutAccess)
              : directPurchaseProductBaseWhere(),
          },
          select: {
            id: true,
            productId: true,
            skuCode: true,
            price: true,
            product: {
              select: {
                inventoryPolicy: true,
                shippingTemplate: {
                  select: {
                    id: true,
                    feeMode: true,
                    baseFee: true,
                    remoteSurcharge: true,
                    freeShippingThreshold: true,
                    excludedRegions: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        });
        if (currentSkus.length !== skus.length) {
          throw new ConflictException(
            "商品销售资格或规格状态已变化，请刷新后重新确认",
          );
        }
        assertZeroShippingCheckoutReady(
          currentSkus.map((sku) => sku.product),
        );
        const currentSkuMap = new Map(currentSkus.map((sku) => [sku.id, sku]));
        for (const preflightSku of skus) {
          const currentSku = currentSkuMap.get(preflightSku.id);
          if (!currentSku) {
            throw new ConflictException(
              "商品销售资格或规格状态已变化，请刷新后重新确认",
            );
          }
          if (
            this.moneyToCents(currentSku.price, "商品售价") !==
            this.moneyToCents(preflightSku.price, "商品售价")
          ) {
            throw new ConflictException(
              `商品 ${preflightSku.skuCode} 价格已变化，请刷新后重新确认`,
            );
          }
          if (
            currentSku.productId !== preflightSku.productId ||
            currentSku.product.inventoryPolicy !==
              preflightSku.product.inventoryPolicy
          ) {
            throw new ConflictException(
              "商品库存策略已变化，请刷新后重新确认",
            );
          }
        }

        if (data.checkoutCustomer) {
          const currentCart = await tx.cart.findMany({
            where: { userId: data.checkoutCustomer.id },
            select: { skuId: true, quantity: true },
          });
          const currentQuantities = new Map<number, number>();
          for (const item of currentCart) {
            currentQuantities.set(
              item.skuId,
              (currentQuantities.get(item.skuId) ?? 0) + item.quantity,
            );
          }
          if (
            currentQuantities.size !== quantities.size ||
            [...quantities].some(
              ([skuId, quantity]) => currentQuantities.get(skuId) !== quantity,
            )
          ) {
            throw new ConflictException("购物车已发生变化，请刷新后重新确认");
          }
        }

        // 优惠券原子核销：事务内锁行并用同一公式重验，把试算时的经济条款绑定进条件更新。
        // 管理员并发改券或券被停用/领完时整单失败，不用旧折扣金额继续建单。
        let appliedDiscountCents = 0;
        let lockedCoupon: Coupon | null = null;
        let couponValidationTime: Date | null = null;
        if (coupon) {
          const now = new Date();
          const currentCoupon = await this.lockCouponForCheckout(tx, coupon.id);
          if (!hasSameCouponEconomicTerms(coupon, currentCoupon)) {
            throw new ConflictException("优惠券规则已变化，请刷新后重新选择");
          }
          const currentEvaluation = evaluateCoupon(currentCoupon, totalCents, now);
          if (!currentEvaluation.ok) {
            throw new BadRequestException(currentEvaluation.reason);
          }
          if (currentEvaluation.discountCents !== preflightDiscountCents) {
            throw new ConflictException("优惠券金额已变化，请刷新后重新选择");
          }
          appliedDiscountCents = currentEvaluation.discountCents;
          lockedCoupon = currentCoupon;
          couponValidationTime = now;
        }

        const order = await tx.order.create({
          data: {
            orderNo: await this.generateOrderNo(tx),
            customerId: data.customerId || null,
            customerName: customer.customerName,
            customerPhone: customer.customerPhone,
            customerEmail: data.customerEmail?.trim() || null,
            address: customer.address,
            totalAmount,
            // 持久化只使用锁内重验结果；事务外试算只用于友好提示与变化检测。
            discountAmount: new Prisma.Decimal(appliedDiscountCents).div(100),
            finalAmount: new Prisma.Decimal(
              totalCents - appliedDiscountCents,
            ).div(100),
            shippingAmount: new Prisma.Decimal(0),
            insuranceAmount: new Prisma.Decimal(0),
            taxAmount: new Prisma.Decimal(0),
            currency: "CNY",
            shippingAddressSnapshot: {
              version: 1,
              recipientName: customer.customerName,
              recipientPhone: customer.customerPhone,
              detail: customer.address,
              source: data.checkoutCustomer ? "CUSTOMER_CHECKOUT" : "STAFF_ORDER",
            },
            pricingSnapshot: {
              version: 1,
              currency: "CNY",
              itemSubtotalCents: totalCents,
              discountCents: appliedDiscountCents,
              shippingCents: 0,
              insuranceCents: 0,
              taxCents: 0,
              adjustmentCents: 0,
              finalCents: totalCents - appliedDiscountCents,
            },
            couponId: lockedCoupon?.id ?? null,
            // 标准零售成交价只认 ProductSKU.price；固定价订单不读取或锁定金价。
            lockedGoldPrice: null,
            // 客户标准零售下单后再由本人选择已开放的在线渠道；后台人工建单仍默认线下转账。
            paymentMethod: data.checkoutCustomer
              ? data.paymentMethod?.trim() || null
              : data.paymentMethod?.trim() || "bank_transfer",
            status: "PENDING_PAYMENT",
            orderType: data.orderType ?? "SPOT",
            salesConsultantId: data.salesConsultantId ?? null,
            source: data.source?.trim() || null,
            checkoutIdempotencyKeyHash:
              data.checkoutCustomer && data.checkoutIdempotency
                ? data.checkoutIdempotency.keyHash
                : adminIdempotency?.keyHash ?? null,
            checkoutRequestHash:
              data.checkoutCustomer && data.checkoutIdempotency
                ? data.checkoutIdempotency.requestHash
                : adminIdempotency?.requestHash ?? null,
            reservedAt,
            items: { create: orderItems },
          },
          include: { items: true },
        });

        // 编号分配成功后才核销券；编号冲突重试不会重复修改 usedCount。
        if (lockedCoupon && couponValidationTime) {
          const claimed = await tx.coupon.updateMany({
            where: {
              id: lockedCoupon.id,
              name: lockedCoupon.name,
              type: lockedCoupon.type,
              value: lockedCoupon.value,
              minAmount: lockedCoupon.minAmount,
              totalCount: lockedCoupon.totalCount,
              isActive: lockedCoupon.isActive,
              startTime: { equals: lockedCoupon.startTime, lte: couponValidationTime },
              endTime: { equals: lockedCoupon.endTime, gt: couponValidationTime },
              usedCount: { lt: this.prisma.coupon.fields.totalCount },
            },
            data: { usedCount: { increment: 1 } },
          });
          if (claimed.count === 0) {
            throw new ConflictException("优惠券已被领完、停用或规则已变化，请刷新后重选");
          }
        }

        for (const item of [...order.items].sort(
          (a, b) => a.productId - b.productId || a.skuId - b.skuId,
        )) {
          await this.reserveStock(
            tx,
            order.id,
            item.skuId,
            item.quantity,
            expiresAt,
          );
        }

        // 交易事件：订单创建 + 库存预占
        await this.tradeEvents.record(tx, {
          orderId: order.id,
          entityType: TRADE_ENTITY_TYPE.ORDER,
          entityId: order.id,
          eventType: TRADE_EVENT_TYPE.ORDER_CREATED,
          toStatus: "PENDING_PAYMENT",
          operator: transactionOperator,
          metadata: {
            totalAmount: totalAmount.toString(),
            itemCount: order.items.length,
          },
        });
        await this.tradeEvents.record(tx, {
          orderId: order.id,
          entityType: TRADE_ENTITY_TYPE.INVENTORY,
          entityId: order.id,
          eventType: TRADE_EVENT_TYPE.STOCK_RESERVED,
          toStatus: "PENDING_PAYMENT",
          operator: transactionOperator,
          reason: `预占 ${order.items.length} 个商品行，24h 内未付款自动释放`,
        });

        if (data.checkoutCustomer) {
          await tx.customer.update({
            where: { id: data.checkoutCustomer.id },
            data: { lastOrderAt: reservedAt },
          });
          await tx.cart.deleteMany({
            where: { userId: data.checkoutCustomer.id },
          });
          await this.reliableNotifications?.enqueueOrderCreated(tx, order);
        }

        return order;
      }, data.checkoutCustomer
        ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        : undefined);
    try {
      return await runWithDocumentNumberRetry({
        targetMarkers: ["orderNo", "order_no", "orders_order_no_key"],
        documentLabel: "订单",
        runTransaction: run,
      });
    } catch (error) {
      if (adminIdempotency && this.isOrderCreateIdempotencyRace(error)) {
        const replay = await this.prisma.$transaction(async (tx) => {
          await lockAuthorizedStaffForOrder(tx, data.staffPrincipal!, "ORDER_ADMIN");
          return this.findOrderCreateReplay(adminIdempotency, tx);
        });
        if (replay) return replay;
      }
      throw error;
    }
  }

  private buildAdminOrderCreateIdempotency(
    data: {
      customerId?: number;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      address: string;
      paymentMethod?: string;
      items: { skuId: number; quantity: number }[];
      orderType?: OrderType;
      salesConsultantId?: number;
      source?: string;
      couponId?: number;
      operator?: OperatorContext;
      adminCreation?: { actorId: number; idempotencyKey: string };
    },
    operator: OperatorContext,
  ) {
    const adminCreation = data.adminCreation!;
    if (
      operator.type !== OPERATOR_TYPE.ADMIN
      || !Number.isSafeInteger(operator.id)
      || operator.id !== adminCreation.actorId
    ) {
      throw new BadRequestException("后台人工建单的操作人上下文无效");
    }
    const key = parseIdempotencyKey(adminCreation.idempotencyKey, true)!;
    const quantities = new Map<number, number>();
    for (const item of data.items) {
      quantities.set(item.skuId, (quantities.get(item.skuId) ?? 0) + item.quantity);
    }
    const canonicalRequest = {
      version: 1,
      actorId: adminCreation.actorId,
      customerId: data.customerId ?? null,
      customerName: data.customerName.trim(),
      customerPhone: data.customerPhone.trim(),
      customerEmail: data.customerEmail?.trim() || null,
      address: data.address.trim(),
      paymentMethod: data.paymentMethod?.trim() || "bank_transfer",
      couponId: data.couponId ?? null,
      orderType: data.orderType ?? "SPOT",
      salesConsultantId: data.salesConsultantId ?? null,
      source: data.source?.trim() || null,
      items: [...quantities]
        .sort(([left], [right]) => left - right)
        .map(([skuId, quantity]) => ({ skuId, quantity })),
    };
    return {
      keyHash: createHash("sha256")
        .update("admin-order-create")
        .update("\0")
        .update(String(adminCreation.actorId))
        .update("\0")
        .update(key)
        .digest("hex"),
      requestHash: createHash("sha256")
        .update(JSON.stringify(canonicalRequest))
        .digest("hex"),
    };
  }

  private async findOrderCreateReplay(idempotency: {
    keyHash: string;
    requestHash: string;
  }, client: Pick<Prisma.TransactionClient, "order">) {
    const order = await client.order.findUnique({
      where: { checkoutIdempotencyKeyHash: idempotency.keyHash },
      include: { items: true },
    });
    if (!order) return null;
    if (order.checkoutRequestHash !== idempotency.requestHash) {
      throw new ConflictException(
        "该幂等键已用于不同的后台人工建单请求，请核对或放弃原待确认意图",
      );
    }
    return order;
  }

  private isOrderCreateIdempotencyRace(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError)
      || error.code !== "P2002"
    ) return false;
    const rawTarget = error.meta?.target;
    const target = (Array.isArray(rawTarget) ? rawTarget.join(",") : String(rawTarget ?? ""))
      .toLowerCase();
    return target.includes("checkout_idempotency_key_hash")
      || target.includes("checkoutidempotencykeyhash");
  }

  /**
   * 从报价单创建订单（独立事务 + orderNo 冲突重试）。
   * 与 create 的区别：不校验 salesMode（报价商品可任意销售模式）、用报价金额和 snapshot、不重新算价。
   * 若需与报价单状态推进同事务（原子转单，避免孤儿订单竞态），请改用 createOrderFromQuotationInTx。
   */
  async createFromQuotation(data: {
    quotationId: number;
    quotationVersionId?: number;
    customerId?: number;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    address: string;
    salesConsultantId?: number;
    orderType?: OrderType;
    totalAmount: number | string;
    discountAmount?: number | string;
    finalAmount: number | string;
    depositAmount?: number | string;
    items: Array<{
      skuId: number;
      productId: number;
      productName: string;
      productImage?: string | null;
      productCode?: string | null;
      skuSnapshot?: string | null;
      quantity: number;
      unitPrice: number | string;
      subtotal: number | string;
    }>;
    operator?: OperatorContext;
  }) {
    const operator: OperatorContext = data.operator ?? {
      type: OPERATOR_TYPE.ADMIN,
    };
    const customer = this.validateCustomerData(data);
    const reservedAt = new Date();
    const expiresAt = this.getReservationExpiry(reservedAt);
    const latestGoldPrice = await this.prisma.goldPrice.findFirst({
      orderBy: { recordDate: "desc" },
    });

    const context = {
      operator,
      customer,
      reservedAt,
      expiresAt,
      latestGoldPrice,
    };
    return runWithDocumentNumberRetry({
      targetMarkers: ["orderNo", "order_no", "orders_order_no_key"],
      documentLabel: "订单",
      runTransaction: () =>
        this.prisma.$transaction((tx) =>
          this.createOrderFromQuotationInTx(tx, data, context),
        ),
    });
  }

  /**
   * 在指定事务内创建报价转单订单（核心逻辑，与 createFromQuotation 分离）。
   * 供 createFromQuotation（独立事务）与 QuotationsService.convertToOrder（同事务原子转单）复用，
   * 调用方负责事务边界、orderNo 冲突重试与报价单状态推进——本方法只做"建订单 + 预占库存 + 记事件"。
   */
  async createOrderFromQuotationInTx(
    tx: Prisma.TransactionClient,
    data: {
      quotationId: number;
      quotationVersionId?: number;
      channel?: "RETAIL" | "CUSTOM" | "PARTNER_WAX";
      customerId?: number;
      customerAccountTypeSnapshot?: "MEMBER" | "PARTNER";
      confirmedAt?: Date;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      address: string;
      salesConsultantId?: number;
      orderType?: OrderType;
      totalAmount: number | string;
      discountAmount?: number | string;
      feeAmount?: number | string;
      finalAmount: number | string;
      depositAmount?: number | string;
      transactionSnapshot?: Prisma.JsonObject;
      transactionSnapshotHash?: string;
      items: Array<{
        quotationVersionItemId?: number;
        skuId?: number | null;
        productId?: number | null;
        waxType?: "RED" | "PURPLE" | null;
        productName: string;
        productImage?: string | null;
        productCode?: string | null;
        skuSnapshot?: string | null;
        quantity: number;
        unitPrice: number | string;
        subtotal: number | string;
        description?: string;
        pricingSnapshot?: Prisma.JsonValue;
      }>;
      resourceRequirements?: Array<{
        quotationRequirementId: number;
        resourceBucketId: number;
        resourceBucketVersion: number;
        quantity: number | string;
      }>;
    },
    context: {
      operator: OperatorContext;
      customer: {
        customerName: string;
        customerPhone: string;
        address: string;
      };
      reservedAt: Date;
      expiresAt: Date;
      latestGoldPrice: { price: Prisma.Decimal } | null;
    },
  ) {
    const { operator, customer, reservedAt, expiresAt, latestGoldPrice } =
      context;
    if (!data.items?.length)
      throw new BadRequestException("报价单无商品，不可转订单");

    const channel = data.channel ?? "RETAIL";
    const retailItems = data.items.filter(
      (item): item is typeof item & { skuId: number; productId: number } =>
        item.skuId != null && item.productId != null,
    );
    if (channel === "RETAIL" && retailItems.length !== data.items.length) {
      throw new BadRequestException("零售报价单每一行都必须关联商品规格");
    }
    const quoteSkuIds = [...new Set(retailItems.map((item) => item.skuId))];
    if (channel === "RETAIL" && quoteSkuIds.length !== retailItems.length) {
      throw new BadRequestException("报价单不能包含重复的商品规格");
    }
    const quoteSkus = channel === "RETAIL" ? await tx.productSKU.findMany({
      where: { id: { in: quoteSkuIds } },
      select: {
        id: true,
        productId: true,
        product: {
          select: {
            inventoryPolicy: true,
            shippingTemplate: {
              select: {
                id: true,
                feeMode: true,
                baseFee: true,
                remoteSurcharge: true,
                freeShippingThreshold: true,
                excludedRegions: true,
                isActive: true,
              },
            },
          },
        },
      },
    }) : [];
    if (channel === "RETAIL" && quoteSkus.length !== quoteSkuIds.length) {
      throw new BadRequestException("报价单包含不存在的商品规格");
    }
    if (channel === "RETAIL") {
      assertZeroShippingCheckoutReady(
        quoteSkus.map((sku) => sku.product),
      );
    }
    const quoteSkuFacts = new Map(
      quoteSkus.map((sku) => [
        sku.id,
        { productId: sku.productId, inventoryPolicy: sku.product.inventoryPolicy },
      ]),
    );
    const singleUnitQuoteQuantities = new Map<number, number>();
    for (const item of retailItems) {
      const skuFacts = quoteSkuFacts.get(item.skuId)!;
      if (skuFacts.productId !== item.productId) {
        throw new BadRequestException("报价单商品与规格不匹配");
      }
      if (skuFacts.inventoryPolicy !== "SINGLE_UNIT") continue;
      const next =
        (singleUnitQuoteQuantities.get(skuFacts.productId) ?? 0) + item.quantity;
      if (item.quantity !== 1 || next > 1) {
        throw new ConflictException("一物一件商品每个订单最多购买 1 件");
      }
      singleUnitQuoteQuantities.set(skuFacts.productId, next);
    }

    // 金额统一用整数分计算后转 Decimal，规避浮点误差
    const toDecimal = (v: number | string) =>
      new Prisma.Decimal(Math.round(Number(v) * 100)).div(100);
    const balanceCents = Math.max(
      0,
      Math.round(Number(data.finalAmount) * 100) -
        Math.round(Number(data.depositAmount || 0) * 100),
    );

    const orderItems: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] =
      channel === "RETAIL" ? retailItems.map((it) => ({
        skuId: it.skuId,
        productId: it.productId,
        quantity: it.quantity,
        unitPrice: toDecimal(it.unitPrice),
        subtotal: toDecimal(it.subtotal),
        productNameSnapshot: it.productName,
        productImageSnapshot: it.productImage ?? null,
        productCodeSnapshot: it.productCode ?? null,
        skuSnapshot: it.skuSnapshot ?? null,
      })) : [];

    const quotedLines: Prisma.QuotedOrderLineUncheckedCreateWithoutOrderInput[] =
      channel === "RETAIL" ? [] : data.items.map((item) => {
        if (!item.quotationVersionItemId) {
          throw new BadRequestException("定制报价行缺少不可变版本标识");
        }
        return {
          quotationVersionItemId: item.quotationVersionItemId,
          productId: item.productId ?? null,
          skuId: item.skuId ?? null,
          waxType: item.waxType ?? null,
          description: item.description ?? item.productName,
          quantity: item.quantity,
          unitAmount: toDecimal(item.unitPrice),
          lineAmount: toDecimal(item.subtotal),
          pricingSnapshot: item.pricingSnapshot ?? {},
        };
      });

    const order = await tx.order.create({
      data: {
        orderNo: await this.generateOrderNo(tx),
        customerId: data.customerId || null,
        customerName: customer.customerName,
        customerPhone: customer.customerPhone,
        customerEmail: data.customerEmail?.trim() || null,
        address: customer.address,
        totalAmount: toDecimal(data.totalAmount),
        discountAmount: toDecimal(data.discountAmount || 0),
        feeAmount: toDecimal(data.feeAmount || 0),
        finalAmount: toDecimal(data.finalAmount),
        shippingAmount: new Prisma.Decimal(0),
        insuranceAmount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        currency: "CNY",
        shippingAddressSnapshot: {
          version: 1,
          recipientName: customer.customerName,
          recipientPhone: customer.customerPhone,
          detail: customer.address,
          source: "QUOTATION",
        },
        pricingSnapshot: {
          version: 1,
          currency: "CNY",
          itemSubtotalCents: Math.round(Number(data.totalAmount) * 100),
          discountCents: Math.round(Number(data.discountAmount || 0) * 100),
          shippingCents: 0,
          insuranceCents: 0,
          taxCents: 0,
          adjustmentCents: 0,
          finalCents: Math.round(Number(data.finalAmount) * 100),
          feeCents: Math.round(Number(data.feeAmount || 0) * 100),
          quotationId: data.quotationId,
          quotationVersionId: data.quotationVersionId ?? null,
        },
        depositAmount: toDecimal(data.depositAmount || 0),
        balanceAmount: new Prisma.Decimal(balanceCents).div(100),
        lockedGoldPrice: latestGoldPrice?.price || null,
        paymentMethod: null,
        status: "PENDING_PAYMENT",
        orderType: data.orderType ?? "SPOT",
        salesConsultantId: data.salesConsultantId ?? null,
        source: "quotation",
        quotationVersionId: data.quotationVersionId ?? null,
        ...(data.transactionSnapshot
          ? {
              quoteChannel: data.channel ?? null,
              customerAccountTypeSnapshot: data.customerAccountTypeSnapshot ?? null,
              confirmedByCustomerId: data.customerId ?? null,
              confirmedAt: data.confirmedAt ?? null,
              snapshotSchemaVersion: 2,
              transactionSnapshot: data.transactionSnapshot,
              transactionSnapshotHash: data.transactionSnapshotHash ?? null,
            }
          : {}),
        reservedAt,
        ...(orderItems.length ? { items: { create: orderItems } } : {}),
        ...(quotedLines.length ? { quotedLines: { create: quotedLines } } : {}),
      },
      include: { items: true, quotedLines: true },
    });

    if (channel === "RETAIL") {
      for (const item of [...order.items].sort(
        (a, b) => a.productId - b.productId || a.skuId - b.skuId,
      )) {
        await this.reserveStock(
          tx,
          order.id,
          item.skuId,
          item.quantity,
          expiresAt,
        );
      }
    } else {
      for (const requirement of [...(data.resourceRequirements ?? [])].sort(
        (left, right) => left.resourceBucketId - right.resourceBucketId,
      )) {
        const quantity = new Prisma.Decimal(requirement.quantity).toDecimalPlaces(3);
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM trade_resource_buckets WHERE id = ${requirement.resourceBucketId} FOR UPDATE`,
        );
        const currentBucket = await tx.tradeResourceBucket.findUnique({
          where: { id: requirement.resourceBucketId },
          select: {
            channel: true,
            isActive: true,
            availableQuantity: true,
            reservedQuantity: true,
            version: true,
          },
        });
        if (
          !currentBucket ||
          !currentBucket.isActive ||
          currentBucket.channel !== channel ||
          currentBucket.version !== requirement.resourceBucketVersion ||
          currentBucket.availableQuantity.minus(currentBucket.reservedQuantity).lt(quantity)
        ) {
          throw new ConflictException("RESOURCE_INSUFFICIENT");
        }
        const reserved = await tx.tradeResourceBucket.updateMany({
          where: {
            id: requirement.resourceBucketId,
            isActive: true,
            channel,
            version: requirement.resourceBucketVersion,
          },
          data: {
            reservedQuantity: { increment: quantity },
            version: { increment: 1 },
          },
        });
        if (reserved.count !== 1) {
          throw new ConflictException("RESOURCE_INSUFFICIENT");
        }
        await tx.orderResourceReservation.create({
          data: {
            orderId: order.id,
            quotationRequirementId: requirement.quotationRequirementId,
            resourceBucketId: requirement.resourceBucketId,
            quantity,
            status: "RESERVED",
            reservedAt,
          },
        });
      }
    }

    await this.tradeEvents.record(tx, {
      orderId: order.id,
      entityType: TRADE_ENTITY_TYPE.ORDER,
      entityId: order.id,
      eventType: TRADE_EVENT_TYPE.ORDER_CREATED,
      toStatus: "PENDING_PAYMENT",
      operator,
      metadata: {
        totalAmount: order.totalAmount.toString(),
        itemCount: order.items.length + order.quotedLines.length,
        fromQuotationId: data.quotationId,
      },
    });
    if (channel === "RETAIL") {
      await this.tradeEvents.record(tx, {
        orderId: order.id,
        entityType: TRADE_ENTITY_TYPE.INVENTORY,
        entityId: order.id,
        eventType: TRADE_EVENT_TYPE.STOCK_RESERVED,
        toStatus: "PENDING_PAYMENT",
        operator,
        reason: `报价单 #${data.quotationId} 转订单预占 ${order.items.length} 个商品行`,
      });
    }
    return order;
  }

  async submitOfflinePaymentProof(
    principal: Pick<CustomerPrincipal, "id" | "authVersion">,
    orderId: number,
    assetId: number,
    proofKey: string,
    operator?: OperatorContext,
  ) {
    const customerId = principal.id;
    const actor: OperatorContext = operator ?? {
      type: OPERATOR_TYPE.CUSTOMER,
      id: customerId,
    };
    const resolvedProof = resolveCustomerPaymentProof(customerId, proofKey);
    if (!resolvedProof) {
      throw new BadRequestException("付款凭证必须是当前客户上传的私有图片");
    }
    const normalizedProofKey = resolvedProof.storageKey;
    if (!(await this.storedPaymentProofExists(customerId, normalizedProofKey))) {
      throw new BadRequestException("付款凭证不存在或已失效，请重新上传");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 付款凭证的客户级配额以客户行为串行点；所有此路径固定先锁客户、再锁订单。
      await lockActiveCustomerForWrite(tx, principal);
      const accessibleOrder = await tx.order.findFirst({
        where: { id: orderId, customerId },
        select: { id: true },
      });
      if (!accessibleOrder) throw new NotFoundException("订单不存在或无权操作");
      await this.lockOrderForTrade(tx, accessibleOrder.id);
      const order = await tx.order.findUnique({
        where: { id: accessibleOrder.id },
        include: { paymentPlans: { select: { id: true } } },
      });
      if (!order) throw new NotFoundException("订单不存在或无权操作");
      const submittedAsset = await tx.paymentProofAsset.findUnique({
        where: { id: assetId },
        select: {
          storageKey: true,
          customerId: true,
          orderId: true,
          paymentId: true,
          submissionOrderId: true,
          status: true,
        },
      });
      if (
        !submittedAsset
        || submittedAsset.storageKey !== normalizedProofKey
        || submittedAsset.customerId !== customerId
        || submittedAsset.submissionOrderId !== orderId
      ) {
        throw new ConflictException("付款凭证归属不一致，请重新上传");
      }
      if (submittedAsset.status === "ATTACHED" && submittedAsset.orderId === orderId) {
        if (submittedAsset.paymentId === null) {
          throw new ConflictException("付款凭证缺少原付款关联，请联系人工核对");
        }
        const replayPayment = await tx.payment.findUnique({
          where: { id: submittedAsset.paymentId },
        });
        if (!replayPayment || replayPayment.orderId !== orderId) {
          throw new ConflictException("原付款记录不存在或归属不一致，请联系人工核对");
        }
        return { order, payment: replayPayment };
      }
      if (order.status !== "PENDING_PAYMENT")
        throw new BadRequestException("当前订单不能提交付款凭证");
      if (await this.expireReservationIfNeeded(tx, order.id)) {
        return {
          order: null,
          payment: null as null | {
            id: number;
            orderId: number;
            proofUrl: string | null;
          },
        };
      }

      const pendingOnline = await tx.payment.findFirst({
        where: {
          orderId,
          status: "PENDING",
          method: { in: ["alipay", "wechat"] },
        },
        select: { paymentNo: true },
      });
      if (pendingOnline) {
        throw new BadRequestException(
          `订单已有在线待支付交易 ${pendingOnline.paymentNo}，不能同时提交线下凭证`,
        );
      }

      const pendingProofPayment = await tx.payment.findFirst({
        where: {
          orderId,
          status: "PENDING",
          method: "bank_transfer",
          proofUrl: { not: null },
        },
        select: { paymentNo: true },
      });
      if (pendingProofPayment) {
        throw new ConflictException(
          `付款 ${pendingProofPayment.paymentNo} 已有待审核付款凭证，不能用新凭证覆盖`,
        );
      }

      const claim = await this.claimPaymentProofAsset(
        tx,
        customerId,
        orderId,
        assetId,
        normalizedProofKey,
      );
      if (claim.replayed) {
        const replayPayment = await tx.payment.findUnique({
          where: { id: claim.paymentId },
        });
        if (!replayPayment || replayPayment.orderId !== orderId) {
          throw new ConflictException("原付款记录不存在或归属不一致，请联系人工核对");
        }
        return { order, payment: replayPayment };
      }

      let payment;
      if (
        order.quotationVersionId != null ||
        (order.paymentPlans?.length ?? 0) > 0
      ) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM payment_plans WHERE order_id = ${orderId} FOR UPDATE`,
        );
        const plan = await tx.paymentPlan.findUnique({
          where: { orderId },
          include: {
            installments: {
              orderBy: { sequence: "asc" },
              include: { payment: true },
            },
          },
        });
        if (!plan || plan.status !== "ACTIVE") {
          throw new BadRequestException("订单缺少生效付款计划，不能提交付款凭证");
        }
        const planCents = this.moneyToCents(plan.totalAmount, "付款计划总额");
        const installmentTotalCents = plan.installments.reduce(
          (sum, installment) =>
            sum + this.moneyToCents(installment.amount, "分期金额"),
          0,
        );
        if (
          plan.currency !== order.currency ||
          planCents !== this.moneyToCents(order.finalAmount, "订单应收金额") ||
          installmentTotalCents !== planCents ||
          plan.installments.some((installment) => installment.status === "WAIVED") ||
          (order.quotationVersionId != null &&
            plan.quotationVersionId !== order.quotationVersionId)
        ) {
          throw new ConflictException("付款计划与订单金额或币种不一致");
        }
        const nextIndex = plan.installments.findIndex(
          (installment) => installment.status === "PENDING",
        );
        if (
          nextIndex < 0 ||
          plan.installments
            .slice(0, nextIndex)
            .some((installment) => installment.status !== "PAID")
        ) {
          throw new ConflictException("付款计划没有可提交凭证的下一期");
        }
        const installment = plan.installments[nextIndex];
        const installmentTypes = plan.installments.map((planInstallment) =>
          resolveInstallmentPaymentType({
            finalCents: this.moneyToCents(order.finalAmount, "订单应收金额"),
            depositCents: this.moneyToCents(order.depositAmount, "订单定金金额"),
            balanceCents: this.moneyToCents(order.balanceAmount, "订单尾款金额"),
            installmentCount: plan.installments.length,
            sequence: planInstallment.sequence,
            label: planInstallment.label,
            amountCents: this.moneyToCents(planInstallment.amount, "分期金额"),
          }),
        );
        if (installmentTypes.some((type) => type === null)) {
          throw new ConflictException("付款计划与订单冻结金额拆分不一致");
        }
        const installmentType = installmentTypes[nextIndex]!;
        if (installment.paymentId !== null) {
          const boundPayment = installment.payment;
          if (
            !boundPayment ||
            boundPayment.status !== "PENDING" ||
            boundPayment.method !== "bank_transfer" ||
            boundPayment.orderId !== orderId ||
            boundPayment.type !== installmentType ||
            this.moneyToCents(boundPayment.amount, "付款金额") !==
              this.moneyToCents(installment.amount, "分期金额")
          ) {
            throw new ConflictException("下一期已绑定不一致的付款记录，请先完成对账");
          }
          payment = await tx.payment.update({
            where: { id: boundPayment.id },
            data: {
              proofUrl: normalizedProofKey,
              reviewedBy: null,
              reviewedAt: null,
              reviewNote: null,
            },
          });
        } else {
          const pendingPayment = await tx.payment.findFirst({
            where: { orderId, status: "PENDING" },
            select: { paymentNo: true },
          });
          if (pendingPayment) {
            throw new ConflictException(
              `订单已有未绑定分期的待处理付款 ${pendingPayment.paymentNo}，请先完成对账`,
            );
          }
          payment = await tx.payment.create({
            data: {
              orderId,
              paymentNo: this.createPaymentNo(),
              amount: installment.amount,
              method: "bank_transfer",
              type: installmentType,
              status: "PENDING",
              proofUrl: normalizedProofKey,
            },
          });
          const bound = await tx.paymentPlanInstallment.updateMany({
            where: {
              id: installment.id,
              paymentPlanId: plan.id,
              status: "PENDING",
              paymentId: null,
            },
            data: { paymentId: payment.id },
          });
          if (bound.count !== 1) {
            throw new ConflictException("下一期付款状态已变化，请刷新后重试");
          }
        }
      } else {
        const existingPayment = await tx.payment.findFirst({
          where: {
            orderId,
            type: "FULL",
            method: "bank_transfer",
            status: { in: ["PENDING", "FAILED"] },
          },
          orderBy: { createdAt: "desc" },
        });
        payment = existingPayment
          ? await tx.payment.update({
              where: { id: existingPayment.id },
              data: {
                method: "bank_transfer",
                status: "PENDING",
                proofUrl: normalizedProofKey,
                reviewedBy: null,
                reviewedAt: null,
                reviewNote: null,
              },
            })
          : await tx.payment.create({
              data: {
                orderId,
                paymentNo: this.createPaymentNo(),
                amount: order.finalAmount,
                method: "bank_transfer",
                type: "FULL",
                status: "PENDING",
                proofUrl: normalizedProofKey,
              },
            });
      }
      const linkedAsset = await tx.paymentProofAsset.updateMany({
        where: {
          id: claim.assetId,
          customerId,
          orderId,
          status: "ATTACHED",
          paymentId: null,
        },
        data: { paymentId: payment.id },
      });
      if (linkedAsset.count !== 1) {
        throw new ConflictException("付款凭证与付款记录关联失败，请刷新后重试");
      }
      await tx.order.update({
        where: { id: orderId },
        data: {
          paymentMethod: "bank_transfer",
          paymentProof: normalizedProofKey,
        },
      });
      await this.tradeEvents.record(tx, {
        orderId: order.id,
        entityType: TRADE_ENTITY_TYPE.PAYMENT,
        entityId: payment.id,
        eventType: TRADE_EVENT_TYPE.PAYMENT_PROOF_SUBMITTED,
        operator: actor,
        metadata: { hasProof: true },
      });
      return { order, payment };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result.order)
      throw new BadRequestException("订单的库存保留已到期，请重新下单");
    // 凭证提交响应只返回安全支付字段：私有凭证路径、审核字段与渠道原始数据不外发
    //（与 findForCustomer 的支付白名单同口径）。
    const {
      proofUrl,
      gatewayTradeNo,
      gatewayNotify,
      reviewedBy,
      reviewNote,
      ...safePayment
    } = result.payment;
    return { ...safePayment, hasProof: Boolean(proofUrl) };
  }

  /**
   * 确认收款（乐观锁推进 PENDING→PAID，消费预占，订单进入待发货）。
   * 两个来源共用同一核销管线：
   * - 线下转账：人工审核（method=bank_transfer 且有付款凭证）；
   * - 在线网关：回调验签通过后自动核销（method=alipay/wechat，传 gateway 信息）。
   */
  async confirmPaymentSettlement(
    paymentId: number,
    reviewerId: number | null,
    reviewNote?: string,
    operator?: OperatorContext,
    gateway?: { tradeNo: string; notify: Prisma.InputJsonValue },
    options: {
      customerPrincipal?: Pick<CustomerPrincipal, "id" | "authVersion">;
      staffPrincipal?: Pick<StaffPrincipal, "id">;
      staffAuthorization?: StaffPaymentAuthorization;
    } = {},
  ) {
    const fallbackActor: OperatorContext = operator ?? {
      type: OPERATOR_TYPE.ADMIN,
      id: reviewerId ?? undefined,
    };
    const locatedPayment = options.staffPrincipal
      ? null
      : await this.prisma.payment.findUnique({
          where: { id: paymentId },
          select: { orderId: true },
        });
    if (!options.staffPrincipal && !locatedPayment) {
      throw new NotFoundException("付款记录不存在");
    }
    return this.prisma.$transaction(async (tx) => {
      const actor = options.staffPrincipal
        ? await lockAuthorizedStaffForPayment(
            tx,
            options.staffPrincipal,
            options.staffAuthorization ?? "PAYMENT_ADMIN",
          )
        : fallbackActor;
      if (options.customerPrincipal) {
        await lockActiveCustomerForWrite(tx, options.customerPrincipal);
      }
      const paymentRef = locatedPayment ?? await tx.payment.findUnique({
          where: { id: paymentId },
          select: { orderId: true },
        });
      if (!paymentRef) throw new NotFoundException("付款记录不存在");
      await this.lockOrderForTrade(tx, paymentRef.orderId);

      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          order: {
            include: {
              items: true,
              paymentPlans: { select: { id: true } },
            },
          },
          installment: {
            include: { paymentPlan: { include: { installments: true } } },
          },
        },
      });
      if (!payment || payment.orderId !== paymentRef.orderId) {
        throw new NotFoundException("付款记录不存在");
      }
      const isOnlineChannel = payment.method === "alipay" || payment.method === "wechat";
      const allowedStatuses: PaymentStatus[] = gateway
        ? ["PENDING", "FAILED"]
        : ["PENDING"];
      if (!gateway && payment.status !== "PENDING") {
        const sameManualApproval =
          payment.status === "PAID" &&
          payment.method === "bank_transfer" &&
          Boolean(payment.proofUrl) &&
          payment.reviewedBy === reviewerId &&
          Boolean(payment.reviewedAt) &&
          (payment.reviewNote?.trim() || "") === (reviewNote?.trim() || "");
        if (sameManualApproval) {
          return tx.payment.findUnique({ where: { id: paymentId } });
        }
        throw new ConflictException("付款审核结果已变化，请刷新后核对");
      }
      const eligible =
        allowedStatuses.includes(payment.status) &&
        ((payment.method === "bank_transfer" && !!payment.proofUrl) ||
          (isOnlineChannel && !!gateway));
      if (!eligible) {
        throw new BadRequestException("该付款记录不满足确认收款条件");
      }
      const installment = payment.installment;
      const isPlanOrder =
        payment.order.quotationVersionId != null ||
        (payment.order.paymentPlans?.length ?? 0) > 0;
      if (isPlanOrder && !installment) {
        throw new BadRequestException("付款计划订单的付款未绑定分期，已拒绝核销");
      }
      if (installment) {
        const plan = installment.paymentPlan;
        const orderedInstallments = [...plan.installments].sort(
          (left, right) => left.sequence - right.sequence,
        );
        const installmentIndex = orderedInstallments.findIndex(
          (candidate) => candidate.id === installment.id,
        );
        if (
          plan.orderId !== payment.orderId ||
          plan.status !== "ACTIVE" ||
          installment.status !== "PENDING" ||
          installment.paymentId !== payment.id ||
          installmentIndex < 0 ||
          orderedInstallments
            .slice(0, installmentIndex)
            .some((candidate) => candidate.status !== "PAID") ||
          this.moneyToCents(installment.amount, "分期金额") !==
            this.moneyToCents(payment.amount, "付款金额") ||
          plan.currency !== payment.order.currency ||
          this.moneyToCents(plan.totalAmount, "付款计划总额") !==
            this.moneyToCents(payment.order.finalAmount, "订单应收金额") ||
          orderedInstallments.reduce(
            (sum, candidate) =>
              sum + this.moneyToCents(candidate.amount, "分期金额"),
            0,
          ) !== this.moneyToCents(plan.totalAmount, "付款计划总额") ||
          orderedInstallments.some((candidate) => candidate.status === "WAIVED") ||
          (payment.order.quotationVersionId != null &&
            plan.quotationVersionId !== payment.order.quotationVersionId)
        ) {
          throw new ConflictException("付款记录与生效分期计划不一致，已拒绝核销");
        }
      }
      if (gateway) {
        if (
          payment.gatewayTradeNo &&
          payment.gatewayTradeNo !== gateway.tradeNo
        ) {
          throw new ConflictException("付款已绑定另一渠道交易号");
        }
        const reusedGatewayTrade = await tx.payment.findFirst({
          where: {
            id: { not: paymentId },
            gatewayTradeNo: gateway.tradeNo,
          },
          select: { id: true },
        });
        if (reusedGatewayTrade) {
          throw new ConflictException("渠道交易号已绑定另一付款记录");
        }
      }
      if (payment.order.status !== "PENDING_PAYMENT") {
        throw new BadRequestException("订单状态已变化，不能确认收款");
      }

      const now = new Date();
      // 乐观锁推进 Payment；网关成功回调可恢复一次“创建请求结果不确定”而被标记 FAILED 的在线交易。
      const updated = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: allowedStatuses } },
        data: {
          status: "PAID",
          paidAt: now,
          reviewedBy: reviewerId,
          reviewedAt: now,
          reviewNote: reviewNote?.trim() || null,
          ...(gateway
            ? { gatewayTradeNo: gateway.tradeNo, gatewayNotify: gateway.notify }
            : {}),
        },
      });
      if (updated.count === 0) {
        throw new BadRequestException("该付款记录已被处理，请刷新后重试");
      }

      if (installment) {
        const advancedInstallment = await tx.paymentPlanInstallment.updateMany({
          where: {
            id: installment.id,
            paymentId: payment.id,
            status: "PENDING",
          },
          data: { status: "PAID", paidAt: now },
        });
        if (advancedInstallment.count !== 1) {
          throw new ConflictException("分期状态已变化，请刷新后重试");
        }
        const remainingInstallments = await tx.paymentPlanInstallment.count({
          where: {
            paymentPlanId: installment.paymentPlanId,
            status: { not: "PAID" },
          },
        });
        if (remainingInstallments === 0) {
          const completedPlan = await tx.paymentPlan.updateMany({
            where: { id: installment.paymentPlanId, status: "ACTIVE" },
            data: { status: "COMPLETED" },
          });
          if (completedPlan.count !== 1) {
            throw new ConflictException("付款计划状态已变化，请刷新后重试");
          }
        }
        if (
          payment.order.orderType === "CUSTOM" &&
          installment.paymentPlan.installments.length > 1
        ) {
          await tx.order.update({
            where: { id: payment.orderId },
            data:
              installment.sequence === 1
                ? { paidDeposit: installment.amount, customStage: "DEPOSIT_PAID" }
                : { paidBalance: installment.amount, customStage: "BALANCE_PAID" },
          });
        }
      }

      const settlement = await this.applyConfirmedPaymentToOrder(
        tx,
        payment.order,
        payment.method,
        now,
        actor,
        gateway ? "网关确认到账，预占转为实扣" : "线下收款确认，预占转为实扣",
      );

      await this.tradeEvents.record(tx, {
        orderId: payment.orderId,
        entityType: TRADE_ENTITY_TYPE.PAYMENT,
        entityId: paymentId,
        eventType: TRADE_EVENT_TYPE.PAYMENT_APPROVED,
        fromStatus: payment.status,
        toStatus: "PAID",
        operator: actor,
        reason: reviewNote?.trim() || null,
        metadata: { method: payment.method, gateway: !!gateway },
      });

      if (payment.order.customerId) {
        await this.reliableNotifications?.enqueuePaymentConfirmed(tx, {
          id: payment.order.id,
          orderNo: payment.order.orderNo,
          customerId: payment.order.customerId,
          customerEmail: payment.order.customerEmail,
          finalAmount: payment.order.finalAmount,
          paymentId: payment.id,
          paymentAmount: payment.amount,
          cumulativePaidCents: settlement.paidCents,
        });
      }

      return tx.payment.findUnique({ where: { id: paymentId } });
    });
  }

  async failPendingPaymentAttempt(
    paymentId: number,
    reason: string,
    operator: OperatorContext = { type: OPERATOR_TYPE.SYSTEM },
    options: {
      reviewerId?: number;
      expectedMethod?: string;
      customerPrincipal?: Pick<CustomerPrincipal, "id" | "authVersion">;
      staffPrincipal?: Pick<StaffPrincipal, "id">;
      staffAuthorization?: StaffPaymentAuthorization;
    } = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const effectiveOperator = options.staffPrincipal
        ? await lockAuthorizedStaffForPayment(
            tx,
            options.staffPrincipal,
            options.staffAuthorization ?? "PAYMENT_ADMIN",
          )
        : operator;
      if (options.customerPrincipal) {
        await lockActiveCustomerForWrite(tx, options.customerPrincipal);
      }
      const paymentRef = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { orderId: true },
      });
      if (!paymentRef) throw new NotFoundException("付款记录不存在");
      await this.lockOrderForTrade(tx, paymentRef.orderId);
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { installment: true },
      });
      if (!payment || payment.orderId !== paymentRef.orderId) {
        throw new NotFoundException("付款记录不存在");
      }
      if (options.expectedMethod && payment.method !== options.expectedMethod) {
        throw new BadRequestException("付款方式与失败处理入口不匹配");
      }
      if (payment.status !== "PENDING") {
        if (options.reviewerId !== undefined) {
          const sameManualRejection =
            payment.status === "FAILED" &&
            payment.reviewedBy === options.reviewerId &&
            Boolean(payment.reviewedAt) &&
            (payment.reviewNote?.trim() || "") === reason.trim();
          if (sameManualRejection) return payment;
          throw new ConflictException("付款审核结果已变化，请刷新后核对");
        }
        return payment;
      }

      const now = new Date();
      const failed = await tx.payment.updateMany({
        where: { id: paymentId, status: "PENDING" },
        data: {
          status: "FAILED",
          reviewedBy: options.reviewerId ?? null,
          reviewedAt: options.reviewerId !== undefined ? now : null,
          reviewNote: reason.trim(),
        },
      });
      if (failed.count !== 1) {
        throw new ConflictException("付款状态已变化，请刷新后重试");
      }
      if (payment.installment) {
        const released = await tx.paymentPlanInstallment.updateMany({
          where: {
            id: payment.installment.id,
            paymentId,
            status: "PENDING",
          },
          data: { paymentId: null, paidAt: null },
        });
        if (released.count !== 1) {
          throw new ConflictException("分期绑定状态已变化，请先完成对账");
        }
      }
      await this.tradeEvents.record(tx, {
        orderId: payment.orderId,
        entityType: TRADE_ENTITY_TYPE.PAYMENT,
        entityId: payment.id,
        eventType: TRADE_EVENT_TYPE.PAYMENT_REJECTED,
        fromStatus: "PENDING",
        toStatus: "FAILED",
        operator: effectiveOperator,
        reason: reason.trim(),
      });
      return tx.payment.findUnique({ where: { id: paymentId } });
    });
  }

  /**
   * 后台登记异常线下实收。该入口不能登记微信/支付宝等网关收款；在线到账只认验签回调。
   * 订单是否进入履约只看累计确认金额，不看人工选择的 FULL/BALANCE 标签。
   */
  async recordManualReceipt(data: {
    orderId: number;
    amount: number;
    method: "bank_transfer" | "store";
    type: "DEPOSIT" | "BALANCE" | "FULL" | "SUPPLEMENT";
    paidAt?: string | Date;
    gatewayTradeNo?: string;
    reviewNote?: string;
    idempotencyKey: string;
    operator?: OperatorContext;
    staffPrincipal?: Pick<StaffPrincipal, "id">;
  }) {
    const fallbackActor: OperatorContext = data.operator ?? {
      type: OPERATOR_TYPE.ADMIN,
    };
    const amountCents = this.moneyToCents(data.amount, "收款金额");
    if (amountCents <= 0) {
      throw new BadRequestException("收款金额必须为正数");
    }
    if (!["DEPOSIT", "BALANCE", "FULL", "SUPPLEMENT"].includes(data.type)) {
      throw new BadRequestException("收款类型无效");
    }
    if (!(MANUAL_RECEIPT_METHODS as readonly string[]).includes(data.method)) {
      throw new BadRequestException(
        "人工登记仅支持线下转账或门店收款，微信/支付宝到账必须由网关回调确认",
      );
    }

    const idempotencyKey = parseIdempotencyKey(data.idempotencyKey, true)!;
    const paidAt = data.paidAt ? new Date(data.paidAt) : null;
    if (paidAt && Number.isNaN(paidAt.getTime())) {
      throw new BadRequestException("到账时间无效");
    }
    const gatewayTradeNo = data.gatewayTradeNo?.trim() || null;
    const reviewNote = data.reviewNote?.trim() || null;
    const actorId = data.staffPrincipal?.id ?? fallbackActor.id;
    const actorScope = actorId == null ? "system" : String(actorId);
    const paymentNoHash = createHash("sha256")
      .update("manual-receipt\0")
      .update(actorScope)
      .update("\0")
      .update(idempotencyKey)
      .digest("hex");
    const paymentNo = `MR${paymentNoHash.slice(0, 48)}`;
    const requestHash = createHash("sha256")
      .update(JSON.stringify({
        orderId: data.orderId,
        amountCents,
        method: data.method,
        type: data.type,
        paidAt: paidAt?.toISOString() ?? null,
        gatewayTradeNo,
        reviewNote,
        actorId: actorId ?? null,
      }))
      .digest("hex");
    const restoreManualReceipt = <T extends { gatewayNotify?: unknown }>(payment: T | null): T | null => {
      if (!payment) return null;
      const receipt = payment.gatewayNotify as {
        source?: unknown;
        requestHash?: unknown;
      } | null;
      if (
        receipt?.source !== MANUAL_RECEIPT_IDEMPOTENCY_SOURCE
        || receipt.requestHash !== requestHash
      ) {
        throw new ConflictException("该幂等键已用于不同的线下收款，请重新确认本次收款意图");
      }
      return payment;
    };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = data.staffPrincipal
          ? await lockAuthorizedStaffForPayment(
              tx,
              data.staffPrincipal,
              "PAYMENT_RECEIPT",
            )
          : fallbackActor;
        await this.lockOrderForTrade(tx, data.orderId);
        const replayed = restoreManualReceipt(await tx.payment.findUnique({
          where: { paymentNo },
        }));
        if (replayed) return replayed;
        const order = await tx.order.findUnique({
          where: { id: data.orderId },
          include: {
            items: true,
            paymentPlans: { select: { id: true } },
          },
        });
        if (!order) throw new NotFoundException("订单不存在");
        if (order.status !== "PENDING_PAYMENT") {
          throw new BadRequestException("只有待付款订单可以登记线下实收");
        }
        if (
          order.quotationVersionId != null ||
          (order.paymentPlans?.length ?? 0) > 0
        ) {
          throw new BadRequestException(
            "报价分期订单必须按付款计划提交凭证并审核，不能使用异常实收绕过分期金额",
          );
        }

        const now = paidAt ?? new Date();

        const confirmedCents = await this.getConfirmedPaymentCents(tx, data.orderId);
        const finalCents = this.moneyToCents(order.finalAmount, "订单应收金额");
        if (confirmedCents + amountCents > finalCents) {
          const availableCents = Math.max(finalCents - confirmedCents, 0);
          throw new BadRequestException(
            `收款金额超过剩余应收，当前最多可登记 ¥${(availableCents / 100).toFixed(2)}`,
          );
        }
        const pendingPayment = await tx.payment.findFirst({
          where: { orderId: data.orderId, status: "PENDING" },
          select: { paymentNo: true },
        });
        if (pendingPayment) {
          throw new BadRequestException(
            `订单已有待处理付款 ${pendingPayment.paymentNo}，请先完成审核或渠道查询`,
          );
        }

        const payment = await tx.payment.create({
          data: {
            paymentNo,
            orderId: data.orderId,
            amount: new Prisma.Decimal(amountCents).div(100),
            method: data.method.trim(),
            type: data.type,
            status: "PAID",
            gatewayTradeNo,
            gatewayNotify: {
              source: MANUAL_RECEIPT_IDEMPOTENCY_SOURCE,
              requestHash,
            },
            paidAt: now,
            reviewedBy: actor.id ?? null,
            reviewedAt: now,
            reviewNote,
          },
        });

        if (data.type === "DEPOSIT" || data.type === "BALANCE") {
          await tx.order.update({
            where: { id: data.orderId },
            data:
              data.type === "DEPOSIT"
                ? { paidDeposit: { increment: payment.amount } }
                : { paidBalance: { increment: payment.amount } },
          });
        }

        const settlement = await this.applyConfirmedPaymentToOrder(
          tx,
          order,
          data.method,
          now,
          actor,
          "异常线下实收确认，预占转为实扣",
        );

        await this.tradeEvents.record(tx, {
          orderId: data.orderId,
          entityType: TRADE_ENTITY_TYPE.PAYMENT,
          entityId: payment.id,
          eventType: TRADE_EVENT_TYPE.PAYMENT_APPROVED,
          fromStatus: "PENDING",
          toStatus: "PAID",
          operator: actor,
          reason: data.reviewNote?.trim() || null,
          metadata: {
            method: data.method,
            type: data.type,
            manual: true,
            gatewayTradeNo,
            fullyPaid: settlement.fullyPaid,
          },
        });

        if (order.customerId) {
          await this.reliableNotifications?.enqueuePaymentConfirmed(tx, {
            id: order.id,
            orderNo: order.orderNo,
            customerId: order.customerId,
            customerEmail: order.customerEmail,
            finalAmount: order.finalAmount,
            paymentId: payment.id,
            paymentAmount: payment.amount,
            cumulativePaidCents: settlement.paidCents,
          });
        }

        return payment;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        const replayed = restoreManualReceipt(
          data.staffPrincipal
            ? await this.prisma.$transaction(async (tx) => {
                await lockAuthorizedStaffForPayment(
                  tx,
                  data.staffPrincipal!,
                  "PAYMENT_RECEIPT",
                );
                return tx.payment.findUnique({ where: { paymentNo } });
              })
            : await this.prisma.payment.findUnique({ where: { paymentNo } }),
        );
        if (replayed) return replayed;
      }
      throw error;
    }
  }

  async rejectOfflinePayment(
    paymentId: number,
    reviewerId: number,
    reviewNote?: string,
    operator?: OperatorContext,
    staffPrincipal?: Pick<StaffPrincipal, "id">,
  ) {
    const actor: OperatorContext = operator ?? {
      type: OPERATOR_TYPE.ADMIN,
      id: reviewerId,
    };
    const result = await this.failPendingPaymentAttempt(
      paymentId,
      reviewNote?.trim() || "线下付款凭证审核未通过",
      actor,
      {
        reviewerId,
        expectedMethod: "bank_transfer",
        staffPrincipal,
        staffAuthorization: staffPrincipal ? "PAYMENT_ADMIN" : undefined,
      },
    );
    if (!result || result.status !== "FAILED") {
      throw new BadRequestException("该付款记录不能被驳回");
    }
    return result;
  }

  /**
   * 订单中心兼容发货入口：只推进付款时已创建的履约单，不再创建第二张单。
   * 未付款（非 PENDING_SHIP）订单禁止发货。
   */
  async ship(
    id: number,
    data: {
      fulfillmentId?: number;
      logisticsCompany: string;
      logisticsNo: string;
      internalNote?: string;
    },
    actor: StaffOrderActor,
  ) {
    const fulfillmentId = await this.prisma.$transaction(async (tx) => {
      await lockAuthorizedStaffForOrder(tx, actor, "ORDER_ADMIN");
      // PENDING_SHIP（“只有待发货订单可以发货”）守卫由唯一履约 authority 在订单行锁内执行。
      const order = await tx.order.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!order) throw new NotFoundException("订单不存在");
      const fulfillments = await tx.fulfillment.findMany({
        where: { orderId: id },
        orderBy: { id: "asc" },
        select: { id: true },
        take: 2,
      });
      if (fulfillments.length === 0) {
        throw new BadRequestException(
          "订单尚未生成履约单，请先核对付款确认结果",
        );
      }
      if (fulfillments.length !== 1) {
        throw new ConflictException("多包裹订单请前往履约中心逐包发货");
      }
      if (data.fulfillmentId !== undefined && data.fulfillmentId !== fulfillments[0].id) {
        throw new ConflictException("履约单与订单不匹配，请前往履约中心处理");
      }
      return fulfillments[0].id;
    });

    await this.fulfillmentAuthority().dispatch(
      fulfillmentId,
      {
        carrier: data.logisticsCompany,
        trackingNo: data.logisticsNo,
        internalNote: data.internalNote,
      },
      actor,
      { requireSingleOrderId: id },
    );
    return this.prisma.$transaction(async (tx) => {
      await lockAuthorizedStaffForOrder(tx, actor, "ORDER_ADMIN");
      return tx.order.findUnique({
        where: { id },
        include: { fulfillments: true },
      });
    });
  }

  /**
   * 未付款取消的共享执行体（后台人工取消与客户自助取消复用）：
   * 状态机校验 → 已收款/履约拦截 → 返券 → 释放库存 → 事件记录，全部在订单行锁后判定。
   */
  private async executeUnpaidCancellation(
    tx: Prisma.TransactionClient,
    orderId: number,
    operator: OperatorContext,
    reason: string | null,
    options: { internalNote?: string; allowAlreadyCancelled?: boolean } = {},
  ) {
    await this.lockOrderForTrade(tx, orderId);
    const lockedOrder = await tx.order.findUnique({
      where: { id: orderId },
      include: { paymentPlans: { select: { id: true } } },
    });
    if (!lockedOrder) throw new NotFoundException("订单不存在");

    // 客户请求可能已提交但 HTTP 响应丢失。仅对显式允许的客户重放返回
    // 当前已取消结果，不再次返券、释放资源、写事件或发送通知。
    if (options.allowAlreadyCancelled && lockedOrder.status === "CANCELLED") {
      return lockedOrder;
    }

    const currentStatus = lockedOrder.status as OrderStatus;
    const allowedNext = VALID_TRANSITIONS[currentStatus];
    if (!allowedNext || !allowedNext.includes("CANCELLED")) {
      throw new BadRequestException(
        `订单状态不能从 ${currentStatus} 变更为 CANCELLED。允许的变更为: ${allowedNext?.join(", ") || "无"}`,
      );
    }

    const confirmedPayment = await tx.payment.findFirst({
      where: {
        orderId,
        status: { in: [...CONFIRMED_PAYMENT_STATUSES] },
      },
      select: { id: true },
    });
    if (Number(lockedOrder.paidAmount) > 0 || confirmedPayment) {
      throw new ConflictException("订单已有确认收款，不能取消");
    }
    const pendingPayment = await tx.payment.findFirst({
      where: { orderId, status: "PENDING" },
      select: { paymentNo: true },
    });
    if (pendingPayment) {
      throw new ConflictException(
        `订单存在待处理的支付交易 ${pendingPayment.paymentNo}，请先完成查单、关单或审核`,
      );
    }

    const fulfillment = await tx.fulfillment.findFirst({
      where: { orderId },
      select: { id: true },
    });
    if (fulfillment) {
      throw new ConflictException("订单已生成履约单，不能取消");
    }

    await this.releaseCouponCapacityForUnpaidCancellation(
      tx,
      lockedOrder,
      operator,
      "MANUAL_CANCEL",
    );
    const cancelledAt = new Date();
    const releasedCount = await this.releaseStockReservations(tx, orderId, cancelledAt);
    if (usesTradeResourceReservations(lockedOrder.quoteChannel)) {
      await this.releaseTradeResourceReservations(tx, orderId, cancelledAt);
    }
    if (
      lockedOrder.quotationVersionId != null ||
      (lockedOrder.paymentPlans?.length ?? 0) > 0
    ) {
      await this.cancelActivePaymentPlanInTx(tx, orderId, true);
    }
    const updated = await tx.order.updateMany({
      where: {
        id: orderId,
        status: currentStatus,
        paidAmount: 0,
      },
      data: {
        status: "CANCELLED",
        internalNote: options.internalNote,
        cancelledAt,
        reservedAt: null,
      },
    });
    if (updated.count === 0) {
      throw new ConflictException("订单状态或收款事实已变化，请刷新后重试");
    }

    if (releasedCount > 0) {
      await this.tradeEvents.record(tx, {
        orderId,
        entityType: TRADE_ENTITY_TYPE.INVENTORY,
        entityId: orderId,
        eventType: TRADE_EVENT_TYPE.STOCK_RELEASED,
        operator,
        reason: `取消订单释放 ${releasedCount} 个预占`,
      });
    }
    await this.tradeEvents.record(tx, {
      orderId,
      entityType: TRADE_ENTITY_TYPE.ORDER,
      entityId: orderId,
      eventType: TRADE_EVENT_TYPE.ORDER_CANCELLED,
      fromStatus: currentStatus,
      toStatus: "CANCELLED",
      operator,
      reason,
    });
    await this.reliableNotifications?.enqueueOrderLifecycle(tx, lockedOrder, {
      event: "CANCELLED",
    });
    return tx.order.findUnique({ where: { id: orderId } });
  }

  /**
   * 客户本人取消未付款订单：归属校验 + 待处理支付拦截后复用取消链路。
   * 存在 PENDING 在线交易或待审凭证时拒绝——渠道可能正在扣款，须先查单/结束支付。
   */
  async cancelForCustomer(
    principal: Pick<CustomerPrincipal, "id" | "authVersion">,
    orderId: number,
  ) {
    const customerId = principal.id;
    const owned = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException("订单不存在或无权操作");

    const cancelled = await this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerForWrite(tx, principal);
      return this.executeUnpaidCancellation(
        tx,
        orderId,
        { type: OPERATOR_TYPE.CUSTOMER, id: customerId },
        "客户自助取消未付款订单",
        { allowAlreadyCancelled: true },
      );
    });
    if (!cancelled) return null;
    // 客户取消响应与列表接口同一白名单口径：后台内部字段不外发。
    const {
      internalNote,
      userId,
      salesConsultantId,
      source,
      paymentProof,
      ...customerCancelled
    } = cancelled;
    return customerCancelled;
  }

  async updateStatus(
    id: number,
    data: {
      status: string;
      logisticsCompany?: string;
      logisticsNo?: string;
      internalNote?: string;
    },
    actor: StaffOrderActor,
  ) {
    const newStatus = data.status as OrderStatus;
    if (newStatus === "PENDING_SHIP") {
      throw new BadRequestException("待发货必须通过付款审核进入");
    }
    if (newStatus === "SHIPPED") {
      throw new BadRequestException("发货请使用专用接口并提交物流信息");
    }

    // 取消与确认收款共用固定锁顺序：Order → Payment → Fulfillment → 库存预占。
    // 所有资格判断都在订单行锁之后重读，避免付款先提交后仍按旧状态取消。
    if (newStatus === "CANCELLED") {
      const cancelled = await this.prisma.$transaction(async (tx) => {
        const operator = await lockAuthorizedStaffForOrder(tx, actor, "ORDER_ADMIN");
        return this.executeUnpaidCancellation(tx, id, operator, data.internalNote || null, {
          internalNote: data.internalNote || undefined,
        });
      });
      if (!cancelled) throw new NotFoundException("订单不存在");
      this.logger.log(`订单 #${id} 状态变更为 ${newStatus}`);
      return cancelled;
    }

    const completed = await this.prisma.$transaction(async (tx) => {
      const operator = await lockAuthorizedStaffForOrder(tx, actor, "ORDER_ADMIN");
      await this.lockOrderForTrade(tx, id);
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("订单不存在");
      const currentStatus = order.status as OrderStatus;
      const allowedNext = VALID_TRANSITIONS[currentStatus];
      if (!allowedNext || !allowedNext.includes(newStatus)) {
        throw new BadRequestException(
          `订单状态不能从 ${currentStatus} 变更为 ${newStatus}。允许的变更为: ${allowedNext?.join(", ") || "无"}`,
        );
      }
      if (newStatus !== "COMPLETED") {
        throw new BadRequestException("该订单状态必须通过对应的付款、发货或取消流程推进");
      }
      if (order.deliveryStatus !== "RECEIVED" || !order.receivedAt) {
        throw new BadRequestException("订单尚未确认签收，不能完成");
      }
      const fulfillments = await tx.fulfillment.findMany({
        where: { orderId: id },
        select: { id: true, status: true },
      });
      if (
        fulfillments.length === 0 ||
        fulfillments.some((fulfillment) => fulfillment.status !== "DELIVERED")
      ) {
        throw new ConflictException("订单履约事实尚未全部送达，不能完成");
      }

      const now = new Date();
      const previousCustomStage = order.customStage;
      const shouldProjectCustomCompletion =
        order.orderType === "CUSTOM" && previousCustomStage !== "COMPLETED";
      const updated = await tx.order.updateMany({
        where: { id, status: currentStatus, deliveryStatus: "RECEIVED" },
        data: {
          status: newStatus,
          ...(shouldProjectCustomCompletion
            ? { customStage: "COMPLETED" as const }
            : {}),
          completedAt: now,
          internalNote: data.internalNote?.trim() || undefined,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException("订单状态已变化，请刷新后重试");
      }
      if (shouldProjectCustomCompletion) {
        await this.tradeEvents.record(tx, {
          orderId: id,
          entityType: TRADE_ENTITY_TYPE.ORDER,
          entityId: id,
          eventType: TRADE_EVENT_TYPE.ORDER_CUSTOM_STAGE_CHANGED,
          fromStatus: previousCustomStage ?? null,
          toStatus: "COMPLETED",
          operator,
        });
      }
      await this.tradeEvents.record(tx, {
        orderId: id,
        entityType: TRADE_ENTITY_TYPE.ORDER,
        entityId: id,
        eventType: TRADE_EVENT_TYPE.ORDER_COMPLETED,
        fromStatus: currentStatus,
        toStatus: newStatus,
        operator,
      });
      await this.reliableNotifications?.enqueueOrderLifecycle(tx, order, {
        event: "COMPLETED",
      });
      return tx.order.findUnique({ where: { id } });
    });
    if (!completed) throw new NotFoundException("订单不存在");
    this.logger.log(`订单 #${id} 状态变更为 ${newStatus}`);
    return completed;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async releaseExpiredReservations() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - OFFLINE_PAYMENT_RESERVATION_MS);
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: "PENDING_PAYMENT",
        reservedAt: { lte: cutoff },
        payments: {
          none: {
            status: "PENDING",
            OR: [
              { proofUrl: { not: null } },
              { method: { in: [...ONLINE_PAYMENT_METHODS] } },
            ],
          },
        },
      },
      select: { id: true },
    });

    let releasedCount = 0;
    for (const order of expiredOrders) {
      try {
        const expired = await this.prisma.$transaction(async (tx) => {
          await this.lockOrderForTrade(tx, order.id);
          return this.expireReservationIfNeeded(tx, order.id, now);
        });
        if (expired) releasedCount += 1;
      } catch (error) {
        this.logger.error(
          `订单 #${order.id} 的库存预占释放失败`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    if (releasedCount > 0) {
      this.logger.log(`已释放 ${releasedCount} 笔超时未付款订单的库存预占`);
    }

    // 凭证 SLA 升级告警：超 72h 未审核的线下凭证汇总提示（驳回由人决定，系统不自动处置）
    // 告警尽力而为：统计失败不得中断库存释放主任务
    try {
      const overdueProofs = await this.prisma.payment.count({
        where: {
          status: "PENDING",
          proofUrl: { not: null },
          createdAt: { lt: new Date(now.getTime() - 72 * 60 * 60 * 1000) },
        },
      });
      if (overdueProofs > 0) {
        this.logger.warn(
          `付款凭证 SLA 升级：${overdueProofs} 笔线下凭证等待审核超过 72 小时，请优先核对到账并处置`,
        );
      }
    } catch {
      // 告警查询失败仅跳过本次提示
    }
  }

  // ════════ 交易中心：订单管理中心操作（金额/地址/备注/签收/顾问/定制阶段） ════════
  // 所有写操作均记录 TradeEvent（before/after），订单详情时间线可见。
  // 金额一律用整数分计算后转 Decimal 入库，规避浮点误差。

  /**
   * 修改订单金额（优惠 / 订单调整 / 应收 / 定金 / 尾款）。
   * 仅允许尚未产生待处理或已确认付款事实的待付款订单修改。
   */
  async updateAmount(
    id: number,
    data: {
      discountAmount?: number | string;
      adjustmentAmount?: number | string;
      finalAmount?: number | string;
      depositAmount?: number | string;
      balanceAmount?: number | string;
      reason?: string;
    },
    actor: StaffOrderActor,
  ) {
    const reason = data.reason?.trim();
    if (!reason) throw new BadRequestException("修改订单金额必须填写调整原因");
    const hasAmountInput = [
      data.discountAmount,
      data.adjustmentAmount,
      data.finalAmount,
      data.depositAmount,
      data.balanceAmount,
    ].some((value) => value !== undefined && value !== null && value !== "");
    if (!hasAmountInput) {
      throw new BadRequestException("未提供需要修改的金额字段");
    }

    return this.prisma.$transaction(async (tx) => {
      const operator = await lockAuthorizedStaffForOrder(tx, actor, "ORDER_ADMIN");
      await this.lockOrderForTrade(tx, id);
      const order = await tx.order.findUnique({
        where: { id },
        include: {
          quotationSource: { select: { id: true } },
          paymentPlans: { select: { id: true, status: true } },
        },
      });
      if (!order) throw new NotFoundException("订单不存在");
      if (order.status !== "PENDING_PAYMENT") {
        throw new BadRequestException("只有待付款订单可以修改金额");
      }
      if (
        order.quotationVersionId != null ||
        order.quotationSource != null ||
        (order.paymentPlans?.length ?? 0) > 0
      ) {
        throw new ConflictException(
          "报价或分期订单的金额由不可变报价版本与付款计划共同约束，不能在订单中心独立改价",
        );
      }
      const blockingPayment = await tx.payment.findFirst({
        where: { orderId: id },
        select: { paymentNo: true, status: true },
      });
      if (blockingPayment) {
        throw new ConflictException(
          `订单已有付款事实 ${blockingPayment.paymentNo}（${blockingPayment.status}），不能直接改写应收金额`,
        );
      }

      const totalCents = this.moneyToCents(order.totalAmount, "订单商品总额");
      const currentDiscountCents = this.moneyToCents(order.discountAmount, "优惠金额");
      const currentAdjustmentCents = this.moneyToCents(order.adjustmentAmount, "订单调整");
      const discountCents =
        data.discountAmount === undefined
          ? currentDiscountCents
          : this.moneyToCents(data.discountAmount, "优惠金额");
      if (discountCents < 0 || discountCents > totalCents) {
        throw new BadRequestException("优惠金额必须在 0 与商品总额之间");
      }

      const explicitFinalCents =
        data.finalAmount === undefined
          ? null
          : this.moneyToCents(data.finalAmount, "应收金额");
      let adjustmentCents =
        data.adjustmentAmount === undefined
          ? currentAdjustmentCents
          : this.moneyToCents(data.adjustmentAmount, "订单调整");
      if (explicitFinalCents !== null && data.adjustmentAmount === undefined) {
        adjustmentCents = explicitFinalCents - totalCents + discountCents;
      }
      const calculatedFinalCents = totalCents - discountCents + adjustmentCents;
      if (
        explicitFinalCents !== null &&
        explicitFinalCents !== calculatedFinalCents
      ) {
        throw new BadRequestException(
          "应收金额必须等于商品总额减优惠金额再加订单调整",
        );
      }
      const finalCents = explicitFinalCents ?? calculatedFinalCents;
      if (finalCents <= 0) {
        throw new BadRequestException("订单应收金额必须大于 0");
      }

      const hasInstallmentFacts =
        Number(order.depositAmount) > 0 ||
        Number(order.balanceAmount) > 0 ||
        data.depositAmount !== undefined ||
        data.balanceAmount !== undefined;
      let depositCents = this.moneyToCents(order.depositAmount, "应付定金");
      let balanceCents = this.moneyToCents(order.balanceAmount, "应付尾款");
      if (hasInstallmentFacts) {
        if (data.depositAmount !== undefined) {
          depositCents = this.moneyToCents(data.depositAmount, "应付定金");
        }
        if (data.balanceAmount !== undefined) {
          balanceCents = this.moneyToCents(data.balanceAmount, "应付尾款");
        } else {
          balanceCents = finalCents - depositCents;
        }
        if (depositCents < 0 || balanceCents < 0 || depositCents + balanceCents !== finalCents) {
          throw new BadRequestException("应付定金与应付尾款之和必须等于订单应收金额");
        }
      }

      const toDecimal = (cents: number) => new Prisma.Decimal(cents).div(100);
      const updateData: Prisma.OrderUpdateInput = {
        discountAmount: toDecimal(discountCents),
        adjustmentAmount: toDecimal(adjustmentCents),
        finalAmount: toDecimal(finalCents),
        ...(hasInstallmentFacts
          ? {
              depositAmount: toDecimal(depositCents),
              balanceAmount: toDecimal(balanceCents),
            }
          : {}),
      };
      const before = {
        discountAmount: order.discountAmount.toString(),
        adjustmentAmount: order.adjustmentAmount.toString(),
        finalAmount: order.finalAmount.toString(),
        depositAmount: order.depositAmount.toString(),
        balanceAmount: order.balanceAmount.toString(),
      };
      const after = {
        discountAmount: toDecimal(discountCents).toString(),
        adjustmentAmount: toDecimal(adjustmentCents).toString(),
        finalAmount: toDecimal(finalCents).toString(),
        depositAmount: hasInstallmentFacts
          ? toDecimal(depositCents).toString()
          : order.depositAmount.toString(),
        balanceAmount: hasInstallmentFacts
          ? toDecimal(balanceCents).toString()
          : order.balanceAmount.toString(),
      };
      const updated = await tx.order.updateMany({
        where: { id, status: "PENDING_PAYMENT", updatedAt: order.updatedAt },
        data: updateData,
      });
      if (updated.count === 0) {
        throw new ConflictException("订单金额已被其他操作修改，请刷新后重试");
      }
      await this.tradeEvents.record(tx, {
        orderId: id,
        entityType: TRADE_ENTITY_TYPE.ORDER,
        entityId: id,
        eventType: TRADE_EVENT_TYPE.ORDER_AMOUNT_EDITED,
        operator,
        reason,
        metadata: { before, after },
      });
      return tx.order.findUnique({ where: { id } });
    });
  }

  /** 修改收货地址（已发货/已完成不可改） */
  async updateAddress(id: number, address: string, actor: StaffOrderActor) {
    const trimmed = address?.trim();
    if (!trimmed || trimmed.length > 500)
      throw new BadRequestException("请提供有效的收货地址");
    return this.prisma.$transaction(async (tx) => {
      const operator = await lockAuthorizedStaffForOrder(tx, actor, "ORDER_ADMIN");
      await this.lockOrderForTrade(tx, id);
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("订单不存在");
      if (!["PENDING_PAYMENT", "PENDING_SHIP"].includes(order.status)) {
        throw new BadRequestException("已发货、已完成或已取消订单不能修改地址");
      }
      const updated = await tx.order.updateMany({
        where: { id, status: order.status },
        data: { address: trimmed },
      });
      if (updated.count === 0) {
        throw new ConflictException("订单状态已变化，请刷新后重试");
      }
      await this.tradeEvents.record(tx, {
        orderId: id,
        entityType: TRADE_ENTITY_TYPE.ORDER,
        entityId: id,
        eventType: TRADE_EVENT_TYPE.ORDER_ADDRESS_EDITED,
        operator,
        metadata: { before: order.address, after: trimmed },
      });
      return tx.order.findUnique({ where: { id } });
    });
  }

  /** 修改内部备注（后台备注，不展示给客户） */
  async updateNote(
    id: number,
    internalNote: string,
    actor: StaffOrderActor,
  ) {
    const normalizedNote = internalNote?.trim() || null;
    return this.prisma.$transaction(async (tx) => {
      const operator = await lockAuthorizedStaffForOrder(tx, actor, "ORDER_NOTE");
      await this.lockOrderForTrade(tx, id);
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("订单不存在");
      await tx.order.update({
        where: { id },
        data: { internalNote: normalizedNote },
      });
      await this.tradeEvents.record(tx, {
        orderId: id,
        entityType: TRADE_ENTITY_TYPE.ORDER,
        entityId: id,
        eventType: TRADE_EVENT_TYPE.ORDER_NOTE_EDITED,
        operator,
        metadata: { before: order.internalNote, after: normalizedNote },
      });
      return tx.order.findUnique({ where: { id } });
    });
  }

  /** 单包裹兼容签收入口；包裹与订单事实统一委托 FulfillmentService。 */
  async confirmReceive(id: number, actor: StaffOrderActor) {
    const fulfillmentId = await this.prisma.$transaction(async (tx) => {
      await lockAuthorizedStaffForOrder(tx, actor, "ORDER_ADMIN");
      const order = await tx.order.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!order) throw new NotFoundException("订单不存在");
      const fulfillments = await tx.fulfillment.findMany({
        where: { orderId: id },
        orderBy: { id: "asc" },
        select: { id: true },
        take: 2,
      });
      if (fulfillments.length === 0) {
        throw new ConflictException("订单缺少履约单，不能确认签收");
      }
      if (fulfillments.length !== 1) {
        throw new ConflictException("多包裹订单请前往履约中心逐包确认送达");
      }
      return fulfillments[0].id;
    });
    await this.fulfillmentAuthority().updateStatus(
      fulfillmentId,
      { status: "DELIVERED" },
      actor,
      { requireSingleOrderId: id },
    );
    return this.prisma.$transaction(async (tx) => {
      await lockAuthorizedStaffForOrder(tx, actor, "ORDER_ADMIN");
      return tx.order.findUnique({ where: { id } });
    });
  }

  /** 修改销售顾问 */
  async updateSalesConsultant(
    id: number,
    salesConsultantId: number | null,
    actor: StaffOrderActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const operator = await lockAuthorizedStaffForOrder(tx, actor, "ORDER_ADMIN");
      await this.lockOrderForTrade(tx, id);
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("订单不存在");
      await tx.order.update({
        where: { id },
        data: { salesConsultantId: salesConsultantId ?? null },
      });
      await this.tradeEvents.record(tx, {
        orderId: id,
        entityType: TRADE_ENTITY_TYPE.ORDER,
        entityId: id,
        eventType: TRADE_EVENT_TYPE.ORDER_CONSULTANT_CHANGED,
        operator,
        metadata: { before: order.salesConsultantId, after: salesConsultantId },
      });
      return tx.order.findUnique({ where: { id } });
    });
  }

  /**
   * 推进定制订单阶段（仅 orderType=CUSTOM 可用）。
   * 非终态阶段不做严格线性校验，允许业务跳转（定制流程可能因返工回退）。
   * 已交付/已完成由权威交付与订单完成事务写入，不能在此伪造。
   */
  async advanceCustomStage(
    id: number,
    stage: CustomStage,
    actor: StaffOrderActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const operator = await lockAuthorizedStaffForOrder(tx, actor, "ORDER_ADMIN");
      await this.lockOrderForTrade(tx, id);
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("订单不存在");
      if (order.orderType !== "CUSTOM") {
        throw new BadRequestException("只有定制订单可以推进定制阶段");
      }
      if (["CANCELLED", "COMPLETED"].includes(order.status)) {
        throw new BadRequestException("已取消或已完成订单不能推进定制阶段");
      }
      if (order.customStage === stage) {
        return order;
      }
      if (order.customStage === "COMPLETED") {
        throw new BadRequestException("已完成的定制阶段不能通过人工入口改写");
      }
      if (["DELIVERED", "COMPLETED"].includes(stage)) {
        throw new BadRequestException("已交付和已完成只能由权威交付与订单完成流程写入");
      }
      if (["DEPOSIT_PAID", "BALANCE_PAID"].includes(stage)) {
        throw new BadRequestException("已付定金和尾款完成只能由权威收款确认流程写入");
      }
      const finalAmount = new Prisma.Decimal(order.finalAmount);
      const depositAmount = new Prisma.Decimal(order.depositAmount);
      const netPaidAmount = new Prisma.Decimal(order.paidAmount).minus(order.refundedAmount);
      const requiredDeposit = depositAmount.greaterThan(0) ? depositAmount : finalAmount;
      if (
        (["DESIGN_CONFIRM", "IN_PRODUCTION", "QC_PASSED", "PENDING_BALANCE"] as CustomStage[])
          .includes(stage)
        && (
          finalAmount.lessThanOrEqualTo(0)
          || requiredDeposit.lessThanOrEqualTo(0)
          || netPaidAmount.lessThan(requiredDeposit)
        )
      ) {
        throw new ConflictException(
          "已确认净收未达到订单约定定金，不能进入设计、制作、质检或待付尾款阶段",
        );
      }
      if (
        stage === "PENDING_DELIVERY"
        && (finalAmount.lessThanOrEqualTo(0) || netPaidAmount.lessThan(finalAmount))
      ) {
        throw new ConflictException(
          "订单尚未收齐或退款后净收不足，不能进入待交付阶段",
        );
      }
      if (stage === "PENDING_DELIVERY") {
        const { activeRefund, activeAfterSales } = await findDeliveryBlockingDisputes(tx, id);
        if (activeRefund || activeAfterSales) {
          throw new ConflictException("订单存在处理中的退款或售后，不能进入待交付阶段");
        }
      }
      const updated = await tx.order.updateMany({
        where: { id, status: order.status, customStage: order.customStage },
        data: { customStage: stage },
      });
      if (updated.count === 0) {
        throw new ConflictException("订单或定制阶段已变化，请刷新后重试");
      }
      await this.tradeEvents.record(tx, {
        orderId: id,
        entityType: TRADE_ENTITY_TYPE.ORDER,
        entityId: id,
        eventType: TRADE_EVENT_TYPE.ORDER_CUSTOM_STAGE_CHANGED,
        fromStatus: order.customStage ?? null,
        toStatus: stage,
        operator,
      });
      return tx.order.findUnique({ where: { id } });
    });
  }

  // ════════ 第五阶段：异常订单聚合 + 交易数据统计（只读） ════════

  /**
   * 异常订单聚合：长时间未付款 / 超时未发货 / 定制超期 / 物流异常 / 退款处理中 / 付款角色漂移。
   * 为每条订单标注 anomalyReasons，供异常订单页展示。
   */
  async findAnomalies(actor: StaffOrderActor) {
    const now = new Date();
    const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const h48 = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const h72 = new Date(now.getTime() - 72 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 线下凭证待审核 SLA：24h 提示、72h 升级；驳回永远是人的决定，系统不自动处置资金
    const pendingProofOlderThan = (cutoff: Date): Prisma.OrderWhereInput => ({
      status: "PENDING_PAYMENT",
      payments: {
        some: { status: "PENDING", proofUrl: { not: null }, createdAt: { lt: cutoff } },
      },
    });
    const paymentRoleMismatch: Prisma.OrderWhereInput = {
      paymentPlans: {
        some: {
          installments: {
            some: {
              OR: [
                { label: "定金", payment: { is: { type: { not: "DEPOSIT" } } } },
                { label: "尾款", payment: { is: { type: { not: "BALANCE" } } } },
                { label: "全款", payment: { is: { type: { not: "FULL" } } } },
              ],
            },
          },
        },
      },
    };

    const where: Prisma.OrderWhereInput = {
      OR: [
        { status: "PENDING_PAYMENT", createdAt: { lt: h24 } }, // 长时间未付款
        pendingProofOlderThan(h24), // 凭证待审核超 24h
        {
          status: "PENDING_SHIP",
          deliveryStatus: "PENDING_SHIP",
          paymentConfirmedAt: { lt: h48 },
        }, // 真实进入待发货维度后超时；定制/合作生产阶段不误报
        {
          orderType: "CUSTOM",
          customStage: { not: "COMPLETED" },
          createdAt: { lt: d30 },
        }, // 定制超期
        { deliveryStatus: "ABNORMAL" }, // 物流异常
        {
          refunds: {
            some: { status: { in: ["PENDING", "APPROVED", "PROCESSING"] } },
          },
        }, // 退款处理中
        paymentRoleMismatch, // 已绑定分期标签与付款角色不一致
      ],
    };

    const [list, total] = await this.prisma.$transaction(async (tx) => {
      await lockAuthorizedStaffForOrder(tx, actor, "ORDER_FINANCE_QUERY");
      return Promise.all([
        tx.order.findMany({
          where,
          include: {
            items: {
              select: {
                id: true,
                productNameSnapshot: true,
                productCodeSnapshot: true,
              },
            },
            payments: {
              where: { status: "PENDING", proofUrl: { not: null } },
              select: { createdAt: true },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
            paymentPlans: {
              select: {
                installments: {
                  where: { paymentId: { not: null } },
                  select: {
                    label: true,
                    payment: { select: { type: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        tx.order.count({ where }),
      ]);
    });

    const enriched = list.map((o) => {
      const reasons: string[] = [];
      if (o.status === "PENDING_PAYMENT" && o.createdAt < h24)
        reasons.push("长时间未付款");
      const proofSubmittedAt = o.payments[0]?.createdAt;
      if (proofSubmittedAt) {
        if (proofSubmittedAt < h72) reasons.push("付款凭证待审核超 72 小时（升级处理）");
        else if (proofSubmittedAt < h24) reasons.push("付款凭证待审核超 24 小时");
      }
      if (
        o.status === "PENDING_SHIP" &&
        o.deliveryStatus === "PENDING_SHIP" &&
        o.paymentConfirmedAt &&
        o.paymentConfirmedAt < h48
      )
        reasons.push("超时未发货");
      if (
        o.orderType === "CUSTOM" &&
        o.customStage !== "COMPLETED" &&
        o.createdAt < d30
      )
        reasons.push("定制超期");
      if (o.deliveryStatus === "ABNORMAL") reasons.push("物流异常");
      const expectedPaymentTypeByLabel: Record<string, string> = {
        定金: "DEPOSIT",
        尾款: "BALANCE",
        全款: "FULL",
      };
      const hasPaymentRoleMismatch = (o.paymentPlans ?? []).some((plan) =>
        plan.installments.some((installment) => {
          const expectedType = expectedPaymentTypeByLabel[installment.label];
          return Boolean(
            expectedType &&
            installment.payment &&
            installment.payment.type !== expectedType,
          );
        }),
      );
      if (hasPaymentRoleMismatch) reasons.push("付款角色与分期不一致");
      if (reasons.length === 0) reasons.push("退款处理中");
      // reasons 面向后台展示，剥离临时投影避免响应冗余
      const { payments: _payments, paymentPlans: _paymentPlans, ...order } = o;
      return { ...order, anomalyReasons: reasons };
    });

    return { list: enriched, total };
  }

  /**
   * 交易数据首页：今日成交额/订单数 + 累计已收/待收/退款/净收/客单价 + 来源/类型分布。
   * 严格区分订单金额与实际到账金额——未付款订单不计入已收。
   */
  async getTradeOverview(actor: StaffOrderActor) {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const [
      todayAgg,
      todayCount,
      paidAgg,
      finalAgg,
      refundedAgg,
      activeOrderCount,
      sourceGroup,
      typeGroup,
    ] = await this.prisma.$transaction(async (tx) => {
      await lockAuthorizedStaffForOrder(tx, actor, "ORDER_FINANCE_QUERY");
      return Promise.all([
        tx.order.aggregate({
          where: { createdAt: { gte: todayStart }, status: { not: "CANCELLED" } },
          _sum: { finalAmount: true },
        }),
        tx.order.count({
          where: { createdAt: { gte: todayStart }, status: { not: "CANCELLED" } },
        }),
        tx.order.aggregate({ _sum: { paidAmount: true } }),
        tx.order.aggregate({
          where: { status: { not: "CANCELLED" } },
          _sum: { finalAmount: true },
        }),
        tx.order.aggregate({ _sum: { refundedAmount: true } }),
        tx.order.count({ where: { status: { not: "CANCELLED" } } }),
        tx.order.groupBy({
          by: ["source"],
          where: { status: { not: "CANCELLED" } },
          _count: { _all: true },
        }),
        tx.order.groupBy({
          by: ["orderType"],
          where: { status: { not: "CANCELLED" } },
          _count: { _all: true },
        }),
      ]);
    });

    const paidAmount = Number(paidAgg._sum.paidAmount || 0);
    const finalAmount = Number(finalAgg._sum.finalAmount || 0);
    const refundedAmount = Number(refundedAgg._sum.refundedAmount || 0);

    return {
      today: {
        revenue: Number(todayAgg._sum.finalAmount || 0),
        orderCount: todayCount,
      },
      amount: {
        paid: paidAmount,
        pending: Math.max(0, finalAmount - paidAmount),
        refunded: refundedAmount,
        net: Math.max(0, paidAmount - refundedAmount),
        avgOrderValue:
          activeOrderCount > 0 ? finalAmount / activeOrderCount : 0,
      },
      distribution: {
        source: sourceGroup.map((g) => ({
          source: g.source || "未知",
          count: g._count._all,
        })),
        orderType: typeGroup.map((g) => ({
          orderType: g.orderType,
          count: g._count._all,
        })),
      },
    };
  }
}
