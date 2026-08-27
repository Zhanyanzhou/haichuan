import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, QuotationStatus, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { businessDateKey } from '../../common/time/business-date';
import { runWithDocumentNumberRetry } from '../../common/trade/document-number-retry';

export interface QuotationActor {
  id: number;
  role: Role;
}

/**
 * 报价管理服务：员工可维护草稿、提交待确认和取消。
 * 客户本人确认与转单在完整身份状态机和不可变快照落地前安全暂停。
 * 报价单号、金额计算及其余员工状态转换仍分别使用唯一约束、整数分和乐观锁。
 */
@Injectable()
export class QuotationsService {
  /** 报价单状态机 */
  private static VALID_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
    DRAFT: ['PENDING_CONFIRM', 'CANCELLED'],
    PENDING_CONFIRM: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['CONVERTED', 'CANCELLED'],
    EXPIRED: [],
    CANCELLED: [],
    CONVERTED: [],
  };

  constructor(private readonly prisma: PrismaService) {}

  private isAdministrator(actor: QuotationActor) {
    return actor?.role === 'SUPER_ADMIN' || actor?.role === 'ADMIN';
  }

  private accessScope(actor: QuotationActor): { salesConsultantId?: number } {
    if (this.isAdministrator(actor)) return {};
    if (actor?.role === 'SALES_CONSULTANT' && Number.isInteger(actor.id) && actor.id > 0) {
      return { salesConsultantId: actor.id };
    }
    throw new ForbiddenException('无权访问报价单');
  }

  private async resolveSalesConsultantId(
    requestedId: number | undefined,
    actor: QuotationActor,
  ): Promise<number | undefined> {
    if (!this.isAdministrator(actor)) {
      this.accessScope(actor);
      return actor.id;
    }
    if (requestedId === undefined) return undefined;
    const consultant = await this.prisma.user.findUnique({
      where: { id: requestedId },
      select: { id: true, role: true, status: true },
    });
    if (!consultant || consultant.role !== 'SALES_CONSULTANT' || consultant.status !== 'ACTIVE') {
      throw new BadRequestException('销售顾问不存在、已停用或角色不正确');
    }
    return consultant.id;
  }

  /** 生成报价单号：QT + 日期 + 4 位日内流水 */
  private async generateQuoteNo(tx: Prisma.TransactionClient): Promise<string> {
    const date = businessDateKey();
    const prefix = `QT${date}`;
    const suffixStart = prefix.length + 1;
    const [latest] = await tx.$queryRaw<
      Array<{ max_sequence: bigint | number | string | null }>
    >(
      Prisma.sql`
        SELECT MAX(CAST(SUBSTRING(quote_no, ${suffixStart}) AS UNSIGNED)) AS max_sequence
        FROM quotations
        WHERE quote_no LIKE ${`${prefix}%`}
          AND SUBSTRING(quote_no, ${suffixStart}) REGEXP '^[0-9]+$'
      `,
    );
    const seq = BigInt(String(latest?.max_sequence ?? 0)) + 1n;
    return `${prefix}${seq.toString().padStart(4, '0')}`;
  }

  /** 由商品行计算报价金额（原价合计 / 折扣 / 成交价合计，整数分） */
  private computeAmounts(items: Array<{ unitPrice: number; quotedPrice: number; quantity: number }>) {
    let totalCents = 0;
    let finalCents = 0;
    for (const it of items) {
      totalCents += Math.round(Number(it.unitPrice) * 100) * it.quantity;
      finalCents += Math.round(Number(it.quotedPrice) * 100) * it.quantity;
    }
    return {
      totalAmount: new Prisma.Decimal(totalCents).div(100),
      finalAmount: new Prisma.Decimal(finalCents).div(100),
      discountAmount: new Prisma.Decimal(Math.max(0, totalCents - finalCents)).div(100),
    };
  }

  /** 商品行 → QuotationItem 入库数据（整数分） */
  private buildItemData(items: Array<{ skuId?: number; productId?: number; productName: string; productImage?: string; spec?: string; quantity: number; unitPrice: number; quotedPrice: number }>) {
    return items.map((it) => {
      const subtotalCents = Math.round(Number(it.quotedPrice) * 100) * it.quantity;
      return {
        skuId: it.skuId ?? null,
        productId: it.productId ?? null,
        productName: it.productName,
        productImage: it.productImage ?? null,
        spec: it.spec ?? null,
        quantity: it.quantity,
        unitPrice: new Prisma.Decimal(Math.round(Number(it.unitPrice) * 100)).div(100),
        quotedPrice: new Prisma.Decimal(Math.round(Number(it.quotedPrice) * 100)).div(100),
        subtotal: new Prisma.Decimal(subtotalCents).div(100),
      };
    });
  }

  async findAll(
    params: { page?: number; pageSize?: number; status?: string; keyword?: string; salesConsultantId?: number },
    actor: QuotationActor,
  ) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Prisma.QuotationWhereInput = {};
    if (params.status && params.status !== 'all') where.status = params.status as QuotationStatus;
    if (this.isAdministrator(actor)) {
      if (params.salesConsultantId) where.salesConsultantId = Number(params.salesConsultantId);
    } else {
      Object.assign(where, this.accessScope(actor));
    }
    if (params.keyword) {
      where.OR = [
        { quoteNo: { contains: params.keyword } },
        { customerName: { contains: params.keyword } },
        { customerPhone: { contains: params.keyword } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: true,
          customer: { select: { id: true, name: true, phone: true } },
          salesConsultant: { select: { id: true, realName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.quotation.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findById(id: number, actor: QuotationActor) {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, ...this.accessScope(actor) },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, code: true } },
            sku: { select: { id: true, skuCode: true } },
          },
        },
        customer: { select: { id: true, name: true, phone: true, email: true } },
        salesConsultant: { select: { id: true, realName: true, username: true } },
        convertedOrder: { select: { id: true, orderNo: true, status: true } },
      },
    });
    if (!quotation) throw new NotFoundException('报价单不存在');
    return quotation;
  }

  async create(data: {
    customerId?: number;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    salesConsultantId?: number;
    remark?: string;
    depositAmount?: number;
    validUntil?: Date;
    items: Array<{ skuId?: number; productId?: number; productName: string; productImage?: string; spec?: string; quantity: number; unitPrice: number; quotedPrice: number }>;
  }, actor: QuotationActor) {
    if (!data.items?.length) throw new BadRequestException('报价单至少包含一个商品');
    if (!data.customerName?.trim() || !data.customerPhone?.trim()) {
      throw new BadRequestException('请提供客户姓名和手机号');
    }
    const amounts = this.computeAmounts(data.items);
    const items = this.buildItemData(data.items);
    const salesConsultantId = await this.resolveSalesConsultantId(data.salesConsultantId, actor);

    return runWithDocumentNumberRetry({
      targetMarkers: ['quoteNo', 'quote_no', 'quotations_quote_no_key'],
      documentLabel: '报价单',
      runTransaction: () => this.prisma.$transaction(async (tx) =>
        tx.quotation.create({
          data: {
            quoteNo: await this.generateQuoteNo(tx),
            customerId: data.customerId || null,
            customerName: data.customerName.trim(),
            customerPhone: data.customerPhone.trim(),
            customerEmail: data.customerEmail?.trim() || null,
            salesConsultantId: salesConsultantId ?? null,
            status: 'DRAFT',
            totalAmount: amounts.totalAmount,
            discountAmount: amounts.discountAmount,
            finalAmount: amounts.finalAmount,
            depositAmount: new Prisma.Decimal(Math.round(Number(data.depositAmount || 0) * 100)).div(100),
            validUntil: data.validUntil || null,
            remark: data.remark?.trim() || null,
            items: { create: items },
          },
          include: { items: true },
        }),
      ),
    });
  }

  /** 编辑报价单（仅 DRAFT 可改） */
  async update(id: number, data: {
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    salesConsultantId?: number;
    remark?: string;
    depositAmount?: number;
    validUntil?: Date;
    items?: Array<{ skuId?: number; productId?: number; productName: string; productImage?: string; spec?: string; quantity: number; unitPrice: number; quotedPrice: number }>;
  }, actor: QuotationActor) {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, ...this.accessScope(actor) },
    });
    if (!quotation) throw new NotFoundException('报价单不存在');
    if (quotation.status !== 'DRAFT') throw new BadRequestException('只有草稿状态的报价单可以编辑');

    const updateData: Prisma.QuotationUncheckedUpdateInput = {};
    if (data.customerName !== undefined) updateData.customerName = data.customerName.trim();
    if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone.trim();
    if (data.customerEmail !== undefined) updateData.customerEmail = data.customerEmail.trim() || null;
    if (this.isAdministrator(actor) && data.salesConsultantId !== undefined) {
      updateData.salesConsultantId = await this.resolveSalesConsultantId(data.salesConsultantId, actor);
    }
    if (data.remark !== undefined) updateData.remark = data.remark?.trim() || null;
    if (data.depositAmount !== undefined) updateData.depositAmount = new Prisma.Decimal(Math.round(Number(data.depositAmount) * 100)).div(100);
    if (data.validUntil !== undefined) updateData.validUntil = data.validUntil || null;

    // 商品行变更：重算金额 + 替换全部 items（先删后建，事务内）
    if (data.items) {
      const amounts = this.computeAmounts(data.items);
      updateData.totalAmount = amounts.totalAmount;
      updateData.discountAmount = amounts.discountAmount;
      updateData.finalAmount = amounts.finalAmount;
      const newItems = this.buildItemData(data.items);
      return this.prisma.$transaction((tx) =>
        tx.quotation.update({
          where: { id, ...this.accessScope(actor) },
          data: {
            ...updateData,
            items: { deleteMany: {}, create: newItems },
          },
          include: { items: true },
        }),
      );
    }

    return this.prisma.quotation.update({
      where: { id, ...this.accessScope(actor) },
      data: updateData,
      include: { items: true },
    });
  }

  /** 推进报价单状态（乐观锁） */
  async changeStatus(id: number, newStatus: QuotationStatus, actor: QuotationActor) {
    if (newStatus === 'CONFIRMED') {
      throw new ForbiddenException(
        '后台员工不能代替客户确认报价；客户本人确认能力尚未开放',
      );
    }
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, ...this.accessScope(actor) },
    });
    if (!quotation) throw new NotFoundException('报价单不存在');
    const allowed = QuotationsService.VALID_TRANSITIONS[quotation.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new BadRequestException(`报价单状态不能从 ${quotation.status} 变更为 ${newStatus}`);
    }
    const updated = await this.prisma.quotation.updateMany({
      where: { id, status: quotation.status, ...this.accessScope(actor) },
      data: { status: newStatus },
    });
    if (updated.count === 0) throw new ConflictException('报价单状态已变化，请刷新后重试');
    return this.prisma.quotation.findFirst({
      where: { id, ...this.accessScope(actor) },
    });
  }

  /**
   * 当前 Schema 不能证明 CONFIRMED 由客户本人产生，也不能冻结完整确认快照。
   * 在客户身份确认状态机落地前，服务层直接暂停转单，确保不会产生重复或孤立订单。
   */
  async convertToOrder(
    _id: number,
    _data: {
      address: string;
      orderType?: 'SPOT' | 'CUSTOM' | 'RESERVATION' | 'OFFLINE';
    },
  ): Promise<never> {
    throw new ServiceUnavailableException(
      '报价转订单暂未开放：需先完成客户本人确认与不可变报价快照',
    );
  }

  async remove(id: number, actor: QuotationActor) {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, ...this.accessScope(actor) },
    });
    if (!quotation) throw new NotFoundException('报价单不存在');
    if (quotation.status !== 'DRAFT') {
      throw new BadRequestException('只有从未提交的草稿报价单可以删除');
    }
    return this.prisma.quotation.delete({
      where: { id, ...this.accessScope(actor) },
    });
  }
}
