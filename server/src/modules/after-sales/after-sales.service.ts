import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import { TradeEventsService } from '../trade-events/trade-events.service';
import { TRADE_ENTITY_TYPE, TRADE_EVENT_TYPE, type OperatorContext } from '../trade-events/trade-events.constants';
import { Prisma, type AfterSalesStatus } from '@prisma/client';
import { businessDateKey } from '../../common/time/business-date';
import type { CustomerPrincipal, StaffPrincipal } from '../../common/security/authenticated-principal';
import { lockActiveCustomerForWrite } from '../customers/customer-write-gate';

const ACTIVE_AFTER_SALES_STATUSES: AfterSalesStatus[] = [
  'REQUESTED',
  'APPROVED',
  'RETURNING',
  'QC_PASSED',
  'QC_FAILED',
];
const NON_TERMINAL_OR_COMPLETED_REFUND_STATUSES = [
  'PENDING',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
] as const;

type StaffAfterSalesActor = Pick<StaffPrincipal, 'id' | 'sessionFamilyId'>;
type StaffAfterSalesAction = 'READ' | 'WRITE';

const CUSTOMER_AFTER_SALES_SELECT = {
  id: true,
  caseNo: true,
  orderId: true,
  orderItemId: true,
  type: true,
  status: true,
  reason: true,
  requestedRefundAmount: true,
  approvedRefundAmount: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AfterSalesCaseSelect;

/**
 * 售后工单服务：退款退货 / 换货 / 维修。
 *
 * 售后 ≠ 退款：
 * - 售后审核通过后，如涉及金额退回，由退款中心发起 Refund（关联 afterSalesCaseId）；
 * - 换货/维修不产生退款。
 */
@Injectable()
export class AfterSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradeEvents: TradeEventsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private createCaseNo(): string {
    const date = businessDateKey();
    return `AS${date}${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }

  private requireStaffActorId(actor: StaffAfterSalesActor): number {
    if (!Number.isInteger(actor.id) || Number(actor.id) <= 0) {
      throw new ForbiddenException('当前员工身份无效');
    }
    return Number(actor.id);
  }

  private async lockAuthorizedStaff(
    tx: Prisma.TransactionClient,
    actor: StaffAfterSalesActor,
    action: StaffAfterSalesAction,
  ): Promise<OperatorContext> {
    const actorId = this.requireStaffActorId(actor);
    const locked = action === 'READ'
      ? await tx.$queryRaw<Array<{
          id: number;
          username?: string;
          realName?: string | null;
        }>>(
          Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actorId} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR SHARE`,
        )
      : await tx.$queryRaw<Array<{
          id: number;
          username?: string;
          realName?: string | null;
        }>>(
          Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actorId} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR UPDATE`,
        );
    if (locked.length !== 1) {
      throw new ForbiddenException('当前员工已停用或无权处理售后');
    }
    if (actor.sessionFamilyId) {
      const sessions = action === 'READ'
        ? await tx.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actorId} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
          )
        : await tx.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actorId} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
          );
      if (sessions.length !== 1) {
        throw new ForbiddenException('当前员工会话已失效，不能处理售后');
      }
    }
    return {
      type: 'ADMIN',
      id: locked[0].id,
      name: locked[0].realName || locked[0].username,
    };
  }

  private async lockOrder(tx: Prisma.TransactionClient, orderId: number) {
    const rows = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`,
    );
    if (rows.length === 0) {
      throw new NotFoundException('订单不存在或无权操作');
    }
  }

  private validateCustomerCaseType(orderStatus: string, type: string) {
    if (orderStatus === 'PENDING_PAYMENT') {
      throw new BadRequestException('待付款订单请取消订单，无需申请售后');
    }
    if (orderStatus === 'CANCELLED') {
      throw new BadRequestException('已取消订单不能申请售后');
    }
    if (orderStatus === 'PENDING_SHIP') {
      if (type !== 'REFUND') {
        throw new BadRequestException('待发货订单仅支持申请退款');
      }
      return;
    }
    if (!['SHIPPED', 'COMPLETED'].includes(orderStatus)) {
      throw new BadRequestException('当前订单状态暂不支持自助售后');
    }
  }

  private moneyToCents(value: unknown, fieldName: string) {
    const amount = Number(value);
    const cents = Math.round(amount * 100);
    if (
      !Number.isFinite(amount) ||
      !Number.isSafeInteger(cents) ||
      Math.abs(amount * 100 - cents) > 1e-8
    ) {
      throw new BadRequestException(`${fieldName}无效`);
    }
    return cents;
  }

  async findAll(
    params: { page?: number; pageSize?: number; status?: string; type?: string; keyword?: string },
    actor: StaffAfterSalesActor,
  ) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Record<string, unknown> = {};
    if (params.status && params.status !== 'all') where.status = params.status;
    if (params.type && params.type !== 'all') where.type = params.type;
    if (params.keyword) {
      where.OR = [
        { caseNo: { contains: params.keyword } },
        { reason: { contains: params.keyword } },
        { order: { orderNo: { contains: params.keyword } } },
        { order: { customerName: { contains: params.keyword } } },
      ];
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedStaff(tx, actor, 'READ');
      const [list, total] = await Promise.all([
        tx.afterSalesCase.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            order: { select: { id: true, orderNo: true, customerName: true, customerPhone: true, status: true, finalAmount: true } },
            customer: { select: { id: true, name: true, phone: true } },
            handler: { select: { id: true, realName: true, username: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        tx.afterSalesCase.count({ where }),
      ]);
      return { list, total, page, pageSize };
    });
  }

  async findById(id: number, actor: StaffAfterSalesActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedStaff(tx, actor, 'READ');
      const caseRecord = await tx.afterSalesCase.findUnique({
        where: { id },
        include: {
          order: { include: { items: true } },
          customer: { select: { id: true, name: true, phone: true } },
          handler: { select: { id: true, realName: true, username: true } },
        },
      });
      if (!caseRecord) throw new NotFoundException('售后工单不存在');
      return caseRecord;
    });
  }

  /** 创建售后工单 */
  async create(data: {
    orderId: number;
    orderItemId: number;
    customerId: number;
    type: string;
    reason: string;
    evidenceUrls?: string[];
    customerNote?: string;
    requestedRefundAmount?: number;
    operator: StaffAfterSalesActor;
  }, rawIdempotencyKey: string) {
    const reason = data.reason.trim();
    if (!reason) throw new BadRequestException('请填写售后原因');
    const actorId = this.requireStaffActorId(data.operator);
    const evidenceUrls = data.evidenceUrls?.map((value) => value.trim()).filter(Boolean) ?? [];
    const customerNote = data.customerNote?.trim() || null;
    const requestedRefundAmountCents = data.requestedRefundAmount === undefined
      ? null
      : this.moneyToCents(data.requestedRefundAmount, '申请退款金额');
    const idempotencyKeyHash = this.idempotency.scopedHash(
      `after-sales.admin.${actorId}`,
      rawIdempotencyKey,
    );
    const submissionFingerprint = createHash('sha256')
      .update(JSON.stringify({
        operatorId: actorId,
        orderId: data.orderId,
        orderItemId: data.orderItemId,
        customerId: data.customerId,
        type: data.type,
        reason,
        evidenceUrls,
        customerNote,
        requestedRefundAmountCents,
      }))
      .digest('hex');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const operator = await this.lockAuthorizedStaff(tx, data.operator, 'WRITE');
        await this.lockOrder(tx, data.orderId);
        const existing = await tx.afterSalesCase.findUnique({
          where: { idempotencyKeyHash },
        });
        if (existing) {
          if (existing.submissionFingerprint !== submissionFingerprint) {
            throw new ConflictException(
              '该 Idempotency-Key 已用于不同的后台售后登记',
            );
          }
          return existing;
        }

        const order = await tx.order.findFirst({
          where: {
            id: data.orderId,
            customerId: data.customerId,
            items: { some: { id: data.orderItemId } },
          },
          select: {
            id: true,
            customerId: true,
            orderType: true,
            status: true,
            paidAmount: true,
            refundedAmount: true,
            items: {
              where: { id: data.orderItemId },
              select: { subtotal: true },
            },
          },
        });
        if (!order) {
          throw new NotFoundException('订单不存在或无权操作');
        }
        if (order.orderType !== 'SPOT') {
          throw new BadRequestException('该订单不支持标准零售售后');
        }
        this.validateCustomerCaseType(order.status, data.type);
        if (data.type === 'REFUND' && requestedRefundAmountCents !== null) {
          const requestedCents = requestedRefundAmountCents;
          const paidCents = this.moneyToCents(order.paidAmount, '订单已收金额');
          const refundedCents = this.moneyToCents(
            order.refundedAmount,
            '订单已退金额',
          );
          const itemCents = this.moneyToCents(
            order.items[0]?.subtotal ?? 0,
            '订单商品金额',
          );
          const maxCents = Math.min(itemCents, paidCents - refundedCents);
          if (requestedCents <= 0 || requestedCents > maxCents) {
            throw new BadRequestException(
              `申请退款金额超过当前商品可退额度，最多可申请 ¥${(Math.max(maxCents, 0) / 100).toFixed(2)}`,
            );
          }
        } else if (
          data.type !== 'REFUND'
          && requestedRefundAmountCents !== null
          && requestedRefundAmountCents > 0
        ) {
          throw new BadRequestException('换货或维修工单不能填写退款金额');
        }

        const activeCase = await tx.afterSalesCase.findFirst({
          where: {
            orderId: data.orderId,
            orderItemId: data.orderItemId,
            status: { in: ACTIVE_AFTER_SALES_STATUSES },
          },
          select: { id: true },
        });
        if (activeCase) {
          throw new ConflictException('该商品已有进行中的售后申请');
        }

        const caseRecord = await tx.afterSalesCase.create({
          data: {
            caseNo: this.createCaseNo(),
            orderId: data.orderId,
            orderItemId: data.orderItemId,
            customerId: data.customerId,
            type: data.type as never,
            status: 'REQUESTED',
            reason,
            evidenceUrls: evidenceUrls.length ? evidenceUrls : undefined,
            customerNote,
            requestedRefundAmount: requestedRefundAmountCents === null
              ? null
              : requestedRefundAmountCents / 100,
            idempotencyKeyHash,
            submissionFingerprint,
          },
        });

        await this.tradeEvents.record(tx, {
          orderId: data.orderId, entityType: TRADE_ENTITY_TYPE.AFTER_SALES, entityId: caseRecord.id,
          eventType: TRADE_EVENT_TYPE.AFTER_SALES_REQUESTED, toStatus: 'REQUESTED', operator,
          metadata: { type: data.type, caseNo: caseRecord.caseNo },
        });
        return caseRecord;
      });
    } catch (error: unknown) {
      if (
        error
        && typeof error === 'object'
        && 'code' in error
        && (error as { code?: unknown }).code === 'P2002'
      ) {
        // 同一订单由行锁串行；跨订单复用同一个员工幂等键只可能是异内容冲突。
        throw new ConflictException('该 Idempotency-Key 已用于不同的后台售后登记');
      }
      throw error;
    }
  }

  /** 客户本人按订单商品发起售后；金额、客户和后台字段不接受客户端输入。 */
  async createForCustomer(
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    orderId: number,
    data: { orderItemId: number; type: string; reason: string },
    rawIdempotencyKey: string,
  ) {
    const customerId = principal.id;
    const reason = data.reason.trim();
    if (!reason) throw new BadRequestException('请填写售后原因');
    const idempotencyKeyHash = this.idempotency.scopedHash(
      `after-sales.customer.${customerId}`,
      rawIdempotencyKey,
    );
    const submissionFingerprint = createHash('sha256')
      .update(JSON.stringify({
        customerId,
        orderId,
        orderItemId: data.orderItemId,
        type: data.type,
        reason,
      }))
      .digest('hex');

    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerForWrite(tx, principal);
      const existing = await tx.afterSalesCase.findUnique({
        where: { idempotencyKeyHash },
        select: {
          id: true,
          customerId: true,
          submissionFingerprint: true,
        },
      });
      if (existing) {
        if (
          existing.customerId !== customerId ||
          existing.submissionFingerprint !== submissionFingerprint
        ) {
          throw new ConflictException(
            '该 Idempotency-Key 已用于不同的售后申请',
          );
        }
        const replayed = await tx.afterSalesCase.findUnique({
          where: { id: existing.id },
          select: CUSTOMER_AFTER_SALES_SELECT,
        });
        if (!replayed) {
          throw new ConflictException('售后申请恢复失败，请刷新后重试');
        }
        return replayed;
      }

      await this.lockOrder(tx, orderId);
      const order = await tx.order.findFirst({
        where: { id: orderId, customerId },
        select: {
          id: true,
          customerId: true,
          orderType: true,
          status: true,
          items: { select: { id: true } },
        },
      });
      if (!order) {
        throw new NotFoundException('订单不存在或无权操作');
      }
      if (order.orderType !== 'SPOT') {
        throw new BadRequestException('该订单不支持客户自助售后，请联系顾问');
      }
      this.validateCustomerCaseType(order.status, data.type);
      if (!order.items.some((item) => item.id === data.orderItemId)) {
        throw new NotFoundException('订单商品不存在');
      }

      const activeCase = await tx.afterSalesCase.findFirst({
        where: {
          orderId,
          orderItemId: data.orderItemId,
          status: { in: ACTIVE_AFTER_SALES_STATUSES },
        },
        select: { id: true },
      });
      if (activeCase) {
        throw new ConflictException('该商品已有进行中的售后申请');
      }

      const caseRecord = await tx.afterSalesCase.create({
        data: {
          caseNo: this.createCaseNo(),
          orderId,
          orderItemId: data.orderItemId,
          customerId,
          type: data.type as never,
          status: 'REQUESTED',
          reason,
          requestedRefundAmount: null,
          idempotencyKeyHash,
          submissionFingerprint,
        },
        select: CUSTOMER_AFTER_SALES_SELECT,
      });

      await this.tradeEvents.record(tx, {
        orderId,
        entityType: TRADE_ENTITY_TYPE.AFTER_SALES,
        entityId: caseRecord.id,
        eventType: TRADE_EVENT_TYPE.AFTER_SALES_REQUESTED,
        toStatus: 'REQUESTED',
        operator: { type: 'CUSTOMER', id: customerId },
        metadata: { type: data.type, caseNo: caseRecord.caseNo },
      });
      return caseRecord;
    });
  }

  /** 客户只能撤销本人仍处于待受理状态的售后申请。 */
  async cancelForCustomer(
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    caseId: number,
  ) {
    const customerId = principal.id;
    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerForWrite(tx, principal);
      const caseRef = await tx.afterSalesCase.findFirst({
        where: { id: caseId, customerId },
        select: { id: true, orderId: true },
      });
      if (!caseRef) {
        throw new NotFoundException('售后申请不存在或无权操作');
      }

      await this.lockOrder(tx, caseRef.orderId);
      const caseRecord = await tx.afterSalesCase.findFirst({
        where: {
          id: caseId,
          customerId,
          order: { customerId },
        },
        select: { id: true, orderId: true, status: true },
      });
      if (!caseRecord) {
        throw new NotFoundException('售后申请不存在或无权操作');
      }
      // 请求可能已提交但 HTTP 响应在途中丢失；同一客户重放同一 caseId 时，
      // 已取消就是同一业务结果，不重复写状态或事件。
      if (caseRecord.status === 'CANCELLED') {
        return tx.afterSalesCase.findUnique({
          where: { id: caseId },
          select: CUSTOMER_AFTER_SALES_SELECT,
        });
      }
      if (caseRecord.status !== 'REQUESTED') {
        throw new BadRequestException('只有待受理的售后申请可以撤销');
      }

      const updated = await tx.afterSalesCase.updateMany({
        where: { id: caseId, customerId, status: 'REQUESTED' },
        data: { status: 'CANCELLED' },
      });
      if (updated.count === 0) {
        throw new ConflictException('售后申请状态已变化，请刷新后重试');
      }

      await this.tradeEvents.record(tx, {
        orderId: caseRecord.orderId,
        entityType: TRADE_ENTITY_TYPE.AFTER_SALES,
        entityId: caseId,
        eventType: TRADE_EVENT_TYPE.AFTER_SALES_STATUS_CHANGED,
        fromStatus: 'REQUESTED',
        toStatus: 'CANCELLED',
        operator: { type: 'CUSTOMER', id: customerId },
        reason: '客户撤销售后申请',
      });
      return tx.afterSalesCase.findUnique({
        where: { id: caseId },
        select: CUSTOMER_AFTER_SALES_SELECT,
      });
    });
  }

  /** 审核售后：通过/驳回 */
  async review(
    caseId: number,
    action: 'APPROVED' | 'REJECTED',
    adminNote: string | undefined,
    approvedRefundAmount: number | undefined,
    actor: StaffAfterSalesActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const operator = await this.lockAuthorizedStaff(tx, actor, 'WRITE');
      const caseRef = await tx.afterSalesCase.findUnique({
        where: { id: caseId },
        select: { orderId: true },
      });
      if (!caseRef) throw new NotFoundException('售后工单不存在');
      await this.lockOrder(tx, caseRef.orderId);
      const caseRecord = await tx.afterSalesCase.findUnique({
        where: { id: caseId },
        include: {
          order: {
            select: {
              paidAmount: true,
              refundedAmount: true,
              items: {
                select: { id: true, subtotal: true },
              },
            },
          },
        },
      });
      if (!caseRecord || caseRecord.orderId !== caseRef.orderId) {
        throw new NotFoundException('售后工单不存在');
      }
      if (caseRecord.status !== 'REQUESTED') {
        throw new BadRequestException('只有已申请的售后工单可以审核');
      }

      let effectiveApprovedRefundAmount = caseRecord.approvedRefundAmount;
      if (action === 'APPROVED' && caseRecord.type === 'REFUND') {
        const candidate =
          approvedRefundAmount ?? caseRecord.requestedRefundAmount;
        if (candidate === null || this.moneyToCents(candidate, '审核退款金额') <= 0) {
          throw new BadRequestException('退款类售后审核通过时必须确认正数退款额度');
        }
        if (
          caseRecord.requestedRefundAmount !== null &&
          this.moneyToCents(candidate, '审核退款金额') >
            this.moneyToCents(caseRecord.requestedRefundAmount, '申请退款金额')
        ) {
          throw new BadRequestException('审核退款金额不能超过客户申请金额');
        }
        const refundableOrderCents =
          this.moneyToCents(caseRecord.order.paidAmount, '订单已收金额') -
          this.moneyToCents(caseRecord.order.refundedAmount, '订单已退金额');
        const itemCents = this.moneyToCents(
          caseRecord.order.items.find((item) => item.id === caseRecord.orderItemId)
            ?.subtotal ?? 0,
          '订单商品金额',
        );
        const approvedCents = this.moneyToCents(candidate, '审核退款金额');
        const maxCents = Math.min(refundableOrderCents, itemCents);
        if (approvedCents > maxCents) {
          throw new BadRequestException(
            `审核退款金额超过当前商品可退额度，最多可退 ¥${(Math.max(maxCents, 0) / 100).toFixed(2)}`,
          );
        }
        effectiveApprovedRefundAmount = new Prisma.Decimal(candidate);
      } else if (
        action === 'APPROVED' &&
        approvedRefundAmount !== undefined &&
        this.moneyToCents(approvedRefundAmount, '审核退款金额') > 0
      ) {
        throw new BadRequestException('换货或维修工单不能直接审批退款金额');
      }

      const newStatus: AfterSalesStatus = action === 'APPROVED' ? 'APPROVED' : 'REJECTED';
      const updated = await tx.afterSalesCase.updateMany({
        where: { id: caseId, status: 'REQUESTED' },
        data: {
          status: newStatus,
          adminNote: adminNote?.trim() || caseRecord.adminNote,
          approvedRefundAmount:
            action === 'APPROVED'
              ? effectiveApprovedRefundAmount
              : caseRecord.approvedRefundAmount,
          handledBy: operator.id ?? null,
          handledAt: new Date(),
        },
      });
      if (updated.count === 0) throw new ConflictException('售后工单状态已变化，请刷新后重试');

      const eventType = action === 'APPROVED' ? TRADE_EVENT_TYPE.AFTER_SALES_APPROVED : TRADE_EVENT_TYPE.AFTER_SALES_REJECTED;
      await this.tradeEvents.record(tx, {
        orderId: caseRecord.orderId, entityType: TRADE_ENTITY_TYPE.AFTER_SALES, entityId: caseId,
        eventType, fromStatus: 'REQUESTED', toStatus: newStatus, operator, reason: adminNote?.trim() || null,
      });

      return tx.afterSalesCase.findUnique({ where: { id: caseId } });
    });
  }

  /** 推进售后状态（逆向物流/质检/完成/取消） */
  async updateStatus(caseId: number, status: string, adminNote: string | undefined, actor: StaffAfterSalesActor) {
    return this.prisma.$transaction(async (tx) => {
      const operator = await this.lockAuthorizedStaff(tx, actor, 'WRITE');
      const caseRef = await tx.afterSalesCase.findUnique({
        where: { id: caseId },
        select: { orderId: true },
      });
      if (!caseRef) throw new NotFoundException('售后工单不存在');
      await this.lockOrder(tx, caseRef.orderId);
      const caseRecord = await tx.afterSalesCase.findUnique({ where: { id: caseId } });
      if (!caseRecord || caseRecord.orderId !== caseRef.orderId) {
        throw new NotFoundException('售后工单不存在');
      }

      const newStatus = status as AfterSalesStatus;
      const allowed: Record<string, AfterSalesStatus[]> = {
        REQUESTED: [],
        APPROVED: ['RETURNING', 'COMPLETED', 'CANCELLED'],
        RETURNING: ['QC_PASSED', 'QC_FAILED', 'COMPLETED', 'CANCELLED'],
        QC_PASSED: ['COMPLETED', 'CANCELLED'],
        QC_FAILED: ['COMPLETED', 'CANCELLED'],
        COMPLETED: [],
        REJECTED: [],
        CANCELLED: [],
      };
      if (!allowed[caseRecord.status]?.includes(newStatus)) {
        throw new BadRequestException(`售后状态不能从 ${caseRecord.status} 变更为 ${newStatus}`);
      }
      if (caseRecord.type === 'REFUND' && newStatus === 'COMPLETED') {
        throw new BadRequestException('退款类售后只能在关联退款按审核额度完成后自动结案');
      }
      if (caseRecord.type === 'REFUND' && newStatus === 'CANCELLED') {
        const linkedRefund = await tx.refund.findFirst({
          where: {
            afterSalesCaseId: caseId,
            status: { in: [...NON_TERMINAL_OR_COMPLETED_REFUND_STATUSES] },
          },
          select: { refundNo: true },
        });
        if (linkedRefund) {
          throw new ConflictException(
            `售后已关联退款 ${linkedRefund.refundNo}，请先完成退款对账，不能直接取消`,
          );
        }
      }

      const updated = await tx.afterSalesCase.updateMany({
        where: { id: caseId, status: caseRecord.status as AfterSalesStatus },
        data: { status: newStatus, adminNote: adminNote?.trim() || caseRecord.adminNote },
      });
      if (updated.count === 0) throw new ConflictException('售后工单状态已变化，请刷新后重试');
      await this.tradeEvents.record(tx, {
        orderId: caseRecord.orderId,
        entityType: TRADE_ENTITY_TYPE.AFTER_SALES,
        entityId: caseId,
        eventType: TRADE_EVENT_TYPE.AFTER_SALES_STATUS_CHANGED,
        fromStatus: caseRecord.status,
        toStatus: newStatus,
        operator,
        reason: adminNote?.trim() || null,
      });
      return tx.afterSalesCase.findUnique({ where: { id: caseId } });
    });
  }
}
