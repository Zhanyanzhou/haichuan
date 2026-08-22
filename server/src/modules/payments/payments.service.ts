import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentGatewayService, type OnlinePayProvider } from '../../common/payment-gateway/payment-gateway.service';
import type { OperatorContext } from '../trade-events/trade-events.constants';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly paymentGateway: PaymentGatewayService,
    private readonly configService: ConfigService,
  ) {}

  /** 商户单号生成（与 orders.service.createPaymentNo 同格式：PAY+日期+随机段） */
  private createPaymentNo(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `PAY${date}${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }

  /** 在线支付通道可用性（后台收款按钮按此渲染可选项） */
  availableChannels() {
    return this.paymentGateway.availableChannels();
  }

  async findAll(params: { page?: number; pageSize?: number; status?: string; type?: string; method?: string; keyword?: string; startDate?: string; endDate?: string }) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: any = {};
    if (params.status && params.status !== 'all') where.status = params.status;
    if (params.type && params.type !== 'all') where.type = params.type;
    if (params.method && params.method !== 'all') where.method = params.method;
    if (params.keyword) where.OR = [
      { paymentNo: { contains: params.keyword } },
      { gatewayTradeNo: { contains: params.keyword } },
      { order: { orderNo: { contains: params.keyword } } },
      { order: { customerName: { contains: params.keyword } } },
      { order: { customerPhone: { contains: params.keyword } } },
    ];
    if (params.startDate || params.endDate) {
      where.paidAt = {};
      if (params.startDate) where.paidAt.gte = new Date(params.startDate);
      if (params.endDate) {
        const end = new Date(params.endDate);
        end.setDate(end.getDate() + 1);
        where.paidAt.lt = end;
      }
    }
    const [list, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: { select: { id: true, orderNo: true, customerName: true, customerPhone: true, finalAmount: true, status: true } },
          // 审核人信息（审核页需展示审核人/审核时间/审核备注）
          reviewer: { select: { id: true, realName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: { include: { items: true } },
        refunds: { orderBy: { createdAt: 'desc' } },
        reviewer: { select: { id: true, realName: true, username: true } },
      },
    });
    if (!payment) throw new NotFoundException('付款记录不存在');
    return payment;
  }

  approve(id: number, reviewerId: number, reviewNote?: string, operator?: OperatorContext) {
    return this.ordersService.approveOfflinePayment(id, reviewerId, reviewNote, operator);
  }

  reject(id: number, reviewerId: number, reviewNote?: string, operator?: OperatorContext) {
    return this.ordersService.rejectOfflinePayment(id, reviewerId, reviewNote, operator);
  }

  /** 后台手动登记收款（财务直接录入一笔已到账收款：定金/尾款/全款/补款） */
  createReceipt(
    data: {
      orderId: number;
      amount: number;
      method: string;
      type: 'DEPOSIT' | 'BALANCE' | 'FULL' | 'SUPPLEMENT';
      paidAt?: string | Date;
      gatewayTradeNo?: string;
      reviewNote?: string;
    },
    operator?: OperatorContext,
  ) {
    return this.ordersService.recordManualReceipt({ ...data, operator });
  }

  /**
   * 后台代客户发起在线支付（顾问转化模式）：生成扫码二维码，顾问发送客户扫码付款。
   * 创建 PENDING Payment 挂到订单；实收以网关回调核销为准（见 settleFromGateway）。
   * 应收金额 = finalAmount - 已收（支持补尾款场景的二次收款）。
   */
  async createChannelPayment(
    orderId: number,
    method: OnlinePayProvider,
    operator: OperatorContext,
  ) {
    if (!this.paymentGateway.isTransactionCreationEnabled()) {
      throw new ServiceUnavailableException(
        '在线资金交易当前已关闭，不能发起新的支付网关交易',
      );
    }
    if (!this.paymentGateway.isAvailable(method)) {
      throw new ServiceUnavailableException(
        method === 'alipay'
          ? '支付宝通道未配置（ALIPAY_APP_ID/ALIPAY_PRIVATE_KEY/ALIPAY_PUBLIC_KEY），请先由运维接入'
          : '微信支付通道未配置（WECHAT_* 五项），请先由运维接入',
      );
    }
    const siteBase = (this.configService.get<string>('SITE_BASE_URL') || '').replace(/\/+$/, '');
    if (!siteBase || siteBase.includes('localhost')) {
      // 回调地址必须是公网可达域名；localhost 下网关回调永远无法到达 → 订单永不推进。
      // 宁可诚实拒绝，不做"能扫码但收不到钱"的静默坏链。
      throw new BadRequestException('请先配置 SITE_BASE_URL 为正式域名，网关异步回调才能到达本服务');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: { where: { status: 'PAID' }, select: { amount: true } } },
    });
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException('当前订单状态不支持发起在线收款');
    }
    const paidCents = order.payments.reduce(
      (sum, p) => sum + Math.round(Number(p.amount) * 100),
      0,
    );
    const dueCents = Math.round(Number(order.finalAmount) * 100) - paidCents;
    if (dueCents <= 0) throw new BadRequestException('订单已收齐款项，无需再次收款');

    const payment = await this.prisma.payment.create({
      data: {
        paymentNo: this.createPaymentNo(),
        orderId,
        // Decimal 字段按分取整后回退到元（两位小数），避免浮点放大误差
        amount: Math.round(dueCents) / 100,
        method,
        type: paidCents === 0 ? 'FULL' : 'BALANCE',
        status: 'PENDING',
      },
    });

    const result = await this.paymentGateway.createPayment(method, {
      paymentNo: payment.paymentNo,
      amountYuan: (dueCents / 100).toFixed(2),
      subject: `海川珠宝订单 ${order.orderNo}`,
      notifyUrl: `${siteBase}/api/payments/notify/${method}`,
    });

    this.logger.log(
      `订单 #${orderId} 发起 ${method} 收款 ${payment.paymentNo}，金额 ${(dueCents / 100).toFixed(2)} 元（操作者 ${operator.type}:${operator.id ?? '-'}）`,
    );
    return {
      payment: { id: payment.id, paymentNo: payment.paymentNo, amount: payment.amount },
      provider: method,
      qrCode: result.qrCode,
      payUrl: result.payUrl,
    };
  }

  /**
   * 网关异步回调核销：验签 → 幂等 → 金额强校验（防篡改）→ 复用订单核销管线。
   * 返回给控制器的应答体：支付宝要纯文本 success/fail；微信要 JSON {code}。
   * 核销异常一律记录并以"成功"应答（防网关无限重试），问题留给人工在对账/日志中处理。
   */
  async settleFromGateway(
    provider: OnlinePayProvider,
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<{ ok: boolean }> {
    const verified = await this.paymentGateway.verifyNotification(provider, headers, rawBody);
    if (!verified.verified) {
      this.logger.warn(`${provider} 回调验签失败，已拒绝`);
      return { ok: false };
    }
    // 非支付成功事件（如退款通知）：确认收到即可
    if (!verified.paid || !verified.paymentNo) return { ok: true };

    const payment = await this.prisma.payment.findUnique({
      where: { paymentNo: verified.paymentNo },
    });
    if (!payment) {
      this.logger.error(`${provider} 回调商户单号 ${verified.paymentNo} 无对应 Payment，疑似环境不匹配`);
      return { ok: true };
    }
    // 幂等：重复回调直接确认
    if (payment.status === 'PAID') return { ok: true };

    // 金额强校验：回调金额与本地创建金额不一致 → 不核销，记录在案人工介入
    if (Number(verified.amountYuan || 0) !== Number(payment.amount)) {
      this.logger.error(
        `${provider} 回调金额不符：商户单 ${payment.paymentNo} 本地 ${payment.amount} 元 / 回调 ${verified.amountYuan} 元，已拒绝自动核销`,
      );
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { reviewNote: `金额不符告警：回调 ${verified.amountYuan} 元 ≠ 本地 ${payment.amount} 元，请人工对账` },
      }).catch(() => undefined);
      return { ok: true };
    }

    try {
      await this.ordersService.approveOfflinePayment(
        payment.id,
        null,
        `${provider} 网关自动核销`,
        { type: 'SYSTEM' as const },
        { tradeNo: verified.gatewayTradeNo || '', notify: (verified.raw ?? {}) as Prisma.InputJsonValue },
      );
      this.logger.log(`${provider} 回调核销成功：${payment.paymentNo}`);
    } catch (error) {
      // 常见为订单状态已变化（并发人工审核先行）：记录并以成功应答防重试风暴
      this.logger.error(
        `${provider} 回调核销异常（${payment.paymentNo}）：${error instanceof Error ? error.message : error}`,
      );
    }
    return { ok: true };
  }
}
