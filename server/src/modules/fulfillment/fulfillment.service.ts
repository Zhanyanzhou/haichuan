import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TradeEventsService } from '../trade-events/trade-events.service';
import { TRADE_ENTITY_TYPE, TRADE_EVENT_TYPE, type OperatorContext } from '../trade-events/trade-events.constants';
import { Prisma, type FulfillmentStatus } from '@prisma/client';

/**
 * 履约服务：管理拣货→复核→发货→送达生命周期。
 *
 * MVP 一单一包裹：一个 Order 对应一个 Fulfillment。
 * 发货主路径为 OrdersService.ship()（创建并立即发货）；
 * 本服务提供履约中心的列表、详情、状态推进（送达/异常）能力。
 */
@Injectable()
export class FulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradeEvents: TradeEventsService,
  ) {}

  private async lockOrder(tx: Prisma.TransactionClient, orderId: number) {
    const rows = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException('订单不存在');
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
        include: {
          order: {
            select: { id: true, orderNo: true, customerName: true, customerPhone: true, finalAmount: true, status: true },
          },
          creator: { select: { id: true, realName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fulfillment.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const fulfillment = await this.prisma.fulfillment.findUnique({
      where: { id },
      include: {
        order: { include: { items: true } },
        creator: { select: { id: true, realName: true, username: true } },
      },
    });
    if (!fulfillment) throw new NotFoundException('履约单不存在');
    return fulfillment;
  }

  /**
   * 从履约中心发货：将待发货履约单推进为已发货，同步订单状态。
   * 仅允许对 PENDING_PICK/PENDING_CHECK/PENDING_SHIP 的履约单操作；
   * 订单必须处于 PENDING_SHIP（已付款）。
   */
  async dispatch(fulfillmentId: number, dto: { carrier: string; trackingNo: string; internalNote?: string }, operator: OperatorContext) {
    const carrier = dto.carrier?.trim();
    const trackingNo = dto.trackingNo?.trim();
    if (!carrier || !trackingNo) throw new BadRequestException('发货必须填写承运商和运单号');

    return this.prisma.$transaction(async (tx) => {
      const fulfillment = await tx.fulfillment.findUnique({ where: { id: fulfillmentId }, include: { order: true } });
      if (!fulfillment) throw new NotFoundException('履约单不存在');
      if (!['PENDING_PICK', 'PENDING_CHECK', 'PENDING_SHIP'].includes(fulfillment.status)) {
        throw new BadRequestException('当前履约单状态不可发货');
      }
      if (fulfillment.order.status !== 'PENDING_SHIP') {
        throw new BadRequestException('订单未完成付款审核，不可发货');
      }

      // 乐观锁：防止并发发货
      const now = new Date();
      const updated = await tx.fulfillment.updateMany({
        where: { id: fulfillmentId, status: { in: ['PENDING_PICK', 'PENDING_CHECK', 'PENDING_SHIP'] } },
        data: { status: 'SHIPPED', carrier, trackingNo, shippedAt: now, internalNote: dto.internalNote?.trim() || fulfillment.internalNote },
      });
      if (updated.count === 0) throw new BadRequestException('履约单状态已变化，请刷新后重试');

      await tx.order.update({
        where: { id: fulfillment.orderId },
        data: {
          status: 'SHIPPED',
          deliveryStatus: 'SHIPPED',
          logisticsCompany: carrier,
          logisticsNo: trackingNo,
          shippedAt: now,
        },
      });

      await this.tradeEvents.record(tx, {
        orderId: fulfillment.orderId, entityType: TRADE_ENTITY_TYPE.FULFILLMENT, entityId: fulfillmentId,
        eventType: TRADE_EVENT_TYPE.SHIPMENT_DISPATCHED, fromStatus: fulfillment.status, toStatus: 'SHIPPED',
        operator, metadata: { carrier, trackingNo },
      });

      return tx.fulfillment.findUnique({ where: { id: fulfillmentId } });
    });
  }

  /** 更新履约状态：送达 / 物流异常 */
  async updateStatus(
    fulfillmentId: number,
    dto: { status: string; abnormalReason?: string; internalNote?: string },
    operator: OperatorContext,
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

      const newStatus = dto.status as FulfillmentStatus;
      const now = new Date();

      if (newStatus === 'DELIVERED') {
        // 重复物流回调幂等：不重复推进、不重复记录事件；同时可修复历史上已送达但订单未同步的事实。
        if (fulfillment.status === 'DELIVERED') {
          await tx.order.updateMany({
            where: { id: fulfillment.orderId, status: 'SHIPPED' },
            data: {
              deliveryStatus: 'RECEIVED',
              receivedAt: fulfillment.deliveredAt ?? now,
            },
          });
          return tx.fulfillment.findUnique({ where: { id: fulfillmentId } });
        }
        if (fulfillment.status !== 'SHIPPED') {
          throw new BadRequestException('只有已发货的履约单可标记送达');
        }
        if (fulfillment.order.status !== 'SHIPPED') {
          throw new ConflictException('订单状态已变化，不能标记送达');
        }
        const delivered = await tx.fulfillment.updateMany({
          where: { id: fulfillmentId, status: 'SHIPPED' },
          data: { status: 'DELIVERED', deliveredAt: now },
        });
        if (delivered.count === 0) {
          throw new ConflictException('履约单状态已变化，请刷新后重试');
        }
        const orderSynced = await tx.order.updateMany({
          where: { id: fulfillment.orderId, status: 'SHIPPED' },
          data: { deliveryStatus: 'RECEIVED', receivedAt: now },
        });
        if (orderSynced.count === 0) {
          throw new ConflictException('订单状态已变化，不能标记送达');
        }
        await this.tradeEvents.record(tx, {
          orderId: fulfillment.orderId, entityType: TRADE_ENTITY_TYPE.FULFILLMENT, entityId: fulfillmentId,
          eventType: TRADE_EVENT_TYPE.FULFMENT_DELIVERED, fromStatus: fulfillment.status, toStatus: 'DELIVERED', operator,
        });
      } else if (newStatus === 'ABNORMAL') {
        if (!dto.abnormalReason?.trim()) throw new BadRequestException('物流异常必须填写异常原因');
        await tx.fulfillment.update({
          where: { id: fulfillmentId },
          data: { status: 'ABNORMAL', abnormalReason: dto.abnormalReason.trim(), internalNote: dto.internalNote?.trim() || fulfillment.internalNote },
        });
        // 同步订单发货维度为异常：异常订单聚合 findAnomalies 依据 order.deliveryStatus 筛选，
        // 缺此回写则仓储标记的物流异常永远进不了异常订单页。
        await tx.order.update({
          where: { id: fulfillment.orderId },
          data: { deliveryStatus: 'ABNORMAL' },
        });
        await this.tradeEvents.record(tx, {
          orderId: fulfillment.orderId, entityType: TRADE_ENTITY_TYPE.FULFILLMENT, entityId: fulfillmentId,
          eventType: TRADE_EVENT_TYPE.FULFILLMENT_ABNORMAL, fromStatus: fulfillment.status, toStatus: 'ABNORMAL',
          operator, reason: dto.abnormalReason.trim(),
        });
      } else {
        throw new BadRequestException('仅支持标记送达或物流异常');
      }

      return tx.fulfillment.findUnique({ where: { id: fulfillmentId } });
    });
  }
}
