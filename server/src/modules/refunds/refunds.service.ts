import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, PaymentStatus, RefundStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TradeEventsService } from '../trade-events/trade-events.service';
import { TRADE_ENTITY_TYPE, TRADE_EVENT_TYPE, type OperatorContext } from '../trade-events/trade-events.constants';

/**
 * 退款服务：申请→审核→人工执行→完成/拒绝。
 *
 * 金额一致性（硬约束）：
 * - 累计退款（PENDING + APPROVED + PROCESSING + COMPLETED）不得超过订单已确认收款总额；
 * - 用整数分计算，避免浮点误差；
 * - 退款审核/执行使用乐观锁（状态条件更新），并发只有一个成功。
 *
 * 幂等：
 * - 创建退款支持 idempotencyKey，同键重复提交返回既有记录，不重复创建。
 */
@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradeEvents: TradeEventsService,
  ) {}

  private createRefundNo(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `RFD${date}${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }

  /** 计算订单已确认收款总额（PAID 付款的 amount 之和，整数分） */
  private async getPaidCents(orderId: number): Promise<number> {
    const payments = await this.prisma.payment.findMany({
      where: { orderId, status: 'PAID' },
      select: { amount: true },
    });
    return payments.reduce((sum, p) => sum + Math.round(Number(p.amount) * 100), 0);
  }

  /** 计算订单已发起（未拒绝/未失败）的退款总额（整数分） */
  private async getActiveRefundCents(orderId: number, excludeRefundId?: number): Promise<number> {
    const refunds = await this.prisma.refund.findMany({
      where: {
        orderId,
        status: { in: ['PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED'] },
        ...(excludeRefundId ? { id: { not: excludeRefundId } } : {}),
      },
      select: { amount: true },
    });
    return refunds.reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0);
  }

  async findAll(params: { page?: number; pageSize?: number; status?: string; keyword?: string }) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Prisma.RefundWhereInput = {};
    if (params.status && params.status !== 'all') where.status = params.status as RefundStatus;
    if (params.keyword) {
      where.OR = [
        { refundNo: { contains: params.keyword } },
        { order: { orderNo: { contains: params.keyword } } },
        { order: { customerName: { contains: params.keyword } } },
        { order: { customerPhone: { contains: params.keyword } } },
      ];
    }

    const [list, total] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: { select: { id: true, orderNo: true, customerName: true, customerPhone: true, finalAmount: true, status: true } },
          requester: { select: { id: true, realName: true, username: true } },
          reviewer: { select: { id: true, realName: true, username: true } },
          processor: { select: { id: true, realName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.refund.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      include: {
        order: { include: { items: true, payments: true } },
        requester: { select: { id: true, realName: true, username: true } },
        reviewer: { select: { id: true, realName: true, username: true } },
        processor: { select: { id: true, realName: true, username: true } },
      },
    });
    if (!refund) throw new NotFoundException('退款记录不存在');
    return refund;
  }

  /** 创建退款申请 */
  async create(data: {
    orderId: number;
    paymentId?: number;
    amount: number;
    reason: string;
    idempotencyKey?: string;
    afterSalesCaseId?: number;
    operator: OperatorContext;
  }) {
    // 幂等：同 idempotencyKey 命中既有记录则直接返回
    if (data.idempotencyKey) {
      const existing = await this.prisma.refund.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (existing) return existing;
    }

    const amountCents = Math.round(data.amount * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new BadRequestException('退款金额必须为正数');
    }

    // 校验订单存在且有已确认收款
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      include: { payments: { where: { status: 'PAID' }, select: { id: true, amount: true } } },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.payments.length === 0) throw new BadRequestException('订单尚无已确认收款，不可退款');

    // 确定关联付款记录
    let paymentId = data.paymentId;
    if (!paymentId) {
      paymentId = order.payments[0].id;
    } else if (!order.payments.some((p) => p.id === paymentId)) {
      throw new BadRequestException('关联的付款记录不属于该订单或未确认收款');
    }

    // 金额校验：退款后累计不得超过已收款
    const paidCents = await this.getPaidCents(data.orderId);
    const activeRefundCents = await this.getActiveRefundCents(data.orderId);
    if (activeRefundCents + amountCents > paidCents) {
      const available = ((paidCents - activeRefundCents) / 100).toFixed(2);
      throw new BadRequestException(`退款金额超过可退额度，当前最多可退 ¥${available}`);
    }

    const refund = await this.prisma.refund.create({
      data: {
        refundNo: this.createRefundNo(),
        orderId: data.orderId,
        paymentId,
        amount: new Prisma.Decimal(amountCents).div(100),
        reason: data.reason.trim(),
        status: 'PENDING',
        idempotencyKey: data.idempotencyKey ?? null,
        afterSalesCaseId: data.afterSalesCaseId ?? null,
        requestedBy: data.operator.id ?? null,
      },
    });

    await this.tradeEvents.record(this.prisma, {
      orderId: data.orderId, entityType: TRADE_ENTITY_TYPE.REFUND, entityId: refund.id,
      eventType: TRADE_EVENT_TYPE.REFUND_REQUESTED, toStatus: 'PENDING',
      operator: data.operator,
      metadata: { amount: refund.amount.toString(), paymentId },
    });

    return refund;
  }

  /** 审核退款：通过/拒绝 */
  async review(refundId: number, action: 'APPROVED' | 'REJECTED', reviewNote: string | undefined, operator: OperatorContext) {
    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { id: refundId } });
      if (!refund) throw new NotFoundException('退款记录不存在');
      if (refund.status !== 'PENDING') {
        throw new BadRequestException('只有待审核的退款可以审核');
      }

      // 审核通过时再次校验金额（防止审核期间其它退款已完成）
      if (action === 'APPROVED') {
        const paidCents = await this.getPaidCents(refund.orderId);
        const activeCents = await this.getActiveRefundCents(refund.orderId, refundId);
        const thisCents = Math.round(Number(refund.amount) * 100);
        if (activeCents + thisCents > paidCents) {
          throw new BadRequestException('退款金额超过可退额度（可能其它退款已先行执行）');
        }
      }

      // 乐观锁推进
      const newStatus = action === 'APPROVED' ? 'APPROVED' : 'REJECTED';
      const updated = await tx.refund.updateMany({
        where: { id: refundId, status: 'PENDING' },
        data: {
          status: newStatus,
          reviewedBy: operator.id ?? null,
          reviewedAt: new Date(),
          reviewNote: reviewNote?.trim() || null,
        },
      });
      if (updated.count === 0) throw new ConflictException('退款记录已被处理，请刷新后重试');

      const eventType = action === 'APPROVED' ? TRADE_EVENT_TYPE.REFUND_APPROVED : TRADE_EVENT_TYPE.REFUND_REJECTED;
      await this.tradeEvents.record(tx, {
        orderId: refund.orderId, entityType: TRADE_ENTITY_TYPE.REFUND, entityId: refundId,
        eventType, fromStatus: 'PENDING', toStatus: newStatus, operator, reason: reviewNote?.trim() || null,
      });

      return tx.refund.findUnique({ where: { id: refundId } });
    });
  }

  /** 执行退款：标记完成/失败（人工执行；未来对接第三方网关时在此扩展） */
  async execute(refundId: number, action: 'COMPLETED' | 'FAILED', gatewayRefundNo: string | undefined, operator: OperatorContext) {
    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { id: refundId } });
      if (!refund) throw new NotFoundException('退款记录不存在');
      if (refund.status !== 'APPROVED' && refund.status !== 'PROCESSING') {
        throw new BadRequestException('只有已审核通过或执行中的退款可以执行');
      }

      const now = new Date();
      if (action === 'COMPLETED') {
        const updated = await tx.refund.updateMany({
          where: { id: refundId, status: { in: ['APPROVED', 'PROCESSING'] } },
          data: {
            status: 'COMPLETED',
            processedBy: operator.id ?? null,
            processedAt: now,
            completedAt: now,
            gatewayRefundNo: gatewayRefundNo || refund.gatewayRefundNo,
          },
        });
        if (updated.count === 0) throw new ConflictException('退款记录状态已变化，请刷新后重试');

        // 同步订单 Payment 退款状态（用于订单中心展示）
        const allRefunds = await tx.refund.findMany({
          where: { orderId: refund.orderId, status: 'COMPLETED' },
          select: { amount: true },
        });
        const refundedCents = allRefunds.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0);
        const paidCents = await this.getPaidCents(refund.orderId);
        const paymentStatus = refundedCents >= paidCents ? 'REFUNDED' : 'PARTIAL_REFUND';
        if (refund.paymentId) {
          await tx.payment.updateMany({
            where: { id: refund.paymentId },
            data: { status: paymentStatus as PaymentStatus },
          });
        }

        // 同步订单已退款总额：交易中心首页 getTradeOverview 依赖 order.refundedAmount 求和，
        // 缺此回写则"累计退款"恒为 0、"净收 = 已收"恒成立。
        await tx.order.update({
          where: { id: refund.orderId },
          data: { refundedAmount: { increment: refund.amount } },
        });

        await this.tradeEvents.record(tx, {
          orderId: refund.orderId, entityType: TRADE_ENTITY_TYPE.REFUND, entityId: refundId,
          eventType: TRADE_EVENT_TYPE.REFUND_COMPLETED, fromStatus: refund.status, toStatus: 'COMPLETED',
          operator, metadata: { gatewayRefundNo: gatewayRefundNo || null },
        });
      } else {
        // 执行失败：保持 APPROVED/PROCESSING 可重新执行（退款失败多为操作性问题，不应成死锁终态）。
        // 乐观锁仅记录本次失败尝试（processedBy/processedAt），不推进状态、不覆盖审核备注 reviewNote；
        // 失败原因记入事件时间线，便于追溯与重试。
        const updated = await tx.refund.updateMany({
          where: { id: refundId, status: { in: ['APPROVED', 'PROCESSING'] } },
          data: { processedBy: operator.id ?? null, processedAt: now },
        });
        if (updated.count === 0) throw new ConflictException('退款记录状态已变化，请刷新后重试');
        await this.tradeEvents.record(tx, {
          orderId: refund.orderId, entityType: TRADE_ENTITY_TYPE.REFUND, entityId: refundId,
          eventType: TRADE_EVENT_TYPE.REFUND_EXECUTE_FAILED, fromStatus: refund.status, toStatus: refund.status,
          operator, reason: gatewayRefundNo ? `执行失败：${gatewayRefundNo}` : '执行失败',
          metadata: { gatewayRefundNo: gatewayRefundNo || null },
        });
      }

      return tx.refund.findUnique({ where: { id: refundId } });
    });
  }
}
