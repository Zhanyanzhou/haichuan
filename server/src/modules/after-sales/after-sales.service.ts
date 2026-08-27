import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TradeEventsService } from '../trade-events/trade-events.service';
import { TRADE_ENTITY_TYPE, TRADE_EVENT_TYPE, type OperatorContext } from '../trade-events/trade-events.constants';
import { Prisma, type AfterSalesStatus } from '@prisma/client';
import { businessDateKey } from '../../common/time/business-date';

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
  ) {}

  private createCaseNo(): string {
    const date = businessDateKey();
    return `AS${date}${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
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

  async findAll(params: { page?: number; pageSize?: number; status?: string; type?: string; keyword?: string }) {
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

    const [list, total] = await Promise.all([
      this.prisma.afterSalesCase.findMany({
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
      this.prisma.afterSalesCase.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const caseRecord = await this.prisma.afterSalesCase.findUnique({
      where: { id },
      include: {
        order: { include: { items: true } },
        customer: { select: { id: true, name: true, phone: true } },
        handler: { select: { id: true, realName: true, username: true } },
      },
    });
    if (!caseRecord) throw new NotFoundException('售后工单不存在');
    return caseRecord;
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
    operator: OperatorContext;
  }) {
    const reason = data.reason.trim();
    if (!reason) throw new BadRequestException('请填写售后原因');

    return this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, data.orderId);
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
      if (data.type === 'REFUND' && data.requestedRefundAmount !== undefined) {
        const requestedCents = this.moneyToCents(
          data.requestedRefundAmount,
          '申请退款金额',
        );
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
        data.type !== 'REFUND' &&
        data.requestedRefundAmount !== undefined &&
        this.moneyToCents(data.requestedRefundAmount, '申请退款金额') > 0
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
          evidenceUrls: data.evidenceUrls?.length ? data.evidenceUrls : undefined,
          customerNote: data.customerNote?.trim() || null,
          requestedRefundAmount: data.requestedRefundAmount ?? null,
        },
      });

      await this.tradeEvents.record(tx, {
        orderId: data.orderId, entityType: TRADE_ENTITY_TYPE.AFTER_SALES, entityId: caseRecord.id,
        eventType: TRADE_EVENT_TYPE.AFTER_SALES_REQUESTED, toStatus: 'REQUESTED', operator: data.operator,
        metadata: { type: data.type, caseNo: caseRecord.caseNo },
      });
      return caseRecord;
    });
  }

  /** 客户本人按订单商品发起售后；金额、客户和后台字段不接受客户端输入。 */
  async createForCustomer(
    customerId: number,
    orderId: number,
    data: { orderItemId: number; type: string; reason: string },
  ) {
    const reason = data.reason.trim();
    if (!reason) throw new BadRequestException('请填写售后原因');

    return this.prisma.$transaction(async (tx) => {
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
  async cancelForCustomer(customerId: number, caseId: number) {
    return this.prisma.$transaction(async (tx) => {
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
    operator: OperatorContext,
  ) {
    const caseRef = await this.prisma.afterSalesCase.findUnique({
      where: { id: caseId },
      select: { orderId: true },
    });
    if (!caseRef) throw new NotFoundException('售后工单不存在');

    return this.prisma.$transaction(async (tx) => {
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
  async updateStatus(caseId: number, status: string, adminNote: string | undefined, operator: OperatorContext) {
    const caseRef = await this.prisma.afterSalesCase.findUnique({
      where: { id: caseId },
      select: { orderId: true },
    });
    if (!caseRef) throw new NotFoundException('售后工单不存在');

    return this.prisma.$transaction(async (tx) => {
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
