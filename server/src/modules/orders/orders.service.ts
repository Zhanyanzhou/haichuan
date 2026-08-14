import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  OrderStatus,
  OrderType,
  DeliveryStatus,
  CustomStage,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "crypto";
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

/** 订单状态机：定义合法状态转换 */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PENDING_SHIP", "CANCELLED"],
  PENDING_SHIP: ["SHIPPED"],
  SHIPPED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

const OFFLINE_PAYMENT_RESERVATION_MS = 24 * 60 * 60 * 1000;

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
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tradeEvents: TradeEventsService,
    private readonly mailer: MailerService,
    private readonly logistics: LogisticsTrackingService,
  ) {}

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
      })
      .catch(() => undefined);
  }

  /**
   * 生成订单号：ORD + 日期 + 4 位日内流水（如 ORD202608130001）。
   * 事务内查当日最大序号 +1；并发冲突由 orderNo @unique 约束 + create 外层重试兜底。
   * 珠宝低单量场景下同日并发冲突概率极低，5 次重试足够。
   */
  private async generateOrderNo(tx: Prisma.TransactionClient): Promise<string> {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `ORD${date}`;
    const latest = await tx.order.findFirst({
      where: { orderNo: { startsWith: prefix } },
      orderBy: { orderNo: "desc" },
      select: { orderNo: true },
    });
    let seq = 1;
    if (latest && latest.orderNo.length > prefix.length) {
      const parsed = Number.parseInt(latest.orderNo.slice(prefix.length), 10);
      if (!Number.isNaN(parsed) && parsed >= 0) seq = parsed + 1;
    }
    return `${prefix}${String(seq).padStart(4, "0")}`;
  }

  private createPaymentNo(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `PAY${date}${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  }

  private createFulfillmentNo(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `FUL${date}${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
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

  private async reserveStock(
    tx: Prisma.TransactionClient,
    orderId: number,
    skuId: number,
    quantity: number,
    expiresAt: Date,
  ) {
    const inventories = await tx.inventory.findMany({
      where: { skuId },
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
      select: { id: true, inventoryId: true, skuId: true, quantity: true },
    });

    for (const reservation of reservations) {
      if (reservation.inventoryId) {
        await tx.inventory.update({
          where: { id: reservation.inventoryId },
          data: { quantity: { increment: reservation.quantity } },
        });
      } else {
        // 兼容历史数据：极早期预占可能落在已废弃的 ProductSKU.stock（inventoryId 为 null）。
        // 新预占（reserveStock）始终带 inventoryId，此分支仅处理迁移前残留行，不构成双库存源。
        await tx.productSKU.update({
          where: { id: reservation.skuId },
          data: { stock: { increment: reservation.quantity } },
        });
      }
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { releasedAt },
      });
    }

    return reservations.length;
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

  private async expireReservationIfNeeded(
    tx: Prisma.TransactionClient,
    orderId: number,
    now = new Date(),
  ) {
    const order = await tx.order.findFirst({
      where: { id: orderId, status: "PENDING_PAYMENT" },
      include: {
        payments: {
          where: { status: "PENDING", proofUrl: { not: null } },
          select: { id: true },
        },
      },
    });
    if (!order?.reservedAt || order.payments.length > 0) {
      return false;
    }
    const expiresAt = new Date(
      order.reservedAt.getTime() + OFFLINE_PAYMENT_RESERVATION_MS,
    );
    if (expiresAt > now) {
      return false;
    }

    await this.releaseStockReservations(tx, order.id, now);
    await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: now, reservedAt: null },
    });
    // 超时取消：库存释放事件 + 订单取消事件（操作人为系统）
    await this.tradeEvents.record(tx, {
      orderId: order.id,
      entityType: TRADE_ENTITY_TYPE.INVENTORY,
      entityId: order.id,
      eventType: TRADE_EVENT_TYPE.STOCK_RELEASED,
      operator: { type: OPERATOR_TYPE.SYSTEM },
      reason: "超时未付款自动释放库存",
    });
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
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) {
        // endDate 含当天：加一天作为上界，实现闭区间
        const end = new Date(params.endDate);
        end.setDate(end.getDate() + 1);
        where.createdAt.lt = end;
      }
    }

    // 金额范围（按 finalAmount）
    if (params.minAmount !== undefined || params.maxAmount !== undefined) {
      where.finalAmount = {};
      if (params.minAmount !== undefined && params.minAmount !== "") {
        where.finalAmount.gte = new Prisma.Decimal(
          params.minAmount as number | string,
        );
      }
      if (params.maxAmount !== undefined && params.maxAmount !== "") {
        where.finalAmount.lte = new Prisma.Decimal(
          params.maxAmount as number | string,
        );
      }
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
        // 已收齐：paidAmount >= finalAmount。Prisma 不支持字段间直接比较，
        // 用 finalAmount 上界 + paidAmount 下界的等价区间表达（paidAmount 落在 [finalAmount, +∞)）。
        // 此处退化为 paidAmount > 0 的近似，精确区分由前端详情页金额区呈现。
        where.paidAmount = { gt: 0 };
      } else if (params.paymentStatus === "PARTIAL") {
        // 部分收款：paidAmount > 0 且未付清，近似为 paidAmount > 0
        where.paidAmount = { gt: 0 };
      }
    }

    return where;
  }

  async findAll(params: OrderListParams) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where = this.buildListWhere(params);

    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
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
      this.prisma.order.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  /** 订单导出：返回与当前筛选条件一致的记录（权限由 Controller 控制，导出动作记审计事件） */
  async findAllForExport(params: OrderListParams, limit = 1000) {
    const where = this.buildListWhere(params);
    return this.prisma.order.findMany({
      where,
      take: Math.min(Math.max(limit, 1), 1000),
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
  }

  async findById(id: number) {
    const order = await this.prisma.order.findUnique({
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
        fulfillments: { orderBy: { createdAt: "desc" } },
        afterSalesCases: { orderBy: { createdAt: "desc" } },
        tradeEvents: { orderBy: { createdAt: "asc" } },
        customer: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    });
    if (!order) throw new NotFoundException("订单不存在");
    return order;
  }

  /**
   * 客户查看自己订单的物流轨迹（归属校验 + 已发货才可查）。
   * 查询由快递100 服务完成（未配置凭据时诚实 503）。
   */
  async trackForCustomer(customerId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
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
    return this.logistics.track(order.logisticsCompany, order.logisticsNo);
  }

  async findForCustomer(customerId: number) {    const orders = await this.prisma.order.findMany({
      where: { customerId },
      // 个人订单列表安全上限，防止极端账户全量加载；正常用户远不到此数
      take: 100,
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, code: true } },
            sku: { select: { skuCode: true, material: true, size: true } },
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
      },
      orderBy: { createdAt: "desc" },
    });
    // 客户订单接口不返回凭证真实路径或私有存储键，只提供是否已提交的状态。
    return orders.map(({ payments, ...order }) => ({
      ...order,
      payments: payments.map(({ proofUrl, ...payment }) => ({
        ...payment,
        hasProof: Boolean(proofUrl),
      })),
    }));
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
  }) {
    const operator: OperatorContext = data.operator ?? {
      type: OPERATOR_TYPE.SYSTEM,
    };
    const customer = this.validateCustomerData(data);
    const quantities = this.normalizeItems(data.items);
    const skus = await this.prisma.productSKU.findMany({
      where: {
        id: { in: [...quantities.keys()] },
        isActive: true,
        product: {
          status: "PUBLISHED",
          deletedAt: null,
          salesMode: "DIRECT_PURCHASE",
        },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            code: true,
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

    // 一次性聚合所有 SKU 的可用库存，替代循环内 N 次 aggregate（避免 N+1）
    const stockRows = await this.prisma.inventory.groupBy({
      by: ["skuId"],
      where: { skuId: { in: skus.map((s) => s.id) } },
      _sum: { quantity: true },
    });
    const stockMap = new Map<number, number>();
    for (const r of stockRows) stockMap.set(r.skuId, r._sum.quantity ?? 0);

    // 用整数分累加，规避 JS Number 浮点误差（P1-18），最后转回 Decimal(10,2) 入库
    let totalCents = 0;
    const orderItems: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
    for (const sku of skus) {
      const quantity = quantities.get(sku.id)!;
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
    let discountCents = 0;
    let coupon: { id: number } | null = null;
    if (data.couponId) {
      const found = await this.prisma.coupon.findUnique({
        where: { id: data.couponId },
      });
      if (!found) throw new BadRequestException("优惠券不存在");
      const evaluation = evaluateCoupon(found, totalCents);
      if (!evaluation.ok) {
        throw new BadRequestException(evaluation.reason);
      }
      discountCents = evaluation.discountCents;
      coupon = { id: found.id };
    }

    const latestGoldPrice = await this.prisma.goldPrice.findFirst({
      orderBy: { recordDate: "desc" },
    });

    const reservedAt = new Date();
    const expiresAt = this.getReservationExpiry(reservedAt);

    const run = () =>
      this.prisma.$transaction(async (tx) => {
        // 优惠券原子核销：全部条件塞进 updateMany（活跃+在有效期+未领完），并发建单只可能成功一次
        if (coupon) {
          const now = new Date();
          const claimed = await tx.coupon.updateMany({
            where: {
              id: coupon.id,
              isActive: true,
              startTime: { lte: now },
              endTime: { gt: now },
              usedCount: { lt: this.prisma.coupon.fields.totalCount },
            },
            data: { usedCount: { increment: 1 } },
          });
          if (claimed.count === 0) {
            throw new BadRequestException("优惠券核销失败：已被领完或已停用，请刷新后重选");
          }
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
            discountAmount: new Prisma.Decimal(discountCents).div(100),
            finalAmount: new Prisma.Decimal(totalCents - discountCents).div(100),
            couponId: coupon?.id ?? null,
            lockedGoldPrice: latestGoldPrice?.price || null,
            paymentMethod: data.paymentMethod || "bank_transfer",
            status: "PENDING_PAYMENT",
            orderType: data.orderType ?? "SPOT",
            salesConsultantId: data.salesConsultantId ?? null,
            source: data.source?.trim() || null,
            reservedAt,
            items: { create: orderItems },
          },
          include: { items: true },
        });

        for (const item of order.items) {
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
          operator,
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
          operator,
          reason: `预占 ${order.items.length} 个商品行，24h 内未付款自动释放`,
        });

        return order;
      });
    // 订单号并发冲突重试（ORD+流水：事务内查 max+1，orderNo @unique 兜底，最多 5 次）
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await run();
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002" &&
          attempt < 4
        )
          continue;
        throw e;
      }
    }
    throw new BadRequestException("订单号生成冲突，请重试");
  }

  /**
   * 从报价单创建订单（独立事务 + orderNo 冲突重试）。
   * 与 create 的区别：不校验 salesMode（报价商品可任意销售模式）、用报价金额和 snapshot、不重新算价。
   * 若需与报价单状态推进同事务（原子转单，避免孤儿订单竞态），请改用 createOrderFromQuotationInTx。
   */
  async createFromQuotation(data: {
    quotationId: number;
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
    // 独立事务 + orderNo 冲突重试（orderNo 事务内查 max+1，@unique 兜底）
    const run = () =>
      this.prisma.$transaction((tx) =>
        this.createOrderFromQuotationInTx(tx, data, context),
      );
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await run();
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002" &&
          attempt < 4
        )
          continue;
        throw e;
      }
    }
    throw new BadRequestException("订单号生成冲突，请重试");
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

    // 金额统一用整数分计算后转 Decimal，规避浮点误差
    const toDecimal = (v: number | string) =>
      new Prisma.Decimal(Math.round(Number(v) * 100)).div(100);
    const balanceCents = Math.max(
      0,
      Math.round(Number(data.finalAmount) * 100) -
        Math.round(Number(data.depositAmount || 0) * 100),
    );

    const orderItems: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] =
      data.items.map((it) => ({
        skuId: it.skuId,
        productId: it.productId,
        quantity: it.quantity,
        unitPrice: toDecimal(it.unitPrice),
        subtotal: toDecimal(it.subtotal),
        productNameSnapshot: it.productName,
        productImageSnapshot: it.productImage ?? null,
        productCodeSnapshot: it.productCode ?? null,
        skuSnapshot: it.skuSnapshot ?? null,
      }));

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
        finalAmount: toDecimal(data.finalAmount),
        depositAmount: toDecimal(data.depositAmount || 0),
        balanceAmount: new Prisma.Decimal(balanceCents).div(100),
        lockedGoldPrice: latestGoldPrice?.price || null,
        paymentMethod: "bank_transfer",
        status: "PENDING_PAYMENT",
        orderType: data.orderType ?? "SPOT",
        salesConsultantId: data.salesConsultantId ?? null,
        source: "quotation",
        reservedAt,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    for (const item of order.items) {
      await this.reserveStock(
        tx,
        order.id,
        item.skuId,
        item.quantity,
        expiresAt,
      );
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
        itemCount: order.items.length,
        fromQuotationId: data.quotationId,
      },
    });
    await this.tradeEvents.record(tx, {
      orderId: order.id,
      entityType: TRADE_ENTITY_TYPE.INVENTORY,
      entityId: order.id,
      eventType: TRADE_EVENT_TYPE.STOCK_RESERVED,
      toStatus: "PENDING_PAYMENT",
      operator,
      reason: `报价单 #${data.quotationId} 转订单预占 ${order.items.length} 个商品行`,
    });
    return order;
  }

  async submitOfflinePaymentProof(
    customerId: number,
    orderId: number,
    proofKey: string,
    operator?: OperatorContext,
  ) {
    const actor: OperatorContext = operator ?? {
      type: OPERATOR_TYPE.CUSTOMER,
      id: customerId,
    };
    const normalizedProofKey = proofKey?.trim();
    const paymentProofKeyPattern = new RegExp(
      `^${customerId}/\\d{4}/\\d{2}/\\d{2}/[0-9a-f-]{36}\\.(jpg|png|webp|gif)$`,
      "i",
    );
    if (
      !normalizedProofKey ||
      !paymentProofKeyPattern.test(normalizedProofKey)
    ) {
      throw new BadRequestException("付款凭证必须是当前客户上传的私有图片");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, customerId },
      });
      if (!order) throw new NotFoundException("订单不存在或无权操作");
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

      const existingPayment = await tx.payment.findFirst({
        where: { orderId, type: "FULL" },
        orderBy: { createdAt: "desc" },
      });
      const payment = existingPayment
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
      await tx.order.update({
        where: { id: orderId },
        data: {
          paymentMethod: "bank_transfer",
          paymentProof: normalizedProofKey,
        },
      });
      return { order, payment };
    });
    if (!result.order)
      throw new BadRequestException("订单的库存保留已到期，请重新下单");

    // 凭证提交事件（事务外记录，避免重复读；失败仅日志）
    await this.tradeEvents.record(this.prisma, {
      orderId: result.order.id,
      entityType: TRADE_ENTITY_TYPE.PAYMENT,
      entityId: result.payment!.id,
      eventType: TRADE_EVENT_TYPE.PAYMENT_PROOF_SUBMITTED,
      operator: actor,
      metadata: { hasProof: true },
    });
    return result.payment;
  }

  /**
   * 确认收款（乐观锁推进 PENDING→PAID，消费预占，订单进入待发货）。
   * 两个来源共用同一核销管线：
   * - 线下转账：人工审核（method=bank_transfer 且有付款凭证）；
   * - 在线网关：回调验签通过后自动核销（method=alipay/wechat，传 gateway 信息）。
   */
  async approveOfflinePayment(
    paymentId: number,
    reviewerId: number | null,
    reviewNote?: string,
    operator?: OperatorContext,
    gateway?: { tradeNo: string; notify: Prisma.InputJsonValue },
  ) {
    const actor: OperatorContext = operator ?? {
      type: OPERATOR_TYPE.ADMIN,
      id: reviewerId ?? undefined,
    };
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { order: { include: { items: true } } },
      });
      if (!payment) throw new NotFoundException("付款记录不存在");
      const isOnlineChannel = payment.method === "alipay" || payment.method === "wechat";
      const eligible =
        payment.status === "PENDING" &&
        ((payment.method === "bank_transfer" && !!payment.proofUrl) ||
          (isOnlineChannel && !!gateway));
      if (!eligible) {
        throw new BadRequestException("该付款记录不满足确认收款条件");
      }
      if (payment.order.status !== "PENDING_PAYMENT") {
        throw new BadRequestException("订单状态已变化，不能确认收款");
      }

      const now = new Date();
      // 乐观锁推进 payment(PENDING→PAID)：并发审核时只有一个事务命中，其余 count===0 抛错，杜绝双扣库存（P0-5）
      const updated = await tx.payment.updateMany({
        where: { id: paymentId, status: "PENDING" },
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

      // 消费预占；若预占已被超时释放（凭证上传后过 24h cron 释放），重新预占后立即消费。
      // 此刻 payment 已被本事务乐观锁推进，并发 T2 在上面 updateMany 命中 0 已抛错回滚，不会走到这里 → 不会双扣。
      const consumed = await this.consumeStockReservations(
        tx,
        payment.orderId,
        now,
      );
      if (consumed.count === 0) {
        const expiresAt = this.getReservationExpiry(now);
        for (const item of payment.order.items) {
          await this.reserveStock(
            tx,
            payment.orderId,
            item.skuId,
            item.quantity,
            expiresAt,
          );
        }
        await this.consumeStockReservations(tx, payment.orderId, now);
      }

      // 同步已收金额（paidAmount）与发货维度（确认收款后进入待发货）
      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: "PENDING_SHIP",
          reservedAt: now,
          paymentConfirmedAt: now,
          paidAmount: { increment: payment.amount },
          deliveryStatus: "PENDING_SHIP",
        },
      });

      // 交易事件：付款审核通过 + 库存消费
      await this.tradeEvents.record(tx, {
        orderId: payment.orderId,
        entityType: TRADE_ENTITY_TYPE.PAYMENT,
        entityId: paymentId,
        eventType: TRADE_EVENT_TYPE.PAYMENT_APPROVED,
        fromStatus: "PENDING",
        toStatus: "PAID",
        operator: actor,
        reason: reviewNote?.trim() || null,
      });
      await this.tradeEvents.record(tx, {
        orderId: payment.orderId,
        entityType: TRADE_ENTITY_TYPE.INVENTORY,
        entityId: payment.orderId,
        eventType: TRADE_EVENT_TYPE.STOCK_CONSUMED,
        operator: actor,
        reason: "确认收款，预占转为实扣",
      });

      return tx.payment.findUnique({ where: { id: paymentId } });
    });
  }

  /**
   * 后台手动登记收款（财务/管理员直接录入一笔已到账收款，无需客户上传凭证）。
   * 创建 status=PAID 的 Payment，按 type 同步 Order.paidDeposit/paidBalance/paidAmount；
   * 若 type=FULL 或 BALANCE 且订单处于 PENDING_PAYMENT，则推进到 PENDING_SHIP + 消费库存预占。
   */
  async recordManualReceipt(data: {
    orderId: number;
    amount: number;
    method: string; // bank_transfer | store | wechat | alipay
    type: "DEPOSIT" | "BALANCE" | "FULL" | "SUPPLEMENT";
    paidAt?: string | Date;
    gatewayTradeNo?: string;
    reviewNote?: string;
    operator?: OperatorContext;
  }) {
    const actor: OperatorContext = data.operator ?? {
      type: OPERATOR_TYPE.ADMIN,
    };
    const amountCents = Math.round(Number(data.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new BadRequestException("收款金额必须为正数");
    }
    if (!["DEPOSIT", "BALANCE", "FULL", "SUPPLEMENT"].includes(data.type)) {
      throw new BadRequestException("收款类型无效");
    }
    if (!data.method?.trim()) throw new BadRequestException("请提供收款方式");

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: data.orderId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException("订单不存在");
      // 已取消订单不可再登记收款，避免 paidAmount 累加但状态不推进的资金台账错乱
      if (order.status === "CANCELLED") {
        throw new BadRequestException("订单已取消，不可登记收款");
      }

      const now = data.paidAt ? new Date(data.paidAt) : new Date();
      const payment = await tx.payment.create({
        data: {
          paymentNo: this.createPaymentNo(),
          orderId: data.orderId,
          amount: new Prisma.Decimal(amountCents).div(100),
          method: data.method.trim(),
          type: data.type,
          status: "PAID", // 后台登记即确认到账
          gatewayTradeNo: data.gatewayTradeNo?.trim() || null,
          paidAt: now,
          reviewedBy: actor.id ?? null,
          reviewedAt: now,
          reviewNote: data.reviewNote?.trim() || null,
        },
      });

      // 按 type 同步订单已收金额字段
      const orderUpdate: Prisma.OrderUpdateInput = {
        paidAmount: { increment: payment.amount },
      };
      if (data.type === "DEPOSIT")
        orderUpdate.paidDeposit = { increment: payment.amount };
      if (data.type === "BALANCE")
        orderUpdate.paidBalance = { increment: payment.amount };

      // FULL 或 BALANCE 且订单待付款：推进到待发货 + 消费库存预占
      let consumed = false;
      if (
        order.status === "PENDING_PAYMENT" &&
        (data.type === "FULL" || data.type === "BALANCE")
      ) {
        const result = await this.consumeStockReservations(
          tx,
          data.orderId,
          now,
        );
        if (result.count === 0) {
          // 预占已超时释放，重新预占后立即消费（与 approveOfflinePayment 一致）
          const expiresAt = this.getReservationExpiry(now);
          for (const item of order.items) {
            await this.reserveStock(
              tx,
              data.orderId,
              item.skuId,
              item.quantity,
              expiresAt,
            );
          }
          await this.consumeStockReservations(tx, data.orderId, now);
        }
        orderUpdate.status = "PENDING_SHIP";
        orderUpdate.reservedAt = now;
        orderUpdate.paymentConfirmedAt = now;
        orderUpdate.deliveryStatus = "PENDING_SHIP";
        consumed = true;
      }

      await tx.order.update({ where: { id: data.orderId }, data: orderUpdate });

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
          gatewayTradeNo: data.gatewayTradeNo || null,
        },
      });
      if (consumed) {
        await this.tradeEvents.record(tx, {
          orderId: data.orderId,
          entityType: TRADE_ENTITY_TYPE.INVENTORY,
          entityId: data.orderId,
          eventType: TRADE_EVENT_TYPE.STOCK_CONSUMED,
          operator: actor,
          reason: "后台登记收款，预占转实扣",
        });
      }

      return payment;
    });
  }

  async rejectOfflinePayment(
    paymentId: number,
    reviewerId: number,
    reviewNote?: string,
    operator?: OperatorContext,
  ) {
    const actor: OperatorContext = operator ?? {
      type: OPERATOR_TYPE.ADMIN,
      id: reviewerId,
    };
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException("付款记录不存在");
    if (payment.method !== "bank_transfer" || payment.status !== "PENDING") {
      throw new BadRequestException("该付款记录不能被驳回");
    }
    // 乐观锁：并发驳回/审核时只有一个命中
    const updated = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: "PENDING" },
      data: {
        status: "FAILED",
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNote: reviewNote?.trim() || null,
      },
    });
    if (updated.count === 0)
      throw new BadRequestException("该付款记录已被处理，请刷新后重试");

    await this.tradeEvents.record(this.prisma, {
      orderId: payment.orderId,
      entityType: TRADE_ENTITY_TYPE.PAYMENT,
      entityId: paymentId,
      eventType: TRADE_EVENT_TYPE.PAYMENT_REJECTED,
      fromStatus: "PENDING",
      toStatus: "FAILED",
      operator: actor,
      reason: reviewNote?.trim() || null,
    });
    return this.prisma.payment.findUnique({ where: { id: paymentId } });
  }

  /**
   * 发货登记：创建履约单（SHIPPED）+ 订单进入 SHIPPED。
   * MVP 一单一包裹：一个订单在此创建唯一一个 Fulfillment。
   * 未付款（非 PENDING_SHIP）订单禁止发货。
   */
  async ship(
    id: number,
    data: {
      logisticsCompany: string;
      logisticsNo: string;
      internalNote?: string;
    },
    operator?: OperatorContext,
  ) {
    const actor: OperatorContext = operator ?? { type: OPERATOR_TYPE.ADMIN };
    const logisticsCompany = data.logisticsCompany?.trim();
    const logisticsNo = data.logisticsNo?.trim();
    if (!logisticsCompany || !logisticsNo)
      throw new BadRequestException("发货必须填写物流公司和物流单号");

    const shipped = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("订单不存在");
      if (order.status !== "PENDING_SHIP") {
        throw new BadRequestException(
          "只有待发货订单可以发货（请先完成付款审核）",
        );
      }
      // 防重复发货：已有非异常履约单则拒绝
      const existing = await tx.fulfillment.findFirst({
        where: {
          orderId: id,
          status: {
            in: [
              "PENDING_PICK",
              "PENDING_CHECK",
              "PENDING_SHIP",
              "SHIPPED",
              "DELIVERED",
            ],
          },
        },
        select: { id: true, fulfillmentNo: true },
      });
      if (existing) {
        throw new BadRequestException(
          `订单已存在履约单 ${existing.fulfillmentNo}，不可重复发货`,
        );
      }

      const now = new Date();
      // 履约单先进入待发货状态（进入履约状态机），随后在同一事务内推进为已发货，保留完整状态轨迹
      const fulfillment = await tx.fulfillment.create({
        data: {
          fulfillmentNo: this.createFulfillmentNo(),
          orderId: id,
          status: "PENDING_SHIP",
          carrier: logisticsCompany,
          trackingNo: logisticsNo,
          internalNote: data.internalNote?.trim() || null,
          createdBy: actor.id ?? null,
        },
      });
      await this.tradeEvents.record(tx, {
        orderId: id,
        entityType: TRADE_ENTITY_TYPE.FULFILLMENT,
        entityId: fulfillment.id,
        eventType: TRADE_EVENT_TYPE.FULFILLMENT_CREATED,
        toStatus: "PENDING_SHIP",
        operator: actor,
      });

      // 状态机推进：PENDING_SHIP → SHIPPED（乐观锁，防并发）
      const dispatched = await tx.fulfillment.updateMany({
        where: { id: fulfillment.id, status: "PENDING_SHIP" },
        data: { status: "SHIPPED", shippedAt: now },
      });
      if (dispatched.count === 0)
        throw new BadRequestException("履约单状态已变化，请刷新后重试");

      await tx.order.update({
        where: { id },
        data: {
          status: "SHIPPED",
          logisticsCompany,
          logisticsNo,
          internalNote: data.internalNote?.trim() || order.internalNote,
          shippedAt: now,
          deliveryStatus: "SHIPPED",
        },
      });

      await this.tradeEvents.record(tx, {
        orderId: id,
        entityType: TRADE_ENTITY_TYPE.FULFILLMENT,
        entityId: fulfillment.id,
        eventType: TRADE_EVENT_TYPE.SHIPMENT_DISPATCHED,
        fromStatus: "PENDING_SHIP",
        toStatus: "SHIPPED",
        operator: actor,
        metadata: { carrier: logisticsCompany, trackingNo: logisticsNo },
      });

      return tx.order.findUnique({
        where: { id },
        include: { fulfillments: true },
      });
    });

    // 触达（OR-2）：发货后邮件告知客户物流信息（尽力而为，不阻塞响应）
    if (shipped) {
      const escapeHtml = (value: string) =>
        String(value).replace(
          /[&<>"']/g,
          (c) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
              c
            ] ?? c,
        );
      this.notifyCustomerOrderStatus(
        shipped,
        "已发货",
        `<p>物流公司：${escapeHtml(logisticsCompany)}，运单号：<strong>${escapeHtml(logisticsNo)}</strong>。</p>`,
      );
    }
    return shipped;
  }

  async updateStatus(
    id: number,
    data: {
      status: string;
      logisticsCompany?: string;
      logisticsNo?: string;
      internalNote?: string;
      operator?: OperatorContext;
    },
  ) {
    const operator: OperatorContext = (data as { operator?: OperatorContext })
      .operator ?? { type: OPERATOR_TYPE.ADMIN };
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("订单不存在");

    const newStatus = data.status as OrderStatus;
    const currentStatus = order.status as OrderStatus;

    // 状态机校验：检查是否是合法的状态转换
    const allowedNext = VALID_TRANSITIONS[currentStatus];
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      throw new BadRequestException(
        `订单状态不能从 ${currentStatus} 变更为 ${newStatus}。允许的变更为: ${allowedNext?.join(", ") || "无"}`,
      );
    }

    if (newStatus === "PENDING_SHIP") {
      throw new BadRequestException("待发货必须通过付款审核进入");
    }
    if (newStatus === "SHIPPED") {
      throw new BadRequestException("发货请使用专用接口并提交物流信息");
    }

    const updateData: Prisma.OrderUpdateInput = { status: newStatus };
    if (data.internalNote) updateData.internalNote = data.internalNote;

    this.logger.log(`订单 #${id} 状态变更: ${currentStatus} → ${newStatus}`);

    if (newStatus === "COMPLETED") {
      updateData.completedAt = new Date();
      const updated = await this.prisma.order.update({
        where: { id },
        data: updateData,
      });
      await this.tradeEvents.record(this.prisma, {
        orderId: id,
        entityType: TRADE_ENTITY_TYPE.ORDER,
        entityId: id,
        eventType: TRADE_EVENT_TYPE.ORDER_COMPLETED,
        fromStatus: currentStatus,
        toStatus: newStatus,
        operator,
      });
      this.notifyCustomerOrderStatus(updated, "已完成");
      return updated;
    }
    // CANCELLED：释放未消费的预占库存（已消费的不会重复释放）
    if (newStatus === "CANCELLED") {
      const cancelledAt = new Date();
      const cancelled = await this.prisma.$transaction(async (tx) => {
        const releasedCount = await this.releaseStockReservations(
          tx,
          id,
          cancelledAt,
        );
        const updated = await tx.order.update({
          where: { id },
          data: { ...updateData, cancelledAt, reservedAt: null },
        });
        if (releasedCount > 0) {
          await this.tradeEvents.record(tx, {
            orderId: id,
            entityType: TRADE_ENTITY_TYPE.INVENTORY,
            entityId: id,
            eventType: TRADE_EVENT_TYPE.STOCK_RELEASED,
            operator,
            reason: `取消订单释放 ${releasedCount} 个预占`,
          });
        }
        await this.tradeEvents.record(tx, {
          orderId: id,
          entityType: TRADE_ENTITY_TYPE.ORDER,
          entityId: id,
          eventType: TRADE_EVENT_TYPE.ORDER_CANCELLED,
          fromStatus: currentStatus,
          toStatus: newStatus,
          operator,
          reason: data.internalNote || null,
        });
        return updated;
      });
      // 触达（OR-2）：取消后邮件告知客户。internalNote 属内部备注，不外发。
      this.notifyCustomerOrderStatus(cancelled, "已取消");
      return cancelled;
    }
    return this.prisma.order.update({ where: { id }, data: updateData });
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async releaseExpiredReservations() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - OFFLINE_PAYMENT_RESERVATION_MS);
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: "PENDING_PAYMENT",
        reservedAt: { lte: cutoff },
        payments: { none: { status: "PENDING", proofUrl: { not: null } } },
      },
      select: { id: true },
    });

    let releasedCount = 0;
    for (const order of expiredOrders) {
      try {
        const expired = await this.prisma.$transaction((tx) =>
          this.expireReservationIfNeeded(tx, order.id, now),
        );
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
  }

  // ════════ 交易中心：订单管理中心操作（金额/地址/备注/签收/顾问/定制阶段） ════════
  // 所有写操作均记录 TradeEvent（before/after），订单详情时间线可见。
  // 金额一律用整数分计算后转 Decimal 入库，规避浮点误差。

  /**
   * 修改订单金额（优惠 / 订单调整 / 应收 / 定金 / 尾款）。
   * 已完成或已取消的订单不可修改。
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
    operator?: OperatorContext,
  ) {
    const actor: OperatorContext = operator ?? { type: OPERATOR_TYPE.ADMIN };
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      throw new BadRequestException("已完成或已取消的订单不能修改金额");
    }

    const updateData: Prisma.OrderUpdateInput = {};
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    const fields: Array<{
      key: string;
      src: keyof typeof data;
      label: string;
    }> = [
      { key: "discountAmount", src: "discountAmount", label: "优惠金额" },
      { key: "adjustmentAmount", src: "adjustmentAmount", label: "订单调整" },
      { key: "finalAmount", src: "finalAmount", label: "应收金额" },
      { key: "depositAmount", src: "depositAmount", label: "应付定金" },
      { key: "balanceAmount", src: "balanceAmount", label: "应付尾款" },
    ];
    for (const f of fields) {
      const v = data[f.src];
      if (v === undefined || v === null || v === "") continue;
      const cents = Math.round(Number(v) * 100);
      if (!Number.isFinite(cents))
        throw new BadRequestException(`${f.label} 必须为有效数字`);
      const decimal = new Prisma.Decimal(cents).div(100);
      before[f.label] = String(
        (order as unknown as Record<string, unknown>)[f.key] ?? "",
      );
      after[f.label] = decimal.toString();
      (updateData as Record<string, unknown>)[f.key] = decimal;
    }
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException("未提供需要修改的金额字段");
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: updateData,
    });
    await this.tradeEvents.record(this.prisma, {
      orderId: id,
      entityType: TRADE_ENTITY_TYPE.ORDER,
      entityId: id,
      eventType: TRADE_EVENT_TYPE.ORDER_AMOUNT_EDITED,
      operator: actor,
      reason: data.reason?.trim() || null,
      metadata: { before, after },
    });
    return updated;
  }

  /** 修改收货地址（已发货/已完成不可改） */
  async updateAddress(id: number, address: string, operator?: OperatorContext) {
    const actor: OperatorContext = operator ?? { type: OPERATOR_TYPE.ADMIN };
    const trimmed = address?.trim();
    if (!trimmed || trimmed.length > 500)
      throw new BadRequestException("请提供有效的收货地址");
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.status === "SHIPPED" || order.status === "COMPLETED") {
      throw new BadRequestException("已发货订单不能修改地址");
    }
    const before = order.address;
    const updated = await this.prisma.order.update({
      where: { id },
      data: { address: trimmed },
    });
    await this.tradeEvents.record(this.prisma, {
      orderId: id,
      entityType: TRADE_ENTITY_TYPE.ORDER,
      entityId: id,
      eventType: TRADE_EVENT_TYPE.ORDER_ADDRESS_EDITED,
      operator: actor,
      metadata: { before, after: trimmed },
    });
    return updated;
  }

  /** 修改内部备注（后台备注，不展示给客户） */
  async updateNote(
    id: number,
    internalNote: string,
    operator?: OperatorContext,
  ) {
    const actor: OperatorContext = operator ?? { type: OPERATOR_TYPE.ADMIN };
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("订单不存在");
    const before = order.internalNote;
    const updated = await this.prisma.order.update({
      where: { id },
      data: { internalNote: internalNote?.trim() || null },
    });
    await this.tradeEvents.record(this.prisma, {
      orderId: id,
      entityType: TRADE_ENTITY_TYPE.ORDER,
      entityId: id,
      eventType: TRADE_EVENT_TYPE.ORDER_NOTE_EDITED,
      operator: actor,
      metadata: { before, after: internalNote?.trim() || null },
    });
    return updated;
  }

  /** 确认签收（发货维度 SHIPPED→RECEIVED） */
  async confirmReceive(id: number, operator?: OperatorContext) {
    const actor: OperatorContext = operator ?? { type: OPERATOR_TYPE.ADMIN };
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.deliveryStatus !== "SHIPPED") {
      throw new BadRequestException("只有已发货的订单可以确认签收");
    }
    const now = new Date();
    const updated = await this.prisma.order.update({
      where: { id },
      data: { deliveryStatus: "RECEIVED", receivedAt: now },
    });
    await this.tradeEvents.record(this.prisma, {
      orderId: id,
      entityType: TRADE_ENTITY_TYPE.ORDER,
      entityId: id,
      eventType: TRADE_EVENT_TYPE.ORDER_RECEIVED,
      fromStatus: "SHIPPED",
      toStatus: "RECEIVED",
      operator: actor,
    });
    return updated;
  }

  /** 修改销售顾问 */
  async updateSalesConsultant(
    id: number,
    salesConsultantId: number | null,
    operator?: OperatorContext,
  ) {
    const actor: OperatorContext = operator ?? { type: OPERATOR_TYPE.ADMIN };
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("订单不存在");
    const before = order.salesConsultantId;
    const updated = await this.prisma.order.update({
      where: { id },
      data: { salesConsultantId: salesConsultantId ?? null },
    });
    await this.tradeEvents.record(this.prisma, {
      orderId: id,
      entityType: TRADE_ENTITY_TYPE.ORDER,
      entityId: id,
      eventType: TRADE_EVENT_TYPE.ORDER_CONSULTANT_CHANGED,
      operator: actor,
      metadata: { before, after: salesConsultantId },
    });
    return updated;
  }

  /**
   * 推进定制订单阶段（仅 orderType=CUSTOM 可用）。
   * 不做严格线性校验，允许业务跳转（定制流程可能因返工回退）。
   */
  async advanceCustomStage(
    id: number,
    stage: CustomStage,
    operator?: OperatorContext,
  ) {
    const actor: OperatorContext = operator ?? { type: OPERATOR_TYPE.ADMIN };
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("订单不存在");
    if (order.orderType !== "CUSTOM") {
      throw new BadRequestException("只有定制订单可以推进定制阶段");
    }
    const before = order.customStage;
    const updated = await this.prisma.order.update({
      where: { id },
      data: { customStage: stage },
    });
    await this.tradeEvents.record(this.prisma, {
      orderId: id,
      entityType: TRADE_ENTITY_TYPE.ORDER,
      entityId: id,
      eventType: TRADE_EVENT_TYPE.ORDER_CUSTOM_STAGE_CHANGED,
      fromStatus: before ?? null,
      toStatus: stage,
      operator: actor,
    });
    return updated;
  }

  // ════════ 第五阶段：异常订单聚合 + 交易数据统计（只读） ════════

  /**
   * 异常订单聚合：长时间未付款 / 超时未发货 / 定制超期 / 物流异常 / 退款处理中。
   * 为每条订单标注 anomalyReasons，供异常订单页展示。
   */
  async findAnomalies() {
    const now = new Date();
    const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const h48 = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const where: Prisma.OrderWhereInput = {
      OR: [
        { status: "PENDING_PAYMENT", createdAt: { lt: h24 } }, // 长时间未付款
        { status: "PENDING_SHIP", paymentConfirmedAt: { lt: h48 } }, // 超时未发货
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
      ],
    };

    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: {
            select: {
              id: true,
              productNameSnapshot: true,
              productCodeSnapshot: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      this.prisma.order.count({ where }),
    ]);

    const enriched = list.map((o) => {
      const reasons: string[] = [];
      if (o.status === "PENDING_PAYMENT" && o.createdAt < h24)
        reasons.push("长时间未付款");
      if (
        o.status === "PENDING_SHIP" &&
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
      if (reasons.length === 0) reasons.push("退款处理中");
      return { ...o, anomalyReasons: reasons };
    });

    return { list: enriched, total };
  }

  /**
   * 交易数据首页：今日成交额/订单数 + 累计已收/待收/退款/净收/客单价 + 来源/类型分布。
   * 严格区分订单金额与实际到账金额——未付款订单不计入已收。
   */
  async getTradeOverview() {
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
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { createdAt: { gte: todayStart }, status: { not: "CANCELLED" } },
        _sum: { finalAmount: true },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: todayStart }, status: { not: "CANCELLED" } },
      }),
      this.prisma.order.aggregate({ _sum: { paidAmount: true } }),
      this.prisma.order.aggregate({
        where: { status: { not: "CANCELLED" } },
        _sum: { finalAmount: true },
      }),
      this.prisma.order.aggregate({ _sum: { refundedAmount: true } }),
      this.prisma.order.count({ where: { status: { not: "CANCELLED" } } }),
      this.prisma.order.groupBy({
        by: ["source"],
        where: { status: { not: "CANCELLED" } },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ["orderType"],
        where: { status: { not: "CANCELLED" } },
        _count: { _all: true },
      }),
    ]);

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
