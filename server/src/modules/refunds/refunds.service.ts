import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PaymentStatus, RefundStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TradeEventsService } from '../trade-events/trade-events.service';
import { TRADE_ENTITY_TYPE, TRADE_EVENT_TYPE, type OperatorContext } from '../trade-events/trade-events.constants';
import { businessDateKey } from '../../common/time/business-date';
import {
  PaymentGatewayService,
  type OnlinePayProvider,
  type RefundGatewayResult,
} from '../../common/payment-gateway/payment-gateway.service';
import { ReliableNotificationIntentService } from '../../common/notifications/reliable-notification-intent.service';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';

const CONFIRMED_PAYMENT_STATUSES = ['PAID', 'PARTIAL_REFUND', 'REFUNDED'] as const;
const ACTIVE_REFUND_STATUSES = ['PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED'] as const;
type RefundTx = Prisma.TransactionClient | PrismaService;
type RefundWithPayment = Prisma.RefundGetPayload<{
  include: { payment: true };
}>;
type RefundOrderPlanContext = {
  status: string;
  quotationVersionId: number | null;
  paymentPlans: Array<{ id: number }>;
};
type RefundInstallmentContext = {
  label?: string;
  sequence?: number;
  paymentPlan: {
    status: string;
    installments: Array<{ status: string }>;
  };
} | null;
type RefundPaymentPlanContext = {
  order?: RefundOrderPlanContext | null;
  installment?: RefundInstallmentContext;
};
type RefundStaffActor = Pick<StaffPrincipal, 'id' | 'sessionFamilyId'>;
type RefundStaffAuthorization =
  | 'REFUND_MANAGE'
  | 'REFUND_MANAGE_READ'
  | 'REFUND_QUERY';

