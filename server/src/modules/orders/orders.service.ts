import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrderStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';

/** 订单状态机：定义合法状态转换 */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PENDING_SHIP', 'CANCELLED'],
  PENDING_SHIP:    ['SHIPPED'],
  SHIPPED:         ['COMPLETED'],
  COMPLETED:       [],
  CANCELLED:       [],
};

const OFFLINE_PAYMENT_RESERVATION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private prisma: PrismaService) {}

  private createOrderNo(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `JH${date}${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }

  private createPaymentNo(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `PAY${date}${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }

  private validateCustomerData(data: { customerName: string; customerPhone: string; address: string }) {
    const customerName = data.customerName?.trim();
    const customerPhone = data.customerPhone?.trim();
    const address = data.address?.trim();
    if (!customerName || customerName.length > 50) throw new BadRequestException('请提供有效的收货人姓名');
    if (!/^1\d{10}$/.test(customerPhone)) throw new BadRequestException('请提供有效的手机号码');
    if (!address || address.length > 500) throw new BadRequestException('请提供有效的收货地址');
    return { customerName, customerPhone, address };
  }

  private normalizeItems(items: unknown): Map<number, number> {
    if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
      throw new BadRequestException('订单商品数量必须在 1 到 20 件之间');
    }

    const quantities = new Map<number, number>();
    for (const item of items) {
      const skuId = Number((item as { skuId?: unknown }).skuId);
      const quantity = Number((item as { quantity?: unknown }).quantity);
      if (!Number.isInteger(skuId) || skuId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new BadRequestException('订单商品规格或数量无效');
      }
      const nextQuantity = (quantities.get(skuId) || 0) + quantity;
      if (nextQuantity > 99) throw new BadRequestException('同一商品规格的数量不能超过 99');
      quantities.set(skuId, nextQuantity);
    }
    return quantities;
  }

  private async getAvailableStock(skuId: number, fallbackStock: number): Promise<number> {
    const inventory = await this.prisma.inventory.aggregate({
      where: { skuId },
      _sum: { quantity: true },
      _count: { id: true },
    });
    return inventory._count.id > 0 ? inventory._sum.quantity || 0 : fallbackStock;
  }

  private getReservationExpiry(now = new Date()) {
    return new Date(now.getTime() + OFFLINE_PAYMENT_RESERVATION_MS);
  }

  private async reserveStock(
    tx: Prisma.TransactionClient,
    orderId: number,
    skuId: number,
    quantity: number,
    expiresAt: Date,
  ) {
    const inventories = await tx.inventory.findMany({
      where: { skuId },
      orderBy: { quantity: 'desc' },
      select: { id: true, quantity: true },
    });

    if (inventories.length === 0) {
      const result = await tx.productSKU.updateMany({
        where: { id: skuId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (result.count !== 1) throw new BadRequestException('商品库存不足，请刷新后重试');
      await tx.inventoryReservation.create({
        data: { orderId, skuId, quantity, expiresAt },
      });
      return;
    }

    let remaining = quantity;
    for (const inventory of inventories) {
      if (remaining <= 0) break;
      const deduction = Math.min(remaining, inventory.quantity);
      if (deduction <= 0) continue;
      const result = await tx.inventory.updateMany({
        where: { id: inventory.id, quantity: { gte: deduction } },
        data: { quantity: { decrement: deduction } },
      });
      if (result.count !== 1) throw new BadRequestException('商品库存已变动，请刷新后重试');
      await tx.inventoryReservation.create({
        data: {
          orderId,
          inventoryId: inventory.id,
          skuId,
          quantity: deduction,
          expiresAt,
        },
      });
      remaining -= deduction;
    }
    if (remaining > 0) throw new BadRequestException('商品库存不足，请刷新后重试');
  }

  private async releaseStockReservations(
    tx: Prisma.TransactionClient,
    orderId: number,
    releasedAt: Date,
  ) {
    const reservations = await tx.inventoryReservation.findMany({
      where: { orderId, releasedAt: null, consumedAt: null },
      select: { id: true, inventoryId: true, skuId: true, quantity: true },
    });

    for (const reservation of reservations) {
      if (reservation.inventoryId) {
        await tx.inventory.update({
          where: { id: reservation.inventoryId },
          data: { quantity: { increment: reservation.quantity } },
        });
      } else {
        await tx.productSKU.update({
          where: { id: reservation.skuId },
          data: { stock: { increment: reservation.quantity } },
        });
      }
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { releasedAt },
      });
    }

    return reservations.length;
  }

  private async consumeStockReservations(
    tx: Prisma.TransactionClient,
    orderId: number,
    consumedAt: Date,
  ) {
    return tx.inventoryReservation.updateMany({
      where: { orderId, releasedAt: null, consumedAt: null },
      data: { consumedAt },
    });
  }

  private async expireReservationIfNeeded(
    tx: Prisma.TransactionClient,
    orderId: number,
    now = new Date(),
  ) {
    const order = await tx.order.findFirst({
      where: { id: orderId, status: 'PENDING_PAYMENT' },
      include: {
        payments: {
          where: { status: 'PENDING', proofUrl: { not: null } },
          select: { id: true },
        },
      },
    });
    if (!order?.reservedAt || order.payments.length > 0) {
      return false;
    }
    const expiresAt = new Date(order.reservedAt.getTime() + OFFLINE_PAYMENT_RESERVATION_MS);
    if (expiresAt > now) {
      return false;
    }

    await this.releaseStockReservations(tx, order.id, now);
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelledAt: now, reservedAt: null },
    });
    return true;
  }

  async findAll(params: { page?: number; pageSize?: number; status?: string; keyword?: string }) {
    const { page = 1, pageSize = 20, status, keyword } = params;
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { customerName: { contains: keyword } },
        { customerPhone: { contains: keyword } },
      ];
    }

    const _page = +page, _pageSize = +pageSize;
    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: (_page - 1) * _pageSize,
        take: _pageSize,
        include: { items: { include: { product: { select: { id: true, name: true, code: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { list, total, page: _page, pageSize: _pageSize };
  }

  async findById(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, code: true, materialType: true } },
            sku: { select: { skuCode: true, material: true, size: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  async findForCustomer(customerId: number) {
    return this.prisma.order.findMany({
      where: { customerId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, code: true } },
            sku: { select: { skuCode: true, material: true, size: true } },
          },
        },
        payments: { select: { id: true, paymentNo: true, method: true, status: true, proofUrl: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    customerId?: number;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    address: string;
    paymentMethod?: string;
    items: { skuId: number; quantity: number }[];
  }) {
    const customer = this.validateCustomerData(data);
    const quantities = this.normalizeItems(data.items);
    const skus = await this.prisma.productSKU.findMany({
      where: {
        id: { in: [...quantities.keys()] },
        isActive: true,
        product: { status: 'PUBLISHED', deletedAt: null },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            code: true,
            primaryImage: { select: { url: true } },
            images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
      },
    });
    if (skus.length !== quantities.size) throw new BadRequestException('订单中包含不可购买的商品规格');

    let totalAmount = 0;
    const orderItems: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];
    for (const sku of skus) {
      const quantity = quantities.get(sku.id)!;
      const unitPrice = Number(sku.price);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new BadRequestException(`商品 ${sku.skuCode} 尚未设置有效售价`);
      }
      const availableStock = await this.getAvailableStock(sku.id, sku.stock);
      if (availableStock < quantity) {
        throw new BadRequestException(`商品 ${sku.skuCode} 库存不足`);
      }
      const subtotal = unitPrice * quantity;
      totalAmount += subtotal;
      orderItems.push({
        skuId: sku.id,
        productId: sku.productId,
        quantity,
        unitPrice,
        subtotal,
        productNameSnapshot: sku.product.name,
        productCodeSnapshot: sku.product.code,
        productImageSnapshot: sku.product.primaryImage?.url || sku.product.images[0]?.url || null,
        skuSnapshot: [sku.skuCode, sku.material, sku.size].filter(Boolean).join(' / '),
      });
    }

    const latestGoldPrice = await this.prisma.goldPrice.findFirst({ orderBy: { recordDate: 'desc' } });

    const reservedAt = new Date();
    const expiresAt = this.getReservationExpiry(reservedAt);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNo: this.createOrderNo(),
          customerId: data.customerId || null,
          customerName: customer.customerName,
          customerPhone: customer.customerPhone,
          customerEmail: data.customerEmail?.trim() || null,
          address: customer.address,
          totalAmount,
          finalAmount: totalAmount,
          lockedGoldPrice: latestGoldPrice?.price || null,
          paymentMethod: data.paymentMethod || 'bank_transfer',
          status: 'PENDING_PAYMENT',
          reservedAt,
          items: { create: orderItems },
        },
        include: { items: true },
      });

      for (const item of order.items) {
        await this.reserveStock(tx, order.id, item.skuId, item.quantity, expiresAt);
      }

      return order;
    });
  }

  async submitOfflinePaymentProof(customerId: number, orderId: number, proofUrl: string) {
    const normalizedProofUrl = proofUrl?.trim();
    if (!normalizedProofUrl || !normalizedProofUrl.startsWith('/uploads/')) {
      throw new BadRequestException('付款凭证必须是已上传的文件');
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, customerId } });
      if (!order) throw new NotFoundException('订单不存在或无权操作');
      if (order.status !== 'PENDING_PAYMENT') throw new BadRequestException('当前订单不能提交付款凭证');
      if (await this.expireReservationIfNeeded(tx, order.id)) {
        return null;
      }

      const existingPayment = await tx.payment.findFirst({
        where: { orderId, type: 'FULL' },
        orderBy: { createdAt: 'desc' },
      });
      const payment = existingPayment
        ? await tx.payment.update({
          where: { id: existingPayment.id },
          data: { method: 'bank_transfer', status: 'PENDING', proofUrl: normalizedProofUrl, reviewedBy: null, reviewedAt: null, reviewNote: null },
        })
        : await tx.payment.create({
          data: {
            orderId,
            paymentNo: this.createPaymentNo(),
            amount: order.finalAmount,
            method: 'bank_transfer',
            type: 'FULL',
            status: 'PENDING',
            proofUrl: normalizedProofUrl,
          },
        });
      await tx.order.update({
        where: { id: orderId },
        data: { paymentMethod: 'bank_transfer', paymentProof: normalizedProofUrl },
      });
      return payment;
    });
    if (!payment) throw new BadRequestException('订单的库存保留已到期，请重新下单');
    return payment;
  }

  async approveOfflinePayment(paymentId: number, reviewerId: number, reviewNote?: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { order: { include: { items: true } } },
      });
      if (!payment) throw new NotFoundException('付款记录不存在');
      if (payment.method !== 'bank_transfer' || payment.status !== 'PENDING' || !payment.proofUrl) {
        throw new BadRequestException('该付款记录不满足线下转账审核条件');
      }
      if (payment.order.status !== 'PENDING_PAYMENT') {
        throw new BadRequestException('订单状态已变化，不能确认收款');
      }

      const consumed = await this.consumeStockReservations(tx, payment.orderId, new Date());
      if (consumed.count === 0) {
        const expiresAt = this.getReservationExpiry();
        for (const item of payment.order.items) {
          await this.reserveStock(tx, payment.orderId, item.skuId, item.quantity, expiresAt);
        }
        await this.consumeStockReservations(tx, payment.orderId, new Date());
      }

      const now = new Date();
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'PAID', paidAt: now, reviewedBy: reviewerId, reviewedAt: now, reviewNote: reviewNote?.trim() || null },
      });
      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: 'PENDING_SHIP', reservedAt: now, paymentConfirmedAt: now },
      });
      return updatedPayment;
    });
  }

  async rejectOfflinePayment(paymentId: number, reviewerId: number, reviewNote?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('付款记录不存在');
    if (payment.method !== 'bank_transfer' || payment.status !== 'PENDING') {
      throw new BadRequestException('该付款记录不能被驳回');
    }
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'FAILED', reviewedBy: reviewerId, reviewedAt: new Date(), reviewNote: reviewNote?.trim() || null },
    });
  }

  async ship(id: number, data: { logisticsCompany: string; logisticsNo: string; internalNote?: string }) {
    const logisticsCompany = data.logisticsCompany?.trim();
    const logisticsNo = data.logisticsNo?.trim();
    if (!logisticsCompany || !logisticsNo) throw new BadRequestException('发货必须填写物流公司和物流单号');
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'PENDING_SHIP') throw new BadRequestException('只有待发货订单可以发货');
    return this.prisma.order.update({
      where: { id },
      data: {
        status: 'SHIPPED',
        logisticsCompany,
        logisticsNo,
        internalNote: data.internalNote?.trim() || order.internalNote,
        shippedAt: new Date(),
      },
    });
  }

  async updateStatus(id: number, data: { status: string; logisticsCompany?: string; logisticsNo?: string; internalNote?: string }) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');

    const newStatus = data.status as OrderStatus;
    const currentStatus = order.status as OrderStatus;

    // 状态机校验：检查是否是合法的状态转换
    const allowedNext = VALID_TRANSITIONS[currentStatus];
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      throw new BadRequestException(
        `订单状态不能从 ${currentStatus} 变更为 ${newStatus}。允许的变更为: ${allowedNext?.join(', ') || '无'}`
      );
    }

    if (newStatus === 'PENDING_SHIP') {
      throw new BadRequestException('待发货必须通过付款审核进入');
    }
    if (newStatus === 'SHIPPED') {
      throw new BadRequestException('发货请使用专用接口并提交物流信息');
    }

    const updateData: any = { status: newStatus };
    if (data.logisticsCompany) updateData.logisticsCompany = data.logisticsCompany;
    if (data.logisticsNo) updateData.logisticsNo = data.logisticsNo;
    if (data.internalNote) updateData.internalNote = data.internalNote;

    this.logger.log(`订单 #${id} 状态变更: ${currentStatus} → ${newStatus}`);

    if (newStatus === 'COMPLETED') updateData.completedAt = new Date();
    if (newStatus === 'CANCELLED') {
      const cancelledAt = new Date();
      return this.prisma.$transaction(async (tx) => {
        await this.releaseStockReservations(tx, id, cancelledAt);
        return tx.order.update({
          where: { id },
          data: { ...updateData, cancelledAt, reservedAt: null },
        });
      });
    }
    return this.prisma.order.update({ where: { id }, data: updateData });
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async releaseExpiredReservations() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - OFFLINE_PAYMENT_RESERVATION_MS);
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        reservedAt: { lte: cutoff },
        payments: { none: { status: 'PENDING', proofUrl: { not: null } } },
      },
      select: { id: true },
    });

    let releasedCount = 0;
    for (const order of expiredOrders) {
      try {
        const expired = await this.prisma.$transaction((tx) =>
          this.expireReservationIfNeeded(tx, order.id, now),
        );
        if (expired) releasedCount += 1;
      } catch (error) {
        this.logger.error(`订单 #${order.id} 的库存预占释放失败`, error instanceof Error ? error.stack : undefined);
      }
    }

    if (releasedCount > 0) {
      this.logger.log(`已释放 ${releasedCount} 笔超时未付款订单的库存预占`);
    }
  }

  async getStatistics() {
    const [total, todayCount, monthlyRevenue, pendingShip] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      this.prisma.order.aggregate({
        where: {
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          status: { in: ['SHIPPED', 'COMPLETED'] },
        },
        _sum: { finalAmount: true },
      }),
      this.prisma.order.count({ where: { status: 'PENDING_SHIP' } }),
    ]);

    return {
      total,
      todayCount,
      monthlyRevenue: monthlyRevenue._sum.finalAmount || 0,
      pendingShip,
    };
  }
}
