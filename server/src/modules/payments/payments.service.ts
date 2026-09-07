import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import {
  PaymentGatewayService,
  type OnlinePayProvider,
  type QueryPayResult,
} from '../../common/payment-gateway/payment-gateway.service';
import type { WechatPayScene } from '../../common/payment-gateway/wechat-pay.client';
import type { OperatorContext } from '../trade-events/trade-events.constants';
import { businessDateKey } from '../../common/time/business-date';

const ONLINE_PAYMENT_METHODS = ['wechat', 'alipay'] as const;

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
    const date = businessDateKey();
    return `PAY${date}${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }

  private moneyToCents(value: Prisma.Decimal | number | string) {
    const amount = Number(value);
    const cents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || !Number.isSafeInteger(cents)) {
      throw new BadRequestException('支付金额无效');
    }
    return cents;
  }

  /** 在线支付通道可用性（后台收款按钮按此渲染可选项） */
  availableChannels() {
    return this.paymentGateway.availableChannels();
  }

  /** R2 首发只向客户开放微信；支付宝仍保留后台适配器并在第二批接入客户旅程。 */
  availableCustomerChannels() {
    return this.paymentGateway
      .availableChannels()
      .filter((channel) => channel.provider === 'wechat');
  }

  async findAll(params: { page?: number; pageSize?: number; status?: string; type?: string; method?: string; keyword?: string; startDate?: string; endDate?: string }) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Prisma.PaymentWhereInput = {};
    if (params.status && params.status !== 'all') where.status = params.status as PaymentStatus;
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
      const start = params.startDate ? new Date(params.startDate) : null;
      const end = params.endDate ? new Date(params.endDate) : null;
      if (
        (start && Number.isNaN(start.getTime())) ||
        (end && Number.isNaN(end.getTime()))
      ) {
        throw new BadRequestException('付款时间范围无效');
      }
      if (start && end && start.getTime() > end.getTime()) {
        throw new BadRequestException('付款开始时间不能晚于结束时间');
      }
      where.paidAt = {};
      if (start) where.paidAt.gte = start;
      if (end) {
        const exclusiveEnd = new Date(end);
        exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
        where.paidAt.lt = exclusiveEnd;
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
    return this.ordersService.confirmPaymentSettlement(id, reviewerId, reviewNote, operator);
  }

  reject(id: number, reviewerId: number, reviewNote?: string, operator?: OperatorContext) {
    return this.ordersService.rejectOfflinePayment(id, reviewerId, reviewNote, operator);
  }

  /** 异常线下实收登记；在线渠道到账只由 settleFromGateway 核销。 */
  createReceipt(
    data: {
      orderId: number;
      amount: number;
      method: 'bank_transfer' | 'store';
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
    return this.createOnlinePayment(orderId, method, operator, {
      scene: 'native',
    });
  }

  /** 客户本人从自己的订单发起微信支付；终端场景与 IP 只由服务端请求上下文决定。 */
  async createCustomerPayment(
    customerId: number,
    orderId: number,
    context: {
      scene: WechatPayScene;
      clientIp?: string;
      h5Type?: 'Wap' | 'iOS' | 'Android';
    },
  ) {
    return this.createOnlinePayment(
      orderId,
      'wechat',
      { type: 'CUSTOMER', id: customerId },
      { ...context, customerId },
    );
  }

  private async createOnlinePayment(
    orderId: number,
    method: OnlinePayProvider,
    operator: OperatorContext,
    context: {
      scene: WechatPayScene;
      customerId?: number;
      clientIp?: string;
      h5Type?: 'Wap' | 'iOS' | 'Android';
    },
  ) {
    if (!this.paymentGateway.isTransactionCreationEnabled()) {
      throw new ServiceUnavailableException(
        '在线资金交易当前已关闭，不能发起新的支付网关交易',
      );
    }
    if (method === 'alipay') {
      throw new ServiceUnavailableException(
        '支付宝主动查单与确定关单尚未接入，为避免超时交易永久悬挂，当前暂停新建支付宝支付',
      );
    }
    if (!this.paymentGateway.isAvailable(method)) {
      throw new ServiceUnavailableException(
        '微信支付通道未配置（AppID、商户号、商户证书序列号、平台证书、商户私钥、APIv3 Key），请先由运维接入',
      );
    }
    if (
      context.scene === 'h5' &&
      (!context.clientIp ||
        context.clientIp === '127.0.0.1' ||
        context.clientIp === '::1')
    ) {
      throw new BadRequestException('微信 H5 支付无法识别真实客户 IP，请检查反向代理配置');
    }
    const siteBase = (this.configService.get<string>('SITE_BASE_URL') || '').replace(/\/+$/, '');
    if (!siteBase || siteBase.includes('localhost')) {
      // 回调地址必须是公网可达域名；localhost 下网关回调永远无法到达 → 订单永不推进。
      // 宁可诚实拒绝，不做"能扫码但收不到钱"的静默坏链。
      throw new BadRequestException('请先配置 SITE_BASE_URL 为正式域名，网关异步回调才能到达本服务');
    }

    const prepared = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`,
      );
      if (locked.length === 0) throw new NotFoundException('订单不存在');

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { paymentPlans: { select: { id: true } } },
      });
      if (!order) throw new NotFoundException('订单不存在');
      if (
        context.customerId !== undefined &&
        order.customerId !== context.customerId
      ) {
        throw new NotFoundException('订单不存在或无权操作');
      }
      if (order.status !== 'PENDING_PAYMENT') {
        throw new BadRequestException('当前订单状态不支持发起在线收款');
      }
      const isPlanOrder =
        order.quotationVersionId != null || (order.paymentPlans?.length ?? 0) > 0;
      if (isPlanOrder) {
        await tx.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM payment_plans WHERE order_id = ${orderId} FOR UPDATE`,
        );
      }
      let payment;
      let dueCents: number;
      let reused = false;

      if (isPlanOrder) {
        const plans = await tx.paymentPlan.findMany({
          where: { orderId },
          include: {
            installments: {
              orderBy: { sequence: 'asc' },
              include: { payment: true },
            },
          },
        });
        if (plans.length !== 1 || plans[0].status !== 'ACTIVE') {
          throw new BadRequestException('订单缺少唯一的生效付款计划，不能发起在线收款');
        }
        const plan = plans[0];
        const installmentTotalCents = plan.installments.reduce(
          (sum, installment) => sum + this.moneyToCents(installment.amount),
          0,
        );
        if (
          plan.currency !== order.currency ||
          this.moneyToCents(plan.totalAmount) !== this.moneyToCents(order.finalAmount) ||
          installmentTotalCents !== this.moneyToCents(plan.totalAmount) ||
          plan.installments.some((installment) => installment.status === 'WAIVED') ||
          (order.quotationVersionId != null &&
            plan.quotationVersionId !== order.quotationVersionId)
        ) {
          throw new BadRequestException('付款计划金额或币种与订单不一致，不能发起在线收款');
        }
        const nextIndex = plan.installments.findIndex(
          (installment) => installment.status === 'PENDING',
        );
        if (nextIndex < 0) {
          throw new BadRequestException('付款计划没有可支付的下一期');
        }
        if (
          plan.installments
            .slice(0, nextIndex)
            .some((installment) => installment.status !== 'PAID')
        ) {
          throw new BadRequestException('付款计划前序分期尚未完成，不能跳期支付');
        }
        const installment = plan.installments[nextIndex];
        dueCents = this.moneyToCents(installment.amount);
        if (dueCents <= 0) {
          throw new BadRequestException('下一期付款金额无效');
        }
        const pendingPayments = await tx.payment.findMany({
          where: { orderId, status: 'PENDING' },
          take: 2,
        });
        if (installment.paymentId !== null) {
          const boundPayment = installment.payment;
          if (
            !boundPayment ||
            boundPayment.status !== 'PENDING' ||
            boundPayment.orderId !== orderId ||
            boundPayment.method !== method ||
            this.moneyToCents(boundPayment.amount) !== dueCents ||
            pendingPayments.length !== 1 ||
            pendingPayments[0].id !== boundPayment.id
          ) {
            throw new BadRequestException('下一期已绑定不一致的付款记录，请先完成对账');
          }
          payment = boundPayment;
          reused = true;
        } else {
          if (pendingPayments.length > 0) {
            throw new BadRequestException(
              `订单已有待处理付款 ${pendingPayments[0].paymentNo}，但未正确绑定下一期，请先完成对账`,
            );
          }
          payment = await tx.payment.create({
            data: {
              paymentNo: this.createPaymentNo(),
              orderId,
              amount: installment.amount,
              method,
              type:
                plan.installments.length === 1
                  ? 'FULL'
                  : installment.sequence === 1
                    ? 'DEPOSIT'
                    : 'BALANCE',
              status: 'PENDING',
            },
          });
          const bound = await tx.paymentPlanInstallment.updateMany({
            where: {
              id: installment.id,
              paymentPlanId: plan.id,
              status: 'PENDING',
              paymentId: null,
            },
            data: { paymentId: payment.id },
          });
          if (bound.count !== 1) {
            throw new BadRequestException('下一期付款状态已变化，请刷新后重试');
          }
        }
      } else {
        const pendingPayment = await tx.payment.findFirst({
          where: { orderId, status: 'PENDING' },
        });
        const confirmedPayments = await tx.payment.findMany({
          where: {
            orderId,
            status: { in: ['PAID', 'PARTIAL_REFUND', 'REFUNDED'] },
          },
          select: { amount: true },
        });
        const paidCents = confirmedPayments.reduce(
          (sum, confirmed) => sum + this.moneyToCents(confirmed.amount),
          0,
        );
        dueCents = this.moneyToCents(order.finalAmount) - paidCents;
        if (dueCents <= 0) {
          throw new BadRequestException('订单已收齐款项，无需再次收款');
        }
        if (pendingPayment && pendingPayment.method !== method) {
          throw new BadRequestException(
            `订单已有 ${pendingPayment.method} 待支付交易 ${pendingPayment.paymentNo}，请先查询或关闭该交易`,
          );
        }
        if (pendingPayment && this.moneyToCents(pendingPayment.amount) !== dueCents) {
          throw new BadRequestException(
            `待支付交易 ${pendingPayment.paymentNo} 的金额与当前应收不一致，请先关闭并对账`,
          );
        }
        payment = pendingPayment ?? (await tx.payment.create({
          data: {
            paymentNo: this.createPaymentNo(),
            orderId,
            amount: new Prisma.Decimal(dueCents).div(100),
            method,
            type: paidCents === 0 ? 'FULL' : 'BALANCE',
            status: 'PENDING',
          },
        }));
        reused = Boolean(pendingPayment);
      }
      await tx.order.update({
        where: { id: orderId },
        data: { paymentMethod: method },
      });
      const reservation = await tx.inventoryReservation.findFirst({
        where: {
          orderId,
          consumedAt: null,
          releasedAt: null,
        },
        orderBy: { expiresAt: 'asc' },
        select: { expiresAt: true },
      });
      if (!reservation || reservation.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('订单库存保留已到期，请重新下单');
      }
      return {
        order,
        payment,
        dueCents,
        timeExpire: reservation.expiresAt.toISOString(),
        reused,
      };
    });

    let result;
    try {
      result = await this.paymentGateway.createPayment(method, {
        paymentNo: prepared.payment.paymentNo,
        amountYuan: (prepared.dueCents / 100).toFixed(2),
        subject: `海川珠宝订单 ${prepared.order.orderNo}`,
        notifyUrl: `${siteBase}/api/payments/notify/${method}`,
        scene: context.scene,
        clientIp: context.clientIp,
        h5Type: context.h5Type,
        appName: '海川珠宝',
        appUrl: siteBase,
        timeExpire: prepared.timeExpire,
      });
    } catch (error) {
      // 预下单发生网络异常时无法证明渠道未受理。保留同一个 PENDING 商户单号，
      // 后续只能用原单号重试/查单/关单，避免生成第二个可支付单号导致重复付款。
      await this.prisma.payment.updateMany({
        where: { id: prepared.payment.id, status: 'PENDING' },
        data: {
          reviewNote: '渠道预下单结果未确认；必须复用原商户单号查单、重试或关单',
        },
      });
      throw error;
    }

    const payUrl =
      result.scene === 'h5' && result.payUrl
        ? `${result.payUrl}${result.payUrl.includes('?') ? '&' : '?'}redirect_url=${encodeURIComponent(`${siteBase}/checkout?paymentReturn=1&orderId=${orderId}`)}`
        : result.payUrl;

    this.logger.log(
      `订单 #${orderId} 发起 ${method} 收款 ${prepared.payment.paymentNo}，金额 ${(prepared.dueCents / 100).toFixed(2)} 元（操作者 ${operator.type}:${operator.id ?? '-'}）`,
    );
    return {
      payment: {
        id: prepared.payment.id,
        paymentNo: prepared.payment.paymentNo,
        amount: prepared.payment.amount,
      },
      provider: method,
      scene: result.scene,
      qrCode: result.qrCode,
      payUrl,
      reused: prepared.reused,
    };
  }

  private customerPaymentState(status: string) {
    if (['PAID', 'PARTIAL_REFUND', 'REFUNDED'].includes(status)) return 'PAID' as const;
    if (status === 'FAILED') return 'FAILED' as const;
    return 'PENDING' as const;
  }

  private async getCustomerOnlinePayment(customerId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, orderNo: true, status: true },
    });
    if (!order) throw new NotFoundException('订单不存在或无权操作');
    // 结构化白名单：不取 gatewayNotify/reviewNote/proofUrl 等内部字段，
    // 防止未来调用点直接透传导致渠道原始数据或私有存储键外泄
    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId,
        method: { in: ['wechat', 'alipay'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, paymentNo: true, method: true, status: true, amount: true },
    });
    return { order, payment };
  }

  /** 仅填充空备注，保留预下单不确定等更早形成的对账事实。 */
  private async setAttentionReviewNoteIfEmpty(paymentId: number, reviewNote: string) {
    await this.prisma.payment.updateMany({
      where: {
        id: paymentId,
        OR: [{ reviewNote: null }, { reviewNote: '' }],
      },
      data: { reviewNote },
    }).catch(() => undefined);
  }

  private async settleVerifiedPayment(
    provider: OnlinePayProvider,
    fact: {
      paymentNo: string;
      gatewayTradeNo?: string;
      amountYuan?: string;
      raw?: unknown;
    },
    source: 'callback' | 'query',
  ): Promise<'PAID' | 'ATTENTION' | 'MISSING'> {
    const payment = await this.prisma.payment.findUnique({
      where: { paymentNo: fact.paymentNo },
    });
    if (!payment) {
      this.logger.error(`${provider} ${source} 商户单号 ${fact.paymentNo} 无对应 Payment，疑似环境不匹配`);
      return 'MISSING';
    }
    if (payment.method !== provider) {
      this.logger.error(`${provider} ${source} 与本地付款方式 ${payment.method} 不一致：${payment.paymentNo}`);
      await this.setAttentionReviewNoteIfEmpty(
        payment.id,
        `渠道不符告警：${provider} 事实不能核销 ${payment.method} 付款`,
      );
      return 'ATTENTION';
    }
    if (
      !fact.amountYuan ||
      this.moneyToCents(fact.amountYuan) !== this.moneyToCents(payment.amount)
    ) {
      this.logger.error(
        `${provider} ${source} 金额不符：商户单 ${payment.paymentNo} 本地 ${payment.amount} 元 / 渠道 ${fact.amountYuan ?? '缺失'} 元，已拒绝自动核销`,
      );
      await this.setAttentionReviewNoteIfEmpty(
        payment.id,
        `金额不符告警：渠道 ${fact.amountYuan ?? '缺失'} 元 ≠ 本地 ${payment.amount} 元，请人工对账`,
      );
      return 'ATTENTION';
    }
    if (!fact.gatewayTradeNo) {
      this.logger.error(
        `${provider} ${source} 已返回支付成功但缺少渠道交易号：${payment.paymentNo}`,
      );
      await this.setAttentionReviewNoteIfEmpty(
        payment.id,
        '渠道已返回支付成功但缺少渠道交易号，请人工对账',
      );
      return 'ATTENTION';
    }
    if (
      payment.gatewayTradeNo &&
      payment.gatewayTradeNo !== fact.gatewayTradeNo
    ) {
      this.logger.error(
        `${provider} ${source} 渠道交易号与既存付款事实不一致：${payment.paymentNo}`,
      );
      await this.setAttentionReviewNoteIfEmpty(
        payment.id,
        "渠道交易号与既存付款事实不一致，请人工对账",
      );
      return "ATTENTION";
    }
    const reusedGatewayTrade = await this.prisma.payment.findFirst({
      where: {
        id: { not: payment.id },
        gatewayTradeNo: fact.gatewayTradeNo,
      },
      select: { id: true, paymentNo: true },
    });
    if (reusedGatewayTrade) {
      this.logger.error(
        `${provider} ${source} 渠道交易号已绑定另一付款：${reusedGatewayTrade.paymentNo}`,
      );
      await this.setAttentionReviewNoteIfEmpty(
        payment.id,
        "渠道交易号已绑定另一付款，请人工对账",
      );
      return "ATTENTION";
    }
    if (['PAID', 'PARTIAL_REFUND', 'REFUNDED'].includes(payment.status)) {
      if (!payment.gatewayTradeNo) {
        await this.setAttentionReviewNoteIfEmpty(
          payment.id,
          "已付款记录缺少渠道交易号，请人工对账",
        );
        return "ATTENTION";
      }
      return 'PAID';
    }

    try {
      await this.ordersService.confirmPaymentSettlement(
        payment.id,
        null,
        `${provider} 网关${source === 'callback' ? '回调' : '主动查单'}自动核销`,
        { type: 'SYSTEM' as const },
        {
          tradeNo: fact.gatewayTradeNo,
          notify: (fact.raw ?? {}) as Prisma.InputJsonValue,
        },
      );
      this.logger.log(`${provider} ${source} 核销成功：${payment.paymentNo}`);
      return 'PAID';
    } catch (error) {
      const current = await this.prisma.payment.findUnique({
        where: { id: payment.id },
        select: { status: true, gatewayTradeNo: true },
      });
      if (
        current &&
        ['PAID', 'PARTIAL_REFUND', 'REFUNDED'].includes(current.status) &&
        current.gatewayTradeNo === fact.gatewayTradeNo
      ) {
        return 'PAID';
      }
      if (
        current &&
        ['PAID', 'PARTIAL_REFUND', 'REFUNDED'].includes(current.status)
      ) {
        await this.setAttentionReviewNoteIfEmpty(
          payment.id,
          '并发核销后的渠道交易号与本次渠道事实不一致，请人工对账',
        );
      }
      this.logger.error(
        `${provider} ${source} 核销异常（${payment.paymentNo}）：${error instanceof Error ? error.message : error}`,
      );
      return 'ATTENTION';
    }
  }

  private async applyCustomerQuery(
    payment: { id: number; paymentNo: string; method: string; status: string },
    query: QueryPayResult,
  ) {
    if (query.state === 'SUCCESS') {
      const state = await this.settleVerifiedPayment(
        'wechat',
        {
          paymentNo: payment.paymentNo,
          gatewayTradeNo: query.gatewayTradeNo,
          amountYuan: query.amountYuan,
          raw: query.raw,
        },
        'query',
      );
      return state === 'PAID' ? 'PAID' as const : 'ATTENTION' as const;
    }
    if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(query.state)) {
      const failed = await this.ordersService.failPendingPaymentAttempt(
        payment.id,
        `微信支付状态：${query.state}`,
        { type: 'SYSTEM' },
        { expectedMethod: 'wechat' },
      );
      return this.customerPaymentState(failed?.status ?? 'FAILED');
    }
    if (query.state === 'NOTPAY' || query.state === 'USERPAYING') {
      return 'PENDING' as const;
    }
    return 'ATTENTION' as const;
  }

  /** 客户查自己的订单付款；成功事实会复用与异步回调相同的核销管线。 */
  async queryCustomerPayment(customerId: number, orderId: number) {
    const { order, payment } = await this.getCustomerOnlinePayment(customerId, orderId);
    if (!payment) return { orderId: order.id, state: 'NONE' as const };
    const localState = this.customerPaymentState(payment.status);
    if (localState !== 'PENDING') {
      return {
        orderId: order.id,
        state: localState,
        payment: {
          id: payment.id,
          paymentNo: payment.paymentNo,
          amount: payment.amount,
        },
      };
    }
    if (payment.method !== 'wechat') {
      return { orderId: order.id, state: 'ATTENTION' as const };
    }
    const query = await this.paymentGateway.queryPayment('wechat', payment.paymentNo);
    const state = await this.applyCustomerQuery(payment, query);
    return {
      orderId: order.id,
      state,
      gatewayState: query.state,
      payment: {
        id: payment.id,
        paymentNo: payment.paymentNo,
        amount: payment.amount,
      },
    };
  }

  /** 关单前必须先查单；正在支付或已成功时绝不直接关闭。 */
  async closeCustomerPayment(customerId: number, orderId: number) {
    const { order, payment } = await this.getCustomerOnlinePayment(customerId, orderId);
    if (!payment) return { orderId: order.id, state: 'NONE' as const };
    const localState = this.customerPaymentState(payment.status);
    if (localState !== 'PENDING') return { orderId: order.id, state: localState };
    if (payment.method !== 'wechat') {
      throw new BadRequestException('当前支付渠道不支持客户关单');
    }
    const query = await this.paymentGateway.queryPayment('wechat', payment.paymentNo);
    const reconciled = await this.applyCustomerQuery(payment, query);
    if (reconciled === 'PAID') return { orderId: order.id, state: 'PAID' as const };
    if (query.state === 'USERPAYING') {
      throw new BadRequestException('微信正在处理该笔支付，请稍后查单，不要重复支付');
    }
    if (query.state === 'NOTPAY') {
      await this.paymentGateway.closePayment('wechat', payment.paymentNo);
      const failed = await this.ordersService.failPendingPaymentAttempt(
        payment.id,
        '客户结束本次微信支付，渠道关单成功',
        { type: 'CUSTOMER', id: customerId },
        { expectedMethod: 'wechat' },
      );
      return {
        orderId: order.id,
        state: this.customerPaymentState(failed?.status ?? 'FAILED'),
      };
    }
    if (reconciled === 'FAILED') return { orderId: order.id, state: 'FAILED' as const };
    throw new BadRequestException('当前渠道状态需要对账，暂不能关闭支付');
  }

  /**
   * 掉单兜底：回调延迟或丢失时，定期主动查单核销长时间 PENDING 的在线交易。
   * 与异步回调、客户主动查单共用同一核销管线（settleVerifiedPayment），
   * 金额校验与幂等边界完全一致；单笔失败只告警不中断整批。
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePendingOnlinePayments() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 5 * 60 * 1000);
    const pendingPayments = await this.prisma.payment.findMany({
      where: {
        status: 'PENDING',
        method: { in: [...ONLINE_PAYMENT_METHODS] },
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        paymentNo: true,
        method: true,
        status: true,
        order: {
          select: {
            reservations: {
              where: { consumedAt: null, releasedAt: null },
              orderBy: { expiresAt: 'asc' },
              take: 1,
              select: { expiresAt: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    let reconciled = 0;
    for (const payment of pendingPayments) {
      // 支付宝主动查单尚未接入；其掉单依赖回调重试与人工对账
      if (payment.method !== 'wechat') continue;
      try {
        const query = await this.paymentGateway.queryPayment('wechat', payment.paymentNo);
        let state;
        const reservationExpiresAt = payment.order?.reservations?.[0]?.expiresAt;
        if (
          query.state === 'NOTPAY' &&
          reservationExpiresAt &&
          reservationExpiresAt.getTime() <= now.getTime()
        ) {
          await this.paymentGateway.closePayment('wechat', payment.paymentNo);
          const failed = await this.ordersService.failPendingPaymentAttempt(
            payment.id,
            '库存保留到期且渠道确认未支付，系统关单成功',
            { type: 'SYSTEM' },
            { expectedMethod: 'wechat' },
          );
          state = this.customerPaymentState(failed?.status ?? 'FAILED');
        } else {
          state = await this.applyCustomerQuery(payment, query);
        }
        if (state !== 'PENDING') reconciled += 1;
      } catch (error) {
        this.logger.warn(
          `掉单兜底查单失败 ${payment.paymentNo}：${error instanceof Error ? error.message : error}`,
        );
      }
    }
    if (pendingPayments.length > 0) {
      this.logger.log(
        `掉单兜底：检查 ${pendingPayments.length} 笔超时待支付在线交易，${reconciled} 笔进入终态`,
      );
    }
  }

  /**
   * 后台主动查询渠道状态并按同一管线核销（客服处理掉单与对账的工具入口）。
   * FAILED 状态也允许查询：预下单结果不确定被标 FAILED 的在线交易，
   * 渠道 SUCCESS 事实可以经 confirmPaymentSettlement 恢复核销。
   */
  async queryChannelPayment(paymentId: number, operator?: OperatorContext) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, paymentNo: true, method: true, status: true },
    });
    if (!payment) throw new NotFoundException('付款记录不存在');
    if (!(ONLINE_PAYMENT_METHODS as readonly string[]).includes(payment.method)) {
      throw new BadRequestException('线下付款没有渠道状态可查询');
    }
    if (payment.method !== 'wechat') {
      throw new BadRequestException('支付宝主动查单尚未接入，请以回调与人工对账为准');
    }
    if (!['PENDING', 'FAILED'].includes(payment.status)) {
      return { paymentId, state: this.customerPaymentState(payment.status), gatewayState: null };
    }
    const query = await this.paymentGateway.queryPayment('wechat', payment.paymentNo);
    const state = await this.applyCustomerQuery(payment, query);
    this.logger.log(
      `付款 #${paymentId} 人工查单 ${payment.paymentNo}：渠道 ${query.state} / 本地 ${state}（操作者 ${operator?.type ?? 'ADMIN'}:${operator?.id ?? '-'}）`,
    );
    return { paymentId, state, gatewayState: query.state };
  }

  /**
   * 网关异步回调核销：验签 → 幂等 → 金额强校验（防篡改）→ 复用订单核销管线。
   * 返回给控制器的应答体：支付宝要纯文本 success/fail；微信要 JSON {code}。
   * 只有本地核销已完成或命中已支付幂等状态才确认通知；其余结果返回失败，
   * 让渠道继续重试，避免数据库瞬时异常把真实到账永久留在待支付状态。
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

    const settlement = await this.settleVerifiedPayment(
      provider,
      {
        paymentNo: verified.paymentNo,
        gatewayTradeNo: verified.gatewayTradeNo,
        amountYuan: verified.amountYuan,
        raw: verified.raw,
      },
      'callback',
    );
    return { ok: settlement === 'PAID' };
  }
}