/**
 * 退款服务：申请→审核→原渠道或线下执行→完成/拒绝。
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
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tradeEvents: TradeEventsService,
    private readonly paymentGateway: PaymentGatewayService,
    private readonly configService: ConfigService,
    @Optional()
    private readonly reliableNotifications?: ReliableNotificationIntentService,
  ) {}

  private createRefundNo(): string {
    const date = businessDateKey();
    return `RFD${date}${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }

  private async lockAuthorizedRefundActor(
    tx: Prisma.TransactionClient,
    actor: RefundStaffActor,
    authorization: RefundStaffAuthorization = 'REFUND_MANAGE',
  ): Promise<OperatorContext> {
    const actorId = Number(actor.id);
    if (!Number.isInteger(actorId) || actorId <= 0) {
      throw new ForbiddenException('当前员工身份无效');
    }
    const isRead = authorization !== 'REFUND_MANAGE';
    const rows = authorization === 'REFUND_QUERY'
      ? await tx.$queryRaw<Array<{
          id: number;
          username?: string;
          realName?: string | null;
        }>>(
          Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actorId} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR SHARE`,
        )
      : isRead
        ? await tx.$queryRaw<Array<{
            id: number;
            username?: string;
            realName?: string | null;
          }>>(
            Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actorId} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR SHARE`,
          )
        : await tx.$queryRaw<Array<{
            id: number;
            username?: string;
            realName?: string | null;
          }>>(
            Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actorId} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR UPDATE`,
          );
    const lockedActor = rows[0];
    if (!lockedActor) {
      throw new ForbiddenException('当前员工已停用或无权处理退款');
    }
    if (actor.sessionFamilyId) {
      const sessions = isRead
        ? await tx.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actorId} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
          )
        : await tx.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actorId} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
          );
      if (sessions.length !== 1) {
        throw new ForbiddenException('当前员工会话已失效，不能处理退款');
      }
    }
    return {
      type: 'ADMIN',
      id: lockedActor.id,
      name: lockedActor.realName || lockedActor.username,
    };
  }

  /**
   * 渠道调用期间持有员工与当前 refresh family 行锁：撤权或设备登出若先完成
   * 则不会触达渠道；调用若先开始，撤权会等待该有界外调结束。渠道事实落库
   * 仍会在独立事务中再次复核员工与会话族。
   */
  private withAuthorizedRefundActor<T>(
    actor: RefundStaffActor,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedRefundActor(tx, actor);
      return action();
    });
  }

  private moneyToCents(value: Prisma.Decimal | number | string, fieldName = '金额') {
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

  private isOnlineMethod(method: string): method is OnlinePayProvider {
    return method === 'wechat' || method === 'alipay';
  }

  private getRefundNotifyUrl() {
    const siteBase = (
      this.configService?.get<string>('SITE_BASE_URL') || ''
    ).replace(/\/+$/, '');
    if (!siteBase || siteBase.includes('localhost')) {
      throw new BadRequestException(
        '请先配置 SITE_BASE_URL 为正式域名，退款结果通知才能到达本服务',
      );
    }
    return `${siteBase}/api/refunds/notify/wechat`;
  }

  private async lockOrder(tx: Prisma.TransactionClient, orderId: number) {
    const rows = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException('订单不存在');
  }

  /** 付款状态会随退款改变；毛收款仍包含部分退款与已退款 Payment 的原始金额。 */
  private async getPaidCents(tx: RefundTx, orderId: number): Promise<number> {
    const payments = await tx.payment.findMany({
      where: { orderId, status: { in: [...CONFIRMED_PAYMENT_STATUSES] } },
      select: { amount: true },
    });
    return payments.reduce((sum, payment) => sum + this.moneyToCents(payment.amount), 0);
  }

  /** 计算订单已发起（未拒绝/未失败）的退款总额（整数分） */
  private async getActiveRefundCents(
    tx: RefundTx,
    orderId: number,
    excludeRefundId?: number,
  ): Promise<number> {
    const refunds = await tx.refund.findMany({
      where: {
        orderId,
        status: { in: [...ACTIVE_REFUND_STATUSES] },
        ...(excludeRefundId ? { id: { not: excludeRefundId } } : {}),
      },
      select: { amount: true },
    });
    return refunds.reduce((sum, refund) => sum + this.moneyToCents(refund.amount), 0);
  }

  private async getPaymentActiveRefundCents(
    tx: RefundTx,
    paymentId: number,
    excludeRefundId?: number,
  ) {
    const refunds = await tx.refund.findMany({
      where: {
        paymentId,
        status: { in: [...ACTIVE_REFUND_STATUSES] },
        ...(excludeRefundId ? { id: { not: excludeRefundId } } : {}),
      },
      select: { amount: true },
    });
    return refunds.reduce((sum, refund) => sum + this.moneyToCents(refund.amount), 0);
  }

  private async assertAfterSalesRefundRequest(
    tx: Prisma.TransactionClient,
    data: { orderId: number; amount: number; afterSalesCaseId?: number },
    excludeRefundId?: number,
  ) {
    if (!data.afterSalesCaseId) return;
    const caseRecord = await tx.afterSalesCase.findFirst({
      where: { id: data.afterSalesCaseId, orderId: data.orderId },
      select: {
        id: true,
        type: true,
        status: true,
        approvedRefundAmount: true,
      },
    });
    if (!caseRecord) {
      throw new BadRequestException('关联售后工单不存在或不属于该订单');
    }
    if (caseRecord.type !== 'REFUND') {
      throw new BadRequestException('只有退款类售后工单可以关联退款单');
    }
    if (!['APPROVED', 'RETURNING', 'QC_PASSED'].includes(caseRecord.status)) {
      throw new BadRequestException('关联售后工单尚未审核通过或已结束');
    }
    if (caseRecord.approvedRefundAmount === null) {
      throw new BadRequestException('关联售后工单尚未确认退款额度');
    }
    const approvedCents = this.moneyToCents(
      caseRecord.approvedRefundAmount,
      '售后审核退款金额',
    );
    if (approvedCents <= 0) {
      throw new BadRequestException('关联售后工单的退款额度无效');
    }
    const linkedRefunds = await tx.refund.findMany({
      where: {
        afterSalesCaseId: caseRecord.id,
        status: { in: [...ACTIVE_REFUND_STATUSES] },
        ...(excludeRefundId ? { id: { not: excludeRefundId } } : {}),
      },
      select: { amount: true },
    });
    const occupiedCents = linkedRefunds.reduce(
      (sum, refund) => sum + this.moneyToCents(refund.amount),
      0,
    );
    const requestedCents = this.moneyToCents(data.amount, '退款金额');
    if (occupiedCents + requestedCents > approvedCents) {
      throw new BadRequestException(
        `退款金额超过售后审核额度，当前最多可退 ¥${(
          Math.max(approvedCents - occupiedCents, 0) /
          100
        ).toFixed(2)}`,
      );
    }
  }

  private assertSameIdempotentRequest(
    existing: {
      orderId: number;
      paymentId: number | null;
      amount: Prisma.Decimal;
      reason: string | null;
      afterSalesCaseId?: number | null;
    },
    data: {
      orderId: number;
      paymentId?: number;
      amount: number;
      reason: string;
      afterSalesCaseId?: number;
    },
  ) {
    if (
      existing.orderId !== data.orderId ||
      this.moneyToCents(existing.amount) !== this.moneyToCents(data.amount) ||
      (data.paymentId !== undefined && existing.paymentId !== data.paymentId) ||
      (existing.afterSalesCaseId ?? undefined) !== data.afterSalesCaseId ||
      (existing.reason ?? '').trim() !== data.reason.trim()
    ) {
      throw new ConflictException('该幂等键已用于另一笔退款请求');
    }
  }

  async findAll(
    params: { page?: number; pageSize?: number; status?: string; keyword?: string },
    actor: RefundStaffActor,
  ) {
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

    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedRefundActor(tx, actor, 'REFUND_QUERY');
      const [list, total] = await Promise.all([
        tx.refund.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            order: { select: { id: true, orderNo: true, customerName: true, customerPhone: true, finalAmount: true, status: true } },
            payment: { select: { id: true, paymentNo: true, method: true, status: true, amount: true } },
            requester: { select: { id: true, realName: true, username: true } },
            reviewer: { select: { id: true, realName: true, username: true } },
            processor: { select: { id: true, realName: true, username: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        tx.refund.count({ where }),
      ]);
      return { list, total, page, pageSize };
    });
  }

  async findById(id: number, actor: RefundStaffActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedRefundActor(tx, actor, 'REFUND_QUERY');
      const refund = await tx.refund.findUnique({
        where: { id },
        include: {
          order: { include: { items: true, payments: true } },
          payment: true,
          requester: { select: { id: true, realName: true, username: true } },
          reviewer: { select: { id: true, realName: true, username: true } },
          processor: { select: { id: true, realName: true, username: true } },
        },
      });
      if (!refund) throw new NotFoundException('退款记录不存在');
      return refund;
    });
  }

  /**
   * 退款创建前读取权威原付款及其剩余可退额度。
   *
   * 这只是运营预检；create() 仍会在订单行锁内重新校验，不能把此快照当作
   * 金额或分期状态的最终事实。
   */
  async getCreateEligibility(orderId: number, actor: RefundStaffActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedRefundActor(tx, actor, 'REFUND_MANAGE_READ');
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNo: true,
          status: true,
          orderType: true,
          currency: true,
          quotationVersionId: true,
          paymentPlans: { select: { id: true } },
          payments: {
            where: { status: { in: [...CONFIRMED_PAYMENT_STATUSES] } },
            select: {
              id: true,
              paymentNo: true,
              amount: true,
              method: true,
              status: true,
              type: true,
              paidAt: true,
              createdAt: true,
              installment: {
                select: {
                  label: true,
                  sequence: true,
                  paymentPlan: {
                    select: {
                      status: true,
                      installments: { select: { status: true } },
                    },
                  },
                },
              },
            },
            orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          },
          refunds: {
            where: { status: { in: [...ACTIVE_REFUND_STATUSES] } },
            select: { paymentId: true, amount: true },
          },
        },
      });
      if (!order) throw new NotFoundException('订单不存在');

      const occupiedByPayment = new Map<number, number>();
      for (const refund of order.refunds) {
        if (refund.paymentId === null) continue;
        occupiedByPayment.set(
          refund.paymentId,
          (occupiedByPayment.get(refund.paymentId) ?? 0) +
            this.moneyToCents(refund.amount),
        );
      }
      const planContext: RefundOrderPlanContext = {
        status: order.status,
        quotationVersionId: order.quotationVersionId,
        paymentPlans: order.paymentPlans,
      };
      let totalAvailableCents = 0;
      const payments = order.payments.map((payment) => {
        const amountCents = this.moneyToCents(payment.amount, '原支付金额');
        const occupiedCents = occupiedByPayment.get(payment.id) ?? 0;
        const availableCents = Math.max(amountCents - occupiedCents, 0);
        const planBlockReason = this.getPaymentPlanRefundBlockReason({
          order: planContext,
          installment: payment.installment,
        });
        const reason =
          planBlockReason ??
          (availableCents <= 0 ? '该笔原付款已无可退余额' : null);
        const eligible = reason === null;
        if (eligible) totalAvailableCents += availableCents;
        return {
          id: payment.id,
          paymentNo: payment.paymentNo,
          method: payment.method,
          status: payment.status,
          type: payment.type,
          installmentLabel: payment.installment?.label ?? null,
          installmentSequence: payment.installment?.sequence ?? null,
          amount: (amountCents / 100).toFixed(2),
          occupiedRefundAmount: (occupiedCents / 100).toFixed(2),
          availableRefundAmount: (availableCents / 100).toFixed(2),
          eligible,
          reason,
        };
      });

      return {
        order: {
          id: order.id,
          orderNo: order.orderNo,
          status: order.status,
          orderType: order.orderType,
          currency: order.currency,
        },
        totalAvailableRefundAmount: (totalAvailableCents / 100).toFixed(2),
        payments,
      };
    });
  }

  /** 创建退款申请 */
  async create(data: {
    orderId: number;
    paymentId?: number;
    amount: number;
    reason: string;
    idempotencyKey: string;
    afterSalesCaseId?: number;
    operator: RefundStaffActor;
  }) {
    const amountCents = this.moneyToCents(data.amount, '退款金额');
    if (amountCents <= 0) {
      throw new BadRequestException('退款金额必须为正数');
    }
    const reason = data.reason?.trim();
    if (!reason) throw new BadRequestException('请填写退款原因');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const operator = await this.lockAuthorizedRefundActor(tx, data.operator);

        // 必须先取得订单串行锁，再建立普通读取快照。MySQL 默认 REPEATABLE READ 下，
        // 若先查幂等键，等待订单锁后的额度查询仍可能停留在竞争请求提交前的旧快照。
        await this.lockOrder(tx, data.orderId);

        const existing = await tx.refund.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
        });
        if (existing) {
          this.assertSameIdempotentRequest(existing, data);
          return existing;
        }

        await this.assertAfterSalesRefundRequest(tx, data);

        const payments = await tx.payment.findMany({
          where: {
            orderId: data.orderId,
            status: { in: [...CONFIRMED_PAYMENT_STATUSES] },
          },
          select: {
            id: true,
            amount: true,
            method: true,
            order: {
              select: {
                status: true,
                quotationVersionId: true,
                paymentPlans: { select: { id: true } },
              },
            },
            installment: {
              include: { paymentPlan: { include: { installments: true } } },
            },
          },
          orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        });
        if (payments.length === 0) {
          throw new BadRequestException('订单尚无已确认收款，不可退款');
        }

        const paidCents = await this.getPaidCents(tx, data.orderId);
        const activeRefundCents = await this.getActiveRefundCents(tx, data.orderId);
        if (activeRefundCents + amountCents > paidCents) {
          const available = ((paidCents - activeRefundCents) / 100).toFixed(2);
          throw new BadRequestException(`退款金额超过可退额度，当前最多可退 ¥${available}`);
        }

        let payment = data.paymentId
          ? payments.find((candidate) => candidate.id === data.paymentId)
          : undefined;
        if (data.paymentId && !payment) {
          throw new BadRequestException('关联的付款记录不属于该订单或未确认收款');
        }
        if (!payment) {
          for (const candidate of payments) {
            const occupied = await this.getPaymentActiveRefundCents(tx, candidate.id);
            if (this.moneyToCents(candidate.amount) - occupied >= amountCents) {
              payment = candidate;
              break;
            }
          }
        }
        if (!payment) {
          throw new BadRequestException('单笔原支付可退额度不足，请按原付款记录拆分退款');
        }
        this.assertPaymentPlanRefundEligible(payment);

        const paymentOccupied = await this.getPaymentActiveRefundCents(tx, payment.id);
        const paymentAvailable = this.moneyToCents(payment.amount) - paymentOccupied;
        if (amountCents > paymentAvailable) {
          throw new BadRequestException(
            `退款金额超过该笔原支付可退额度，当前最多可退 ¥${(paymentAvailable / 100).toFixed(2)}`,
          );
        }

        const refund = await tx.refund.create({
          data: {
            refundNo: this.createRefundNo(),
            orderId: data.orderId,
            paymentId: payment.id,
            amount: new Prisma.Decimal(amountCents).div(100),
            reason,
            status: 'PENDING',
            idempotencyKey: data.idempotencyKey,
            afterSalesCaseId: data.afterSalesCaseId ?? null,
            requestedBy: operator.id ?? null,
          },
        });

        await this.tradeEvents.record(tx, {
          orderId: data.orderId,
          entityType: TRADE_ENTITY_TYPE.REFUND,
          entityId: refund.id,
          eventType: TRADE_EVENT_TYPE.REFUND_REQUESTED,
          toStatus: 'PENDING',
          operator,
          metadata: {
            amount: refund.amount.toString(),
            paymentId: payment.id,
            paymentMethod: payment.method,
          },
        });
        return refund;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.$transaction(async (tx) => {
          await this.lockAuthorizedRefundActor(tx, data.operator);
          return tx.refund.findUnique({
            where: { idempotencyKey: data.idempotencyKey },
          });
        });
        if (duplicate) {
          this.assertSameIdempotentRequest(duplicate, data);
          return duplicate;
        }
      }
      throw error;
    }
  }

  /** 审核退款：通过/拒绝 */
  async review(refundId: number, action: 'APPROVED' | 'REJECTED', reviewNote: string | undefined, actor: RefundStaffActor) {
    const normalizedReviewNote = reviewNote?.trim() || null;
    const reviewedStatus = action === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    const reviewResult = await this.prisma.$transaction(async (tx) => {
      const operator = await this.lockAuthorizedRefundActor(tx, actor);
      const refundRef = await tx.refund.findUnique({
        where: { id: refundId },
        select: { orderId: true },
      });
      if (!refundRef) throw new NotFoundException('退款记录不存在');
      await this.lockOrder(tx, refundRef.orderId);

      const refund = await tx.refund.findUnique({
        where: { id: refundId },
        include: { payment: { select: { method: true } } },
      });
      if (!refund) throw new NotFoundException('退款记录不存在');
      const sameReviewReplay = operator.id != null
        && refund.reviewedBy === operator.id
        && (refund.reviewNote ?? null) === normalizedReviewNote
        && (action === 'REJECTED'
          ? refund.status === 'REJECTED'
          : ['APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(refund.status));
      if (sameReviewReplay) {
        const { payment, ...refundWithoutPayment } = refund;
        return { refund: refundWithoutPayment, paymentMethod: payment?.method ?? null };
      }
      if (refund.status !== 'PENDING') {
        throw new BadRequestException('只有待审核的退款可以审核');
      }

      // 审核通过时再次校验金额（防止审核期间其它退款已完成）
      if (action === 'APPROVED') {
        await this.assertAfterSalesRefundRequest(
          tx,
          {
            orderId: refund.orderId,
            amount: Number(refund.amount),
            afterSalesCaseId: refund.afterSalesCaseId ?? undefined,
          },
          refund.id,
        );
        const paidCents = await this.getPaidCents(tx, refund.orderId);
        const activeCents = await this.getActiveRefundCents(tx, refund.orderId, refundId);
        const thisCents = this.moneyToCents(refund.amount);
        if (activeCents + thisCents > paidCents) {
          throw new BadRequestException('退款金额超过可退额度（可能其它退款已先行执行）');
        }
        if (!refund.paymentId) {
          throw new BadRequestException('退款未关联原付款记录，请先修复交易数据');
        }
        const payment = await tx.payment.findFirst({
          where: {
            id: refund.paymentId,
            orderId: refund.orderId,
            status: { in: [...CONFIRMED_PAYMENT_STATUSES] },
          },
          select: {
            amount: true,
            order: {
              select: {
                status: true,
                quotationVersionId: true,
                paymentPlans: { select: { id: true } },
              },
            },
            installment: {
              include: { paymentPlan: { include: { installments: true } } },
            },
          },
        });
        if (!payment) throw new BadRequestException('原付款记录不存在或未确认');
        this.assertPaymentPlanRefundEligible(payment);
        const paymentActive = await this.getPaymentActiveRefundCents(
          tx,
          refund.paymentId,
          refundId,
        );
        if (paymentActive + thisCents > this.moneyToCents(payment.amount)) {
          throw new BadRequestException('退款金额超过该笔原支付可退额度');
        }
      }

      // 乐观锁推进
      const updated = await tx.refund.updateMany({
        where: { id: refundId, status: 'PENDING' },
        data: {
          status: reviewedStatus,
          reviewedBy: operator.id ?? null,
          reviewedAt: new Date(),
          reviewNote: normalizedReviewNote,
        },
      });
      if (updated.count === 0) throw new ConflictException('退款记录已被处理，请刷新后重试');

      const eventType = action === 'APPROVED' ? TRADE_EVENT_TYPE.REFUND_APPROVED : TRADE_EVENT_TYPE.REFUND_REJECTED;
      await this.tradeEvents.record(tx, {
        orderId: refund.orderId, entityType: TRADE_ENTITY_TYPE.REFUND, entityId: refundId,
        eventType, fromStatus: 'PENDING', toStatus: reviewedStatus, operator, reason: normalizedReviewNote,
      });

      const updatedRefund = await tx.refund.findUnique({ where: { id: refundId } });
      return { refund: updatedRefund, paymentMethod: refund.payment?.method ?? null };
    });

    const reviewed = reviewResult.refund;
    if (action !== 'APPROVED' || !reviewed) return reviewed;
    if (!reviewResult.paymentMethod || !this.isOnlineMethod(reviewResult.paymentMethod)) {
      return reviewed;
    }
    if (reviewResult.paymentMethod !== 'wechat') {
      return {
        ...reviewed,
        channelAction: {
          state: 'UNSUPPORTED' as const,
          message: '支付宝原路退款将在第二批接入',
        },
      };
    }
    if (!this.paymentGateway.isRefundCreationEnabled()) {
      return {
        ...reviewed,
        channelAction: {
          state: 'DISABLED' as const,
          message: '退款已审核通过，真实原路退款门禁当前关闭',
        },
      };
    }
    if (!this.paymentGateway.isRefundAvailable('wechat')) {
      return {
        ...reviewed,
        channelAction: {
          state: 'UNAVAILABLE' as const,
          message: '退款已审核通过，但微信退款通道配置尚未就绪',
        },
      };
    }
    try {
      const channel = await this.startOnlineRefund(refundId, actor);
      return { ...channel.refund, channelAction: channel };
    } catch (error) {
      this.logger.error(
        `退款 ${reviewed.refundNo} 审核后自动发起渠道退款未确认：${error instanceof Error ? error.message : error}`,
      );
      let current = reviewed;
      try {
        current = await this.prisma.$transaction(async (tx) => {
          await this.lockAuthorizedRefundActor(tx, actor);
          return (await tx.refund.findUnique({ where: { id: refundId } })) ?? reviewed;
        });
      } catch (authorizationError) {
        if (!(authorizationError instanceof ForbiddenException)) throw authorizationError;
      }
      return {
        ...current,
        channelAction: {
          state: 'ATTENTION' as const,
          message: '退款已审核通过，但渠道结果尚未确认，请按原退款单查询或重试',
        },
      };
    }
  }

  private assertOnlineRefundFact(
    refund: RefundWithPayment,
    fact: RefundGatewayResult,
  ) {
    if (!refund.payment) {
      throw new BadRequestException('退款未关联原付款记录');
    }
    if (refund.payment.method !== fact.provider) {
      throw new ConflictException('退款渠道与原付款渠道不匹配');
    }
    if (refund.refundNo !== fact.refundNo) {
      throw new ConflictException('渠道返回的商户退款单号不匹配');
    }
    if (refund.payment.paymentNo !== fact.paymentNo) {
      throw new ConflictException('渠道返回的原商户单号不匹配');
    }
    if (refund.payment.gatewayTradeNo !== fact.gatewayTradeNo) {
      throw new ConflictException('渠道返回的原交易号不匹配');
    }
    if (
      this.moneyToCents(refund.amount, '退款金额') !==
      this.moneyToCents(fact.refundAmountYuan, '渠道退款金额')
    ) {
      throw new ConflictException('渠道返回的退款金额不匹配');
    }
    if (
      this.moneyToCents(refund.payment.amount, '原支付金额') !==
      this.moneyToCents(fact.totalAmountYuan, '渠道原支付金额')
    ) {
      throw new ConflictException('渠道返回的原支付金额不匹配');
    }
  }

  private async completeRefund(
    tx: Prisma.TransactionClient,
    refund: RefundWithPayment,
    reference: string,
    operator: OperatorContext,
    metadata: Record<string, Prisma.InputJsonValue>,
  ) {
    if (!refund.payment) {
      throw new BadRequestException('退款未关联原付款记录，请先修复交易数据');
    }
    const now = new Date();
    const updated = await tx.refund.updateMany({
      where: { id: refund.id, status: { in: ['APPROVED', 'PROCESSING'] } },
      data: {
        status: 'COMPLETED',
        ...(operator.id !== undefined ? { processedBy: operator.id } : {}),
        processedAt: now,
        completedAt: now,
        gatewayRefundNo: reference,
      },
    });
    if (updated.count === 0) {
      throw new ConflictException('退款记录状态已变化，请刷新后重试');
    }

    const paymentRefunds = await tx.refund.findMany({
      where: { paymentId: refund.payment.id, status: 'COMPLETED' },
      select: { amount: true },
    });
    const paymentRefundedCents = paymentRefunds.reduce(
      (sum, item) => sum + this.moneyToCents(item.amount),
      0,
    );
    const paymentStatus: PaymentStatus =
      paymentRefundedCents >= this.moneyToCents(refund.payment.amount)
        ? 'REFUNDED'
        : 'PARTIAL_REFUND';
    await tx.payment.update({
      where: { id: refund.payment.id },
      data: { status: paymentStatus },
    });

    const orderRefunds = await tx.refund.findMany({
      where: { orderId: refund.orderId, status: 'COMPLETED' },
      select: { amount: true },
    });
    const orderRefundedCents = orderRefunds.reduce(
      (sum, item) => sum + this.moneyToCents(item.amount),
      0,
    );
    await tx.order.update({
      where: { id: refund.orderId },
      data: {
        refundedAmount: new Prisma.Decimal(orderRefundedCents).div(100),
      },
    });

    await this.tradeEvents.record(tx, {
      orderId: refund.orderId,
      entityType: TRADE_ENTITY_TYPE.REFUND,
      entityId: refund.id,
      eventType: TRADE_EVENT_TYPE.REFUND_COMPLETED,
      fromStatus: refund.status,
      toStatus: 'COMPLETED',
      operator,
      metadata: {
        refundReference: reference,
        paymentId: refund.payment.id,
        paymentMethod: refund.payment.method,
        ...metadata,
      },
    });
    await this.completeLinkedAfterSalesIfSettled(tx, refund, operator);
    if (!this.reliableNotifications) return;
    const order = await tx.order.findUnique({
      where: { id: refund.orderId },
      select: {
        id: true,
        orderNo: true,
        customerId: true,
        customerEmail: true,
        finalAmount: true,
      },
    });
    if (order) {
      await this.reliableNotifications?.enqueueRefundCompleted(tx, order, {
        id: refund.id,
        refundNo: refund.refundNo,
        amount: refund.amount,
      });
    }
  }

  private async completeLinkedAfterSalesIfSettled(
    tx: Prisma.TransactionClient,
    refund: RefundWithPayment,
    operator: OperatorContext,
  ) {
    if (!refund.afterSalesCaseId) return;
    const caseRecord = await tx.afterSalesCase.findFirst({
      where: {
        id: refund.afterSalesCaseId,
        orderId: refund.orderId,
        type: 'REFUND',
      },
      select: {
        id: true,
        status: true,
        approvedRefundAmount: true,
      },
    });
    if (
      !caseRecord ||
      caseRecord.approvedRefundAmount === null ||
      !['APPROVED', 'RETURNING', 'QC_PASSED'].includes(caseRecord.status)
    ) {
      return;
    }
    const approvedCents = this.moneyToCents(
      caseRecord.approvedRefundAmount,
      '售后审核退款金额',
    );
    if (approvedCents <= 0) return;
    const completedRefunds = await tx.refund.findMany({
      where: {
        afterSalesCaseId: caseRecord.id,
        status: 'COMPLETED',
      },
      select: { amount: true },
    });
    const completedCents = completedRefunds.reduce(
      (sum, item) => sum + this.moneyToCents(item.amount),
      0,
    );
    if (completedCents < approvedCents) return;

    const completed = await tx.afterSalesCase.updateMany({
      where: {
        id: caseRecord.id,
        status: { in: ['APPROVED', 'RETURNING', 'QC_PASSED'] },
      },
      data: { status: 'COMPLETED' },
    });
    if (completed.count === 0) return;
    await this.tradeEvents.record(tx, {
      orderId: refund.orderId,
      entityType: TRADE_ENTITY_TYPE.AFTER_SALES,
      entityId: caseRecord.id,
      eventType: TRADE_EVENT_TYPE.AFTER_SALES_STATUS_CHANGED,
      fromStatus: caseRecord.status,
      toStatus: 'COMPLETED',
      operator,
      reason: '关联退款已按审核额度完成',
      metadata: {
        refundId: refund.id,
        completedRefundAmount: (completedCents / 100).toFixed(2),
      },
    });
  }

  private async prepareOnlineRefund(
    refundId: number,
    actor: RefundStaffActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const operator = await this.lockAuthorizedRefundActor(tx, actor);
      const refundRef = await tx.refund.findUnique({
        where: { id: refundId },
        select: { orderId: true },
      });
      if (!refundRef) throw new NotFoundException('退款记录不存在');
      await this.lockOrder(tx, refundRef.orderId);
      const refund = await tx.refund.findUnique({
        where: { id: refundId },
        include: { payment: true },
      });
      if (!refund) throw new NotFoundException('退款记录不存在');
      if (refund.status === 'COMPLETED') {
        return { refund, alreadyCompleted: true };
      }
      if (!refund.payment) {
        throw new BadRequestException('退款未关联原付款记录');
      }
      if (refund.payment.method !== 'wechat') {
        throw new BadRequestException(
          refund.payment.method === 'alipay'
            ? '支付宝原路退款将在第二批接入'
            : '该付款应使用线下退款执行入口',
        );
      }
      if (!refund.payment.gatewayTradeNo) {
        throw new BadRequestException('原微信付款缺少渠道交易号，不能自动退款');
      }
      if (!['APPROVED', 'PROCESSING'].includes(refund.status)) {
        throw new BadRequestException('只有审核通过或渠道处理中的退款可以发起原路退款');
      }
      if (refund.status === 'APPROVED') {
        const updated = await tx.refund.updateMany({
          where: { id: refundId, status: 'APPROVED' },
          data: {
            status: 'PROCESSING',
            processedBy: operator.id ?? null,
            processedAt: new Date(),
          },
        });
        if (updated.count === 0) {
          throw new ConflictException('退款记录状态已变化，请刷新后重试');
        }
        await this.tradeEvents.record(tx, {
          orderId: refund.orderId,
          entityType: TRADE_ENTITY_TYPE.REFUND,
          entityId: refund.id,
          eventType: TRADE_EVENT_TYPE.REFUND_PROCESSING,
          fromStatus: 'APPROVED',
          toStatus: 'PROCESSING',
          operator,
          metadata: {
            paymentId: refund.payment.id,
            paymentMethod: refund.payment.method,
            refundNo: refund.refundNo,
          },
        });
      }
      return {
        refund: { ...refund, status: 'PROCESSING' as const },
        alreadyCompleted: false,
      };
    });
  }

  private async recordOnlineRefundAttention(
    refundId: number,
    reason: string,
    source: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({ where: { id: refundId } });
      if (!refund || refund.status !== 'PROCESSING') return;
      await this.tradeEvents.recordBestEffort(tx, {
        orderId: refund.orderId,
        entityType: TRADE_ENTITY_TYPE.REFUND,
        entityId: refund.id,
        eventType: TRADE_EVENT_TYPE.REFUND_ATTENTION,
        fromStatus: 'PROCESSING',
        toStatus: 'PROCESSING',
        operator: { type: 'SYSTEM' },
        reason,
        metadata: { source, refundNo: refund.refundNo },
      });
    });
  }

  private async applyOnlineRefundFact(
    refundId: number,
    fact: RefundGatewayResult,
    source: 'create' | 'query' | 'callback',
    actor?: RefundStaffActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (actor) await this.lockAuthorizedRefundActor(tx, actor);
      const refundRef = await tx.refund.findUnique({
        where: { id: refundId },
        select: { orderId: true },
      });
      if (!refundRef) throw new NotFoundException('退款记录不存在');
      await this.lockOrder(tx, refundRef.orderId);
      const refund = await tx.refund.findUnique({
        where: { id: refundId },
        include: { payment: true },
      });
      if (!refund) throw new NotFoundException('退款记录不存在');
      this.assertOnlineRefundFact(refund, fact);

      const reusedGatewayRefund = await tx.refund.findFirst({
        where: {
          id: { not: refund.id },
          gatewayRefundNo: fact.gatewayRefundNo,
        },
        select: { id: true, refundNo: true },
      });
      if (reusedGatewayRefund) {
        throw new ConflictException(
          `渠道退款号已绑定另一退款记录 ${reusedGatewayRefund.refundNo}`,
        );
      }

      if (refund.status === 'COMPLETED') {
        if (
          refund.gatewayRefundNo &&
          refund.gatewayRefundNo !== fact.gatewayRefundNo
        ) {
          throw new ConflictException('退款已由另一渠道退款号完成');
        }
        return { refund, state: 'SUCCESS' as const };
      }
      if (refund.status === 'FAILED' && fact.state !== 'CLOSED') {
        throw new ConflictException('本地退款已失败但渠道返回非关闭状态，需要人工对账');
      }

      if (fact.state === 'SUCCESS') {
        await this.completeRefund(
          tx,
          refund,
          fact.gatewayRefundNo,
          { type: 'SYSTEM' },
          {
            source,
            channelState: fact.state,
            manualOffline: false,
            channelResponse: fact.raw as Prisma.InputJsonValue,
          },
        );
        const completed = await tx.refund.findUnique({
          where: { id: refund.id },
          include: { payment: true },
        });
        return { refund: completed, state: 'SUCCESS' as const };
      }

      if (fact.state === 'CLOSED') {
        if (refund.status !== 'FAILED') {
          const updated = await tx.refund.updateMany({
            where: {
              id: refund.id,
              status: { in: ['APPROVED', 'PROCESSING'] },
            },
            data: {
              status: 'FAILED',
              gatewayRefundNo: fact.gatewayRefundNo,
              processedAt: new Date(),
            },
          });
          if (updated.count === 0) {
            throw new ConflictException('退款记录状态已变化，请刷新后重试');
          }
          await this.tradeEvents.record(tx, {
            orderId: refund.orderId,
            entityType: TRADE_ENTITY_TYPE.REFUND,
            entityId: refund.id,
            eventType: TRADE_EVENT_TYPE.REFUND_EXECUTE_FAILED,
            fromStatus: refund.status,
            toStatus: 'FAILED',
            operator: { type: 'SYSTEM' },
            reason: '微信退款已关闭',
            metadata: {
              source,
              refundNo: refund.refundNo,
              gatewayRefundNo: fact.gatewayRefundNo,
              channelState: fact.state,
            },
          });
        }
        const failed = await tx.refund.findUnique({ where: { id: refund.id } });
        return { refund: failed, state: 'CLOSED' as const };
      }

      if (!['APPROVED', 'PROCESSING'].includes(refund.status)) {
        throw new ConflictException('本地退款状态与渠道处理中状态不一致');
      }
      const changed =
        refund.status !== 'PROCESSING' ||
        refund.gatewayRefundNo !== fact.gatewayRefundNo;
      if (changed) {
        await tx.refund.update({
          where: { id: refund.id },
          data: {
            status: 'PROCESSING',
            gatewayRefundNo: fact.gatewayRefundNo,
            processedAt: new Date(),
          },
        });
        await this.tradeEvents.record(tx, {
          orderId: refund.orderId,
          entityType: TRADE_ENTITY_TYPE.REFUND,
          entityId: refund.id,
          eventType:
            fact.state === 'ABNORMAL'
              ? TRADE_EVENT_TYPE.REFUND_ATTENTION
              : TRADE_EVENT_TYPE.REFUND_PROCESSING,
          fromStatus: refund.status,
          toStatus: 'PROCESSING',
          operator: { type: 'SYSTEM' },
          reason:
            fact.state === 'ABNORMAL'
              ? '微信退款异常，需要渠道对账'
              : undefined,
          metadata: {
            source,
            refundNo: refund.refundNo,
            gatewayRefundNo: fact.gatewayRefundNo,
            channelState: fact.state,
          },
        });
      }
      const processing = await tx.refund.findUnique({
        where: { id: refund.id },
      });
      return { refund: processing, state: fact.state };
    });
  }

  /** 审核后的微信退款发起；相同 refundNo 的所有重试保持渠道幂等。 */
  async startOnlineRefund(refundId: number, actor: RefundStaffActor) {
    if (!this.paymentGateway.isRefundCreationEnabled()) {
      throw new ServiceUnavailableException('真实原路退款当前已关闭');
    }
    if (!this.paymentGateway.isRefundAvailable('wechat')) {
      throw new ServiceUnavailableException('微信原路退款通道配置尚未就绪');
    }
    const notifyUrl = this.getRefundNotifyUrl();
    const prepared = await this.prepareOnlineRefund(refundId, actor);
    if (prepared.alreadyCompleted) {
      return { refund: prepared.refund, state: 'SUCCESS' as const };
    }
    const payment = prepared.refund.payment;
    if (!payment?.gatewayTradeNo) {
      throw new BadRequestException('原微信付款缺少渠道交易号');
    }
    const gatewayTradeNo = payment.gatewayTradeNo;
    try {
      const fact = await this.withAuthorizedRefundActor(actor, () =>
        this.paymentGateway.createRefund('wechat', {
          refundNo: prepared.refund.refundNo,
          paymentNo: payment.paymentNo,
          gatewayTradeNo,
          refundAmountYuan: Number(prepared.refund.amount).toFixed(2),
          totalAmountYuan: Number(payment.amount).toFixed(2),
          reason: prepared.refund.reason || undefined,
          notifyUrl,
        }),
      );
      return this.applyOnlineRefundFact(refundId, fact, 'create', actor);
    } catch (error) {
      await this.recordOnlineRefundAttention(
        refundId,
        '渠道退款申请结果未确认；必须复用原退款单号查询或重试',
        'create',
      );
      throw error;
    }
  }

  /** 查询已发起微信退款；不受“发起新退款”门禁影响。 */
  async queryOnlineRefund(refundId: number, actor?: RefundStaffActor) {
    const refund = actor
      ? await this.prisma.$transaction(async (tx) => {
          await this.lockAuthorizedRefundActor(tx, actor);
          return tx.refund.findUnique({
            where: { id: refundId },
            include: { payment: true },
          });
        })
      : await this.prisma.refund.findUnique({
          where: { id: refundId },
          include: { payment: true },
        });
    if (!refund) throw new NotFoundException('退款记录不存在');
    if (!refund.payment || refund.payment.method !== 'wechat') {
      throw new BadRequestException('该退款不是微信原路退款');
    }
    if (refund.status === 'COMPLETED') {
      return { refund, state: 'SUCCESS' as const };
    }
    if (!['PROCESSING', 'APPROVED', 'FAILED'].includes(refund.status)) {
      throw new BadRequestException('当前退款状态不支持渠道查询');
    }
    const fact = actor
      ? await this.withAuthorizedRefundActor(actor, () =>
          this.paymentGateway.queryRefund('wechat', refund.refundNo),
        )
      : await this.paymentGateway.queryRefund('wechat', refund.refundNo);
    return this.applyOnlineRefundFact(refundId, fact, 'query', actor);
  }

  private getPaymentPlanRefundBlockReason(
    payment: RefundPaymentPlanContext,
  ): string | null {
    const orderHasPlan =
      payment.order?.quotationVersionId != null ||
      (payment.order?.paymentPlans?.length ?? 0) > 0;
    if (!payment.installment) {
      if (orderHasPlan) {
        return '付款计划订单的原付款未绑定分期，当前已暂停退款';
      }
      return null;
    }
    const plan = payment.installment.paymentPlan;
    if (
      !plan ||
      plan.status !== 'COMPLETED' ||
      plan.installments.some((installment) => installment.status !== 'PAID') ||
      !payment.order ||
      !['SHIPPED', 'COMPLETED'].includes(payment.order.status)
    ) {
      return '付款计划尚未全部实收并进入已发货阶段，退款会造成应收与履约不一致，当前已暂停';
    }
    return null;
  }

  private assertPaymentPlanRefundEligible(payment: RefundPaymentPlanContext) {
    const reason = this.getPaymentPlanRefundBlockReason(payment);
    if (reason) throw new BadRequestException(reason);
  }

  /**
   * 退款掉单兜底：渠道受理后回调丢失时，PROCESSING 退款会无限期滞留。
   * 定期主动查单核销（与人工查询、回调共用 applyOnlineRefundFact 的
   * 验签同源校验与状态推进）；单笔失败只告警不中断整批。不受退款发起门禁影响。
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcileProcessingOnlineRefunds() {
    const processingRefunds = await this.prisma.refund.findMany({
      where: {
        status: 'PROCESSING',
        payment: { method: 'wechat' },
        createdAt: {
          lt: new Date(Date.now() - 30 * 60 * 1000),
        },
      },
      select: { id: true, refundNo: true },
      orderBy: { createdAt: 'asc' },
      take: 30,
    });
    let reconciled = 0;
    for (const refund of processingRefunds) {
      try {
        const result = await this.queryOnlineRefund(refund.id);
        if (result.state === 'SUCCESS' || result.state === 'CLOSED') reconciled += 1;
      } catch (error) {
        this.logger.warn(
          `退款掉单兜底查单失败 ${refund.refundNo}：${error instanceof Error ? error.message : error}`,
        );
      }
    }
    if (processingRefunds.length > 0) {
      this.logger.log(
        `退款掉单兜底：检查 ${processingRefunds.length} 笔处理中退款，${reconciled} 笔进入终态`,
      );
    }
  }

  /** 微信退款通知：验签和解密后才按退款号查找本地记录并推进。 */
  async settleOnlineRefundNotification(
    provider: OnlinePayProvider,
    headers: Record<string, string>,
    rawBody: string,
  ) {
    if (provider !== 'wechat') return { ok: false };
    const verified = await this.paymentGateway.verifyRefundNotification(
      provider,
      headers,
      rawBody,
    );
    if (
      !verified.verified ||
      !verified.refundNo ||
      !verified.gatewayRefundNo ||
      !verified.paymentNo ||
      !verified.gatewayTradeNo ||
      !verified.state ||
      !verified.refundAmountYuan ||
      !verified.totalAmountYuan
    ) {
      return { ok: false };
    }
    const refund = await this.prisma.refund.findUnique({
      where: { refundNo: verified.refundNo },
      select: { id: true },
    });
    if (!refund) {
      this.logger.error(
        `微信退款通知 ${verified.refundNo} 无对应本地退款记录`,
      );
      return { ok: false };
    }
    try {
      await this.applyOnlineRefundFact(
        refund.id,
        {
          provider,
          refundNo: verified.refundNo,
          gatewayRefundNo: verified.gatewayRefundNo,
          paymentNo: verified.paymentNo,
          gatewayTradeNo: verified.gatewayTradeNo,
          state: verified.state,
          refundAmountYuan: verified.refundAmountYuan,
          totalAmountYuan: verified.totalAmountYuan,
          raw: (verified.raw ?? {}) as Record<string, unknown>,
        },
        'callback',
      );
      return { ok: true };
    } catch (error) {
      this.logger.error(
        `微信退款通知 ${verified.refundNo} 本地核销失败：${error instanceof Error ? error.message : error}`,
      );
      return { ok: false };
    }
  }

  /**
   * 登记线下退款执行结果。在线支付禁止人工标记完成，必须由后续原渠道退款管线推进。
   */
  async execute(
    refundId: number,
    action: 'COMPLETED' | 'FAILED',
    gatewayRefundNo: string | undefined,
    actor: RefundStaffActor,
    reviewNote?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const operator = await this.lockAuthorizedRefundActor(tx, actor);
      const refundRef = await tx.refund.findUnique({
        where: { id: refundId },
        select: { orderId: true },
      });
      if (!refundRef) throw new NotFoundException('退款记录不存在');
      await this.lockOrder(tx, refundRef.orderId);

      const refund = await tx.refund.findUnique({
        where: { id: refundId },
        include: { payment: true },
      });
      if (!refund) throw new NotFoundException('退款记录不存在');
      const reference = gatewayRefundNo?.trim();
      const executionNote = reviewNote?.trim();
      if (refund.status === 'COMPLETED' && action === 'COMPLETED') {
        if (reference && refund.gatewayRefundNo && reference !== refund.gatewayRefundNo) {
          throw new ConflictException('退款已用另一流水号完成，请勿重复登记');
        }
        return refund;
      }
      if (refund.status !== 'APPROVED' && refund.status !== 'PROCESSING') {
        throw new BadRequestException('只有已审核通过或执行中的退款可以执行');
      }
      if (!refund.payment) {
        throw new BadRequestException('退款未关联原付款记录，请先修复交易数据');
      }
      if (refund.payment.method === 'alipay' || refund.payment.method === 'wechat') {
        throw new BadRequestException(
          '在线支付必须通过原支付渠道退款，不能使用线下执行入口',
        );
      }

      if (action === 'FAILED' && executionNote && operator.id != null) {
        const latestFailure = await tx.tradeEvent.findFirst({
          where: {
            entityType: TRADE_ENTITY_TYPE.REFUND,
            entityId: refundId,
            eventType: TRADE_EVENT_TYPE.REFUND_EXECUTE_FAILED,
          },
          orderBy: { createdAt: 'desc' },
          select: { operatorId: true, reason: true },
        });
        if (
          refund.processedBy === operator.id &&
          latestFailure?.operatorId === operator.id &&
          latestFailure.reason === executionNote
        ) {
          return refund;
        }
      }

      const now = new Date();
      if (action === 'COMPLETED') {
        if (!reference) {
          throw new BadRequestException('线下退款完成必须填写银行或门店退款流水号');
        }
        await this.completeRefund(tx, refund, reference, operator, {
          manualOffline: true,
          ...(executionNote ? { executionNote } : {}),
        });
      } else {
        if (!executionNote) {
          throw new BadRequestException('线下退款执行失败必须填写失败原因');
        }
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
          operator, reason: executionNote,
          metadata: { refundReference: reference || null },
        });
      }

      return tx.refund.findUnique({ where: { id: refundId } });
    });
  }
}
