import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, QuotationStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

/**
 * 报价管理服务：草稿 → 待客户确认 → 已确认 → 一键转订单。
 *
 * 设计要点：
 * - 报价单号 QT + 日期 + 4 位流水（事务内查 max +1，@unique 兜底）；
 * - 金额一律整数分计算后转 Decimal，规避浮点误差；
 * - 状态机用乐观锁（status 条件更新），防并发；
 * - 转订单复用 OrdersService.createFromQuotation（含订单号 + 库存预占 + 事件），
 *   转单后保留 convertedOrderId 双向关联。
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

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
   * 报价确认后一键转订单。
   * 商品必须全部关联 SKU（库存预占需要）；转单后保留 convertedOrderId 双向关联。
   */
  async convertToOrder(id: number, data: { address: string; orderType?: 'SPOT' | 'CUSTOM' | 'RESERVATION' | 'OFFLINE' }) {
    const quotation = await this.findById(id);
    if (quotation.status !== 'CONFIRMED') throw new BadRequestException('只有已确认的报价单可以转订单');
    if (quotation.convertedOrderId) throw new BadRequestException('该报价单已转订单');
    if (!data.address?.trim()) throw new BadRequestException('请提供收货地址');

    const missing = quotation.items.filter((it) => !it.skuId || !it.productId);
    if (missing.length) throw new BadRequestException('报价商品缺少 SKU 关联，无法转订单，请先在报价单补全商品');

    const order = await this.ordersService.createFromQuotation({
      quotationId: id,
      customerId: quotation.customerId ?? undefined,
      customerName: quotation.customerName,
      customerPhone: quotation.customerPhone,
      customerEmail: quotation.customerEmail ?? undefined,
      address: data.address,
      salesConsultantId: quotation.salesConsultantId ?? undefined,
      orderType: data.orderType,
      totalAmount: quotation.totalAmount.toString(),
      discountAmount: quotation.discountAmount.toString(),
      finalAmount: quotation.finalAmount.toString(),
      depositAmount: quotation.depositAmount.toString(),
      items: quotation.items.map((it) => ({
        skuId: it.skuId as number,
        productId: it.productId as number,
        productName: it.productName,
        productImage: it.productImage,
        productCode: it.product?.code ?? null,
        skuSnapshot: it.spec,
        quantity: it.quantity,
        unitPrice: it.unitPrice.toString(),
        subtotal: it.subtotal.toString(),
      })),
    });

    // 关联报价单 + 状态 CONVERTED（乐观锁：仅 CONFIRMED 且未转过可转）
    const linked = await this.prisma.quotation.updateMany({
      where: { id, status: 'CONFIRMED', convertedOrderId: null },
      data: { convertedOrderId: order.id, convertedAt: new Date(), status: 'CONVERTED' },
    });
    if (linked.count === 0) {
      // 并发：报价状态已变或已转单。订单已创建——这是罕见竞态，抛错让操作员核对。
      throw new ConflictException('报价单状态已变化，转订单关联失败，请核对已生成订单后重试');
    }
    return { order, quotation: await this.findById(id) };
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
