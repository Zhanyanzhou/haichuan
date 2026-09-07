import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TradeEventsService } from '../trade-events/trade-events.service';
import { TRADE_ENTITY_TYPE, TRADE_EVENT_TYPE, type OperatorContext } from '../trade-events/trade-events.constants';
import { Prisma, type FulfillmentStatus } from '@prisma/client';
import { ReliableNotificationIntentService } from '../../common/notifications/reliable-notification-intent.service';

const PENDING_FULFILLMENT_STATUSES: FulfillmentStatus[] = ['PENDING_PICK', 'PENDING_CHECK', 'PENDING_SHIP'];
const ACTIVE_REFUND_STATUSES = ['PENDING', 'APPROVED', 'PROCESSING'] as const;
const ACTIVE_AFTER_SALES_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'RETURNING',
  'QC_PASSED',
  'QC_FAILED',
] as const;

const fulfillmentListSelect = {
  id: true,
  fulfillmentNo: true,
  orderId: true,
  status: true,
  carrier: true,
  trackingNo: true,
  shippedAt: true,
  deliveredAt: true,
  abnormalReason: true,
  createdAt: true,
  updatedAt: true,
  order: {
    select: {
      id: true,
      orderNo: true,
      status: true,
      deliveryStatus: true,
      customerName: true,
      customerPhone: true,
    },
  },
} satisfies Prisma.FulfillmentSelect;

const fulfillmentDetailSelect = {
  ...fulfillmentListSelect,
  internalNote: true,
  order: {
    select: {
      ...fulfillmentListSelect.order.select,
      address: true,
      items: {
        select: {
          id: true,
          quantity: true,
          productNameSnapshot: true,
          productImageSnapshot: true,
          productCodeSnapshot: true,
          skuSnapshot: true,
          actualWeight: true,
          certNumber: true,
        },
      },
    },
  },
} satisfies Prisma.FulfillmentSelect;

