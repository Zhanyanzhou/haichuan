import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TradeEventsService } from '../trade-events/trade-events.service';
import { TRADE_ENTITY_TYPE, TRADE_EVENT_TYPE, type OperatorContext } from '../trade-events/trade-events.constants';
import type { AfterSalesStatus } from '@prisma/client';

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
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `AS${date}${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
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
    orderItemId?: number;
    customerId?: number;
    type: string;
    reason: string;
    evidenceUrls?: string[];
    customerNote?: string;
    requestedRefundAmount?: number;
    operator: OperatorContext;
  }) {
    const order = await this.prisma.order.findUnique({ where: { id: data.orderId } });
    if (!order) throw new NotFoundException('订单不存在');

    const caseRecord = await this.prisma.afterSalesCase.create({
      data: {
        caseNo: this.createCaseNo(),
        orderId: data.orderId,
        orderItemId: data.orderItemId ?? null,
        customerId: data.customerId ?? order.customerId ?? null,
        type: data.type as never,
        status: 'REQUESTED',
        reason: data.reason.trim(),
        evidenceUrls: data.evidenceUrls?.length ? data.evidenceUrls : undefined,
        customerNote: data.customerNote?.trim() || null,
        requestedRefundAmount: data.requestedRefundAmount ?? null,
      },
    });

    await this.tradeEvents.record(this.prisma, {
      orderId: data.orderId, entityType: TRADE_ENTITY_TYPE.AFTER_SALES, entityId: caseRecord.id,
      eventType: TRADE_EVENT_TYPE.AFTER_SALES_REQUESTED, toStatus: 'REQUESTED', operator: data.operator,
      metadata: { type: data.type, caseNo: caseRecord.caseNo },
    });

    return caseRecord;
  }

  /** 审核售后：通过/驳回 */
  async review(
    caseId: number,
    action: 'APPROVED' | 'REJECTED',
    adminNote: string | undefined,
    approvedRefundAmount: number | undefined,
    operator: OperatorContext,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const caseRecord = await tx.afterSalesCase.findUnique({ where: { id: caseId } });
      if (!caseRecord) throw new NotFoundException('售后工单不存在');
      if (caseRecord.status !== 'REQUESTED') {
        throw new BadRequestException('只有已申请的售后工单可以审核');
      }

      const newStatus: AfterSalesStatus = action === 'APPROVED' ? 'APPROVED' : 'REJECTED';
      const updated = await tx.afterSalesCase.updateMany({
        where: { id: caseId, status: 'REQUESTED' },
        data: {
          status: newStatus,
          adminNote: adminNote?.trim() || caseRecord.adminNote,
          approvedRefundAmount: action === 'APPROVED' && approvedRefundAmount !== undefined
            ? approvedRefundAmount
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
    const caseRecord = await this.prisma.afterSalesCase.findUnique({ where: { id: caseId } });
    if (!caseRecord) throw new NotFoundException('售后工单不存在');

    const newStatus = status as AfterSalesStatus;
    // 简单状态机：REQUESTED→(已审核后)→RETURNING→QC_PASSED/QC_FAILED→COMPLETED；任意非终态→CANCELLED
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.afterSalesCase.updateMany({
        where: { id: caseId, status: caseRecord.status as AfterSalesStatus },
        data: { status: newStatus, adminNote: adminNote?.trim() || caseRecord.adminNote },
      });
      if (updated.count === 0) throw new ConflictException('售后工单状态已变化，请刷新后重试');
      return tx.afterSalesCase.findUnique({ where: { id: caseId } });
    });
  }
}
