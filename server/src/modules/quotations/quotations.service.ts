import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, QuotationStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

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
    PENDING_CONFIRM: ['CONFIRMED', 'CANCELLED', 'DRAFT'],
    CONFIRMED: ['CONVERTED', 'CANCELLED'],
    EXPIRED: [],
    CANCELLED: [],
    CONVERTED: [],
  };

  constructor(private readonly prisma: PrismaService) {}

  /** 生成报价单号：QT + 日期 + 4 位日内流水 */
  private async generateQuoteNo(tx: Prisma.TransactionClient): Promise<string> {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `QT${date}`;
    const latest = await tx.quotation.findFirst({
      where: { quoteNo: { startsWith: prefix } },
      orderBy: { quoteNo: 'desc' },
      select: { quoteNo: true },
    });
    let seq = 1;
    if (latest && latest.quoteNo.length > prefix.length) {
      const parsed = Number.parseInt(latest.quoteNo.slice(prefix.length), 10);
      if (!Number.isNaN(parsed) && parsed >= 0) seq = parsed + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
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

  async findAll(params: { page?: number; pageSize?: number; status?: string; keyword?: string; salesConsultantId?: number }) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Prisma.QuotationWhereInput = {};
    if (params.status && params.status !== 'all') where.status = params.status as QuotationStatus;
    if (params.salesConsultantId) where.salesConsultantId = Number(params.salesConsultantId);
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

  async findById(id: number) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
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
  }) {
    if (!data.items?.length) throw new BadRequestException('报价单至少包含一个商品');
    if (!data.customerName?.trim() || !data.customerPhone?.trim()) {
      throw new BadRequestException('请提供客户姓名和手机号');
    }
    const amounts = this.computeAmounts(data.items);
    const items = this.buildItemData(data.items);

    return this.prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.create({
        data: {
          quoteNo: await this.generateQuoteNo(tx),
          customerId: data.customerId || null,
          customerName: data.customerName.trim(),
          customerPhone: data.customerPhone.trim(),
          customerEmail: data.customerEmail?.trim() || null,
          salesConsultantId: data.salesConsultantId ?? null,
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
      });
      return quotation;
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
  }) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation) throw new NotFoundException('报价单不存在');
    if (quotation.status !== 'DRAFT') throw new BadRequestException('只有草稿状态的报价单可以编辑');

    const updateData: Prisma.QuotationUncheckedUpdateInput = {};
    if (data.customerName !== undefined) updateData.customerName = data.customerName.trim();
    if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone.trim();
    if (data.customerEmail !== undefined) updateData.customerEmail = data.customerEmail.trim() || null;
    if (data.salesConsultantId !== undefined) updateData.salesConsultantId = data.salesConsultantId ?? null;
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
      return this.prisma.$transaction(async (tx) => {
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
        return tx.quotation.update({ where: { id }, data: { ...updateData, items: { create: newItems } }, include: { items: true } });
      });
    }

    return this.prisma.quotation.update({ where: { id }, data: updateData, include: { items: true } });
  }

  /** 推进报价单状态（乐观锁） */
  async changeStatus(id: number, newStatus: QuotationStatus) {
    if (newStatus === 'CONFIRMED') {
      throw new ForbiddenException(
        '后台员工不能代替客户确认报价；客户本人确认能力尚未开放',
      );
    }
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation) throw new NotFoundException('报价单不存在');
    const allowed = QuotationsService.VALID_TRANSITIONS[quotation.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new BadRequestException(`报价单状态不能从 ${quotation.status} 变更为 ${newStatus}`);
    }
    const updated = await this.prisma.quotation.updateMany({
      where: { id, status: quotation.status },
      data: { status: newStatus },
    });
    if (updated.count === 0) throw new ConflictException('报价单状态已变化，请刷新后重试');
    return this.prisma.quotation.findUnique({ where: { id } });
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

  async remove(id: number) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation) throw new NotFoundException('报价单不存在');
    if (quotation.status !== 'DRAFT' && quotation.status !== 'CANCELLED') {
      throw new BadRequestException('只有草稿或已取消的报价单可以删除');
    }
    return this.prisma.quotation.delete({ where: { id } });
  }
}