function maskPhone(phone: string): string {
  const normalized = phone.trim();
  if (normalized.length < 7) return '***';
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

/**
 * 履约服务：管理拣货→复核→发货→送达生命周期。
 *
 * 包裹状态只允许由本服务写入；订单中心入口仅保留单包裹兼容委托。
 * 所有包裹更新、订单聚合、审计事件和发货通知意图共享同一个订单行锁事务。
 */
@Injectable()
export class FulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradeEvents: TradeEventsService,
    private readonly reliableNotifications: ReliableNotificationIntentService,
  ) {}

  private async lockOrder(tx: Prisma.TransactionClient, orderId: number) {
    const rows = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException('订单不存在');
  }

  private async assertDispatchIsNotBlocked(tx: Prisma.TransactionClient, orderId: number) {
    const [activeRefund, activeAfterSales] = await Promise.all([
      tx.refund.findFirst({
        where: { orderId, status: { in: [...ACTIVE_REFUND_STATUSES] } },
        select: { id: true },
      }),
      tx.afterSalesCase.findFirst({
        where: { orderId, status: { in: [...ACTIVE_AFTER_SALES_STATUSES] } },
        select: { id: true },
      }),
    ]);
    if (activeRefund || activeAfterSales) {
      throw new ConflictException('订单存在处理中的退款或售后，暂不可发货');
    }
  }

  private async synchronizeOrderAggregate(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      status: string;
      deliveryStatus: string;
      shippedAt: Date | null;
      receivedAt: Date | null;
    },
    operator: OperatorContext,
  ) {
    const fulfillments = await tx.fulfillment.findMany({
      where: { orderId: order.id },
      orderBy: { id: 'asc' },
      select: {
        status: true,
        carrier: true,
        trackingNo: true,
        shippedAt: true,
        deliveredAt: true,
      },
    });
    if (fulfillments.length === 0) {
      throw new ConflictException('订单缺少履约单，不能同步履约状态');
    }

    const hasPending = fulfillments.some((item) =>
      PENDING_FULFILLMENT_STATUSES.includes(item.status),
    );
    const hasAbnormal = fulfillments.some((item) => item.status === 'ABNORMAL');
    const allDelivered = fulfillments.every((item) => item.status === 'DELIVERED');
    const allDispatched = !hasPending;
    const nextOrderStatus = order.status === 'PENDING_SHIP' && allDispatched
      ? 'SHIPPED'
      : order.status;
    const nextDeliveryStatus = hasAbnormal
      ? 'ABNORMAL'
      : allDelivered
        ? 'RECEIVED'
        : allDispatched
          ? 'SHIPPED'
          : 'PENDING_SHIP';
    const shippedTimes = fulfillments
      .map((item) => item.shippedAt)
      .filter((value): value is Date => Boolean(value));
    const deliveredTimes = fulfillments
      .map((item) => item.deliveredAt)
      .filter((value): value is Date => Boolean(value));
    const single = fulfillments.length === 1 ? fulfillments[0] : null;
    const shippedAt = allDispatched && shippedTimes.length > 0
      ? new Date(Math.max(...shippedTimes.map((value) => value.getTime())))
      : null;
    const receivedAt = allDelivered && deliveredTimes.length > 0
      ? new Date(Math.max(...deliveredTimes.map((value) => value.getTime())))
      : null;
    const previousDeliveryStatus = order.deliveryStatus;

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: nextOrderStatus as 'PENDING_SHIP' | 'SHIPPED',
        deliveryStatus: nextDeliveryStatus,
        shippedAt,
        receivedAt,
        logisticsCompany: single && !hasPending ? single.carrier : null,
        logisticsNo: single && !hasPending ? single.trackingNo : null,
      },
    });

    if (previousDeliveryStatus !== 'RECEIVED' && nextDeliveryStatus === 'RECEIVED') {
      await this.tradeEvents.record(tx, {
        orderId: order.id,
        entityType: TRADE_ENTITY_TYPE.ORDER,
        entityId: order.id,
        eventType: TRADE_EVENT_TYPE.ORDER_RECEIVED,
        fromStatus: previousDeliveryStatus,
        toStatus: 'RECEIVED',
        operator,
      });
    }

    return { allDispatched, allDelivered, deliveryStatus: nextDeliveryStatus };
  }

  async findAll(params: { page?: number; pageSize?: number; status?: string; keyword?: string }) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Prisma.FulfillmentWhereInput = {};
    if (params.status && params.status !== 'all') where.status = params.status as FulfillmentStatus;
    if (params.keyword) {
      where.OR = [
        { fulfillmentNo: { contains: params.keyword } },
        { trackingNo: { contains: params.keyword } },
        { order: { orderNo: { contains: params.keyword } } },
        { order: { customerName: { contains: params.keyword } } },
      ];
    }

    const [list, total] = await Promise.all([
      this.prisma.fulfillment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: fulfillmentListSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fulfillment.count({ where }),
    ]);
    return {
      list: list.map((fulfillment) => ({
        ...fulfillment,
        order: {
          ...fulfillment.order,
          customerPhone: maskPhone(fulfillment.order.customerPhone),
        },
      })),
      total,
      page,
      pageSize,
    };
  }

  async findById(id: number) {
    const fulfillment = await this.prisma.fulfillment.findUnique({
      where: { id },
      select: fulfillmentDetailSelect,
    });
    if (!fulfillment) throw new NotFoundException('履约单不存在');

    const terminal = fulfillment.status === 'DELIVERED';
    const { internalNote, order, ...safeFulfillment } = fulfillment;
    return {
      ...safeFulfillment,
      warehouseNote: internalNote,
      order: {
        ...order,
        customerPhone: terminal ? maskPhone(order.customerPhone) : order.customerPhone,
        address: terminal ? null : order.address,
      },
    };
  }

  /**
   * 从履约中心发货：将待发货履约单推进为已发货，同步订单状态。
   * 仅允许对 PENDING_PICK/PENDING_CHECK/PENDING_SHIP 的履约单操作；
   * 订单必须处于 PENDING_SHIP（已付款）。
   */
  async dispatch(
    fulfillmentId: number,
    dto: { carrier: string; trackingNo: string; internalNote?: string },
    operator: OperatorContext,
    options: { requireSingleOrderId?: number } = {},
  ) {
    const carrier = dto.carrier?.trim();
    const trackingNo = dto.trackingNo?.trim();
    if (!carrier || !trackingNo) throw new BadRequestException('发货必须填写承运商和运单号');

    const fulfillmentRef = await this.prisma.fulfillment.findUnique({
      where: { id: fulfillmentId },
      select: { orderId: true },
    });
    if (!fulfillmentRef) throw new NotFoundException('履约单不存在');

    return this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, fulfillmentRef.orderId);
      const fulfillment = await tx.fulfillment.findUnique({ where: { id: fulfillmentId }, include: { order: true } });
      if (!fulfillment || fulfillment.orderId !== fulfillmentRef.orderId) {
        throw new NotFoundException('履约单不存在');
      }
      if (
        options.requireSingleOrderId !== undefined &&
        fulfillment.orderId !== options.requireSingleOrderId
      ) {
        throw new ConflictException('履约单与订单不匹配，请前往履约中心处理');
      }
      if (options.requireSingleOrderId !== undefined) {
        const packageCount = await tx.fulfillment.count({
          where: { orderId: fulfillment.orderId },
        });
        if (packageCount !== 1) {
          throw new ConflictException('多包裹订单请前往履约中心逐包发货');
        }
      }

      if (['SHIPPED', 'ABNORMAL', 'DELIVERED'].includes(fulfillment.status)) {
        if (fulfillment.carrier === carrier && fulfillment.trackingNo === trackingNo) {
          return tx.fulfillment.findUnique({ where: { id: fulfillmentId } });
        }
        throw new ConflictException('履约单已发货，物流信息不一致，不能重复发货');
      }
      if (!PENDING_FULFILLMENT_STATUSES.includes(fulfillment.status)) {
        throw new BadRequestException('当前履约单状态不可发货');
      }
      if (fulfillment.order.status !== 'PENDING_SHIP') {
        throw new BadRequestException('订单未完成付款审核，不可发货');
      }
      await this.assertDispatchIsNotBlocked(tx, fulfillment.orderId);

      // 乐观锁：防止并发发货
      const now = new Date();
      const updated = await tx.fulfillment.updateMany({
        where: { id: fulfillmentId, status: { in: PENDING_FULFILLMENT_STATUSES } },
        data: { status: 'SHIPPED', carrier, trackingNo, shippedAt: now, internalNote: dto.internalNote?.trim() || fulfillment.internalNote },
      });
      if (updated.count === 0) throw new BadRequestException('履约单状态已变化，请刷新后重试');

      const aggregate = await this.synchronizeOrderAggregate(
        tx,
        fulfillment.order,
        operator,
      );

      await this.tradeEvents.record(tx, {
        orderId: fulfillment.orderId, entityType: TRADE_ENTITY_TYPE.FULFILLMENT, entityId: fulfillmentId,
        eventType: TRADE_EVENT_TYPE.SHIPMENT_DISPATCHED, fromStatus: fulfillment.status, toStatus: 'SHIPPED',
        operator,
        metadata: {
          carrier,
          trackingNo,
          warehouseId: fulfillment.warehouseId,
          allDispatched: aggregate.allDispatched,
        },
      });

      await this.reliableNotifications.enqueueOrderLifecycle(tx, fulfillment.order, {
        event: 'SHIPPED',
        fulfillmentId,
        carrier,
        trackingNo,
      });

      return tx.fulfillment.findUnique({ where: { id: fulfillmentId } });
    });
  }

  /** 更新履约状态：送达 / 物流异常 */
  async updateStatus(
    fulfillmentId: number,
    dto: { status: string; abnormalReason?: string; internalNote?: string },
    operator: OperatorContext,
    options: { requireSingleOrderId?: number } = {},
  ) {
    // 事务外只定位不可变 orderId，避免 MySQL 在订单锁前建立旧的一致性读快照。
    const fulfillmentRef = await this.prisma.fulfillment.findUnique({
      where: { id: fulfillmentId },
      select: { orderId: true },
    });
    if (!fulfillmentRef) throw new NotFoundException('履约单不存在');

    return this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, fulfillmentRef.orderId);
      const fulfillment = await tx.fulfillment.findUnique({
        where: { id: fulfillmentId },
        include: { order: true },
      });
      if (!fulfillment || fulfillment.orderId !== fulfillmentRef.orderId) {
        throw new NotFoundException('履约单不存在');
      }
      if (
        options.requireSingleOrderId !== undefined &&
        fulfillment.orderId !== options.requireSingleOrderId
      ) {
        throw new ConflictException('履约单与订单不匹配，请前往履约中心处理');
      }
      if (options.requireSingleOrderId !== undefined) {
        const packageCount = await tx.fulfillment.count({
          where: { orderId: fulfillment.orderId },
        });
        if (packageCount !== 1) {
          throw new ConflictException('多包裹订单请前往履约中心逐包确认送达');
        }
      }
      if (!['PENDING_SHIP', 'SHIPPED'].includes(fulfillment.order.status)) {
        throw new ConflictException('订单状态已变化，不能更新物流状态');
      }

      const newStatus = dto.status as FulfillmentStatus;
      const now = new Date();

      if (newStatus === 'DELIVERED') {
        // 重复物流回调幂等：不重复推进、不重复记录事件；同时可修复历史上已送达但订单未同步的事实。
        if (fulfillment.status === 'DELIVERED') {
          await this.synchronizeOrderAggregate(tx, fulfillment.order, operator);
          return tx.fulfillment.findUnique({ where: { id: fulfillmentId } });
        }
        if (!['SHIPPED', 'ABNORMAL'].includes(fulfillment.status)) {
          throw new BadRequestException('只有已发货或物流异常的履约单可标记送达');
        }
        const delivered = await tx.fulfillment.updateMany({
          where: { id: fulfillmentId, status: { in: ['SHIPPED', 'ABNORMAL'] } },
          data: { status: 'DELIVERED', deliveredAt: now, abnormalReason: null },
        });
        if (delivered.count === 0) {
          throw new ConflictException('履约单状态已变化，请刷新后重试');
        }
        await this.tradeEvents.record(tx, {
          orderId: fulfillment.orderId, entityType: TRADE_ENTITY_TYPE.FULFILLMENT, entityId: fulfillmentId,
          eventType: TRADE_EVENT_TYPE.FULFMENT_DELIVERED, fromStatus: fulfillment.status, toStatus: 'DELIVERED', operator,
        });
      } else if (newStatus === 'ABNORMAL') {
        if (!dto.abnormalReason?.trim()) throw new BadRequestException('物流异常必须填写异常原因');
        if (fulfillment.status === 'ABNORMAL') {
          await this.synchronizeOrderAggregate(tx, fulfillment.order, operator);
          return tx.fulfillment.findUnique({ where: { id: fulfillmentId } });
        }
        if (fulfillment.status !== 'SHIPPED') {
          throw new BadRequestException('只有已发货且未送达的履约单可以标记物流异常');
        }
        const abnormal = await tx.fulfillment.updateMany({
          where: { id: fulfillmentId, status: 'SHIPPED' },
          data: { status: 'ABNORMAL', abnormalReason: dto.abnormalReason.trim(), internalNote: dto.internalNote?.trim() || fulfillment.internalNote },
        });
        if (abnormal.count === 0) {
          throw new ConflictException('履约单状态已变化，请刷新后重试');
        }
        await this.tradeEvents.record(tx, {
          orderId: fulfillment.orderId, entityType: TRADE_ENTITY_TYPE.FULFILLMENT, entityId: fulfillmentId,
          eventType: TRADE_EVENT_TYPE.FULFILLMENT_ABNORMAL, fromStatus: fulfillment.status, toStatus: 'ABNORMAL',
          operator, reason: dto.abnormalReason.trim(),
        });
      } else {
        throw new BadRequestException('仅支持标记送达或物流异常');
      }

      await this.synchronizeOrderAggregate(tx, fulfillment.order, operator);

      return tx.fulfillment.findUnique({ where: { id: fulfillmentId } });
    });
  }
}
