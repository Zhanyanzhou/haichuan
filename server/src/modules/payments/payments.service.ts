import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
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
import type { CustomerPrincipal, StaffPrincipal } from '../../common/security/authenticated-principal';
import {
  lockAuthorizedStaffForPayment,
  type StaffPaymentAuthorization,
} from '../../common/security/staff-payment-authorization';
import {
  CUSTOMER_GATEWAY_OPERATION_LEASE_MS,
  lockActiveCustomerForWrite,
  releaseCustomerGatewayOperation,
  reserveCustomerGatewayOperation,
  type CustomerGatewayOperationLease,
} from '../customers/customer-write-gate';
import { resolveInstallmentPaymentType } from './payment-plan-installment-type';

const ONLINE_PAYMENT_METHODS = ['wechat', 'alipay'] as const;
type StaffPaymentActor = StaffPrincipal | OperatorContext;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly paymentGateway: PaymentGatewayService,
    private readonly configService: ConfigService,
  ) {}

  private requireStaffActor(actor: StaffPaymentActor): Pick<StaffPrincipal, 'id'> {
    if (!Number.isInteger(actor.id) || Number(actor.id) <= 0) {
      throw new ForbiddenException('当前员工身份无效');
    }
    return { id: Number(actor.id) };
  }

  private withAuthorizedStaffActor<T>(
    actor: Pick<StaffPrincipal, 'id'>,
    authorization: StaffPaymentAuthorization,
    action: () => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await lockAuthorizedStaffForPayment(tx, actor, authorization);
      return action();
    });
  }

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

  private async assertActiveQuotedResourceReservations(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      quoteChannel: 'CUSTOM' | 'PARTNER_WAX';
      quotationVersionId: number | null;
    },
  ) {
    if (order.quotationVersionId === null) {
      throw new BadRequestException('订单缺少报价版本，不能发起在线收款');
    }

    // 与订单行锁同一事务内锁住资源预占，防止校验后、渠道预下单前被并发释放或核销。
    await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM order_resource_reservations WHERE order_id = ${order.id} FOR UPDATE`,
    );
    const [requirements, reservations] = await Promise.all([
      tx.quotationVersionResourceRequirement.findMany({
        where: { quotationVersionId: order.quotationVersionId },
        select: {
          id: true,
          resourceBucketId: true,
          requiredQuantity: true,
          resourceBucket: { select: { channel: true } },
        },
      }),
      tx.orderResourceReservation.findMany({
        where: { orderId: order.id },
        select: {
          orderId: true,
          quotationRequirementId: true,
          resourceBucketId: true,
          quantity: true,
          status: true,
        },
      }),
    ]);

    const reservationsByRequirement = new Map(
      reservations.map((reservation) => [
        reservation.quotationRequirementId,
        reservation,
      ]),
    );
    const reservationsMatch =
      requirements.length > 0 &&
      reservations.length === requirements.length &&
      requirements.every((requirement) => {
        const reservation = reservationsByRequirement.get(requirement.id);
        return Boolean(
          reservation &&
          reservation.orderId === order.id &&
          reservation.status === 'RESERVED' &&
          reservation.resourceBucketId === requirement.resourceBucketId &&
          requirement.resourceBucket.channel === order.quoteChannel &&
          new Prisma.Decimal(reservation.quantity).equals(
            requirement.requiredQuantity,
          ),
        );
      });
    if (!reservationsMatch) {
      throw new BadRequestException(
        '订单资源预占缺失或状态已变化，请刷新后重试',
      );
    }
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

  async findAll(
    params: { page?: number; pageSize?: number; status?: string; type?: string; method?: string; keyword?: string; startDate?: string; endDate?: string },
    actor: StaffPaymentActor,
  ) {
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
    const staffPrincipal = this.requireStaffActor(actor);
    return this.prisma.$transaction(async (tx) => {
      await lockAuthorizedStaffForPayment(tx, staffPrincipal, 'PAYMENT_QUERY');
      const [list, total] = await Promise.all([
        tx.payment.findMany({
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
        tx.payment.count({ where }),
      ]);
      return { list, total, page, pageSize };
    });
  }

  async findById(id: number, actor: StaffPaymentActor) {
    const staffPrincipal = this.requireStaffActor(actor);
    return this.prisma.$transaction(async (tx) => {
      await lockAuthorizedStaffForPayment(tx, staffPrincipal, 'PAYMENT_QUERY');
      const payment = await tx.payment.findUnique({
        where: { id },
        include: {
          order: { include: { items: true } },
          refunds: { orderBy: { createdAt: 'desc' } },
          reviewer: { select: { id: true, realName: true, username: true } },
        },
      });
      if (!payment) throw new NotFoundException('付款记录不存在');
      return payment;
    });
  }

  approve(id: number, reviewerId: number, reviewNote: string | undefined, actor: StaffPaymentActor) {
    const staffPrincipal = this.requireStaffActor(actor);
    return this.ordersService.confirmPaymentSettlement(
      id,
      reviewerId,
      reviewNote,
      undefined,
      undefined,
      { staffPrincipal, staffAuthorization: 'PAYMENT_ADMIN' },
    );
  }

  reject(id: number, reviewerId: number, reviewNote: string | undefined, actor: StaffPaymentActor) {
    return this.ordersService.rejectOfflinePayment(
      id,
      reviewerId,
      reviewNote,
      undefined,
      this.requireStaffActor(actor),
    );
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
    idempotencyKey: string,
    actor: StaffPaymentActor,
  ) {
    return this.ordersService.recordManualReceipt({
      ...data,
      idempotencyKey,
      staffPrincipal: this.requireStaffActor(actor),
    });
  }

  /**
   * 后台代客户发起在线支付（顾问转化模式）：生成扫码二维码，顾问发送客户扫码付款。
   * 创建 PENDING Payment 挂到订单；实收以网关回调核销为准（见 settleFromGateway）。
   * 应收金额 = finalAmount - 已收（支持补尾款场景的二次收款）。
   */
  async createChannelPayment(
    orderId: number,
    method: OnlinePayProvider,
    actor: StaffPaymentActor,
  ) {
    const staffPrincipal = this.requireStaffActor(actor);
    return this.createOnlinePayment(orderId, method, { type: 'ADMIN', id: staffPrincipal.id }, {
      scene: 'native',
      staffPrincipal,
    });
  }

  /** 客户本人从自己的订单发起微信支付；终端场景与 IP 只由服务端请求上下文决定。 */
  async createCustomerPayment(
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    orderId: number,
    context: {
      scene: WechatPayScene;
      clientIp?: string;
      h5Type?: 'Wap' | 'iOS' | 'Android';
    },
  ) {
    const customerId = principal.id;
    return this.createOnlinePayment(
      orderId,
      'wechat',
      { type: 'CUSTOMER', id: customerId },
      { ...context, customerId, customerPrincipal: principal },
    );
  }

  private async createOnlinePayment(
    orderId: number,
    method: OnlinePayProvider,
    operator: OperatorContext,
    context: {
      scene: WechatPayScene;
      customerId?: number;
      customerPrincipal?: Pick<CustomerPrincipal, 'id' | 'authVersion'>;
      staffPrincipal?: Pick<StaffPrincipal, 'id'>;
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
      const staffOperator = context.staffPrincipal
        ? await lockAuthorizedStaffForPayment(tx, context.staffPrincipal, 'PAYMENT_ADMIN')
        : undefined;
      const gatewayOperation = context.customerPrincipal
        ? await reserveCustomerGatewayOperation(
          tx,
          context.customerPrincipal,
          'CREATE_PAYMENT',
          orderId,
        )
        : undefined;
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
      let timeExpire: string | undefined;
      if (
        order.quoteChannel === 'CUSTOM' ||
        order.quoteChannel === 'PARTNER_WAX'
      ) {
        await this.assertActiveQuotedResourceReservations(tx, {
          id: order.id,
          quoteChannel: order.quoteChannel,
          quotationVersionId: order.quotationVersionId,
        });
        // 非零售资源没有库存 expiresAt；省略可选 timeExpire，使用渠道自身的技术支付窗口。
      } else {
        await tx.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM inventory_reservations WHERE order_id = ${orderId} AND consumed_at IS NULL AND released_at IS NULL ORDER BY expires_at ASC FOR UPDATE`,
        );
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
        timeExpire = reservation.expiresAt.toISOString();
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
        const installmentTypes = plan.installments.map((planInstallment) =>
          resolveInstallmentPaymentType({
            finalCents: this.moneyToCents(order.finalAmount),
            depositCents: this.moneyToCents(order.depositAmount),
            balanceCents: this.moneyToCents(order.balanceAmount),
            installmentCount: plan.installments.length,
            sequence: planInstallment.sequence,
            label: planInstallment.label,
            amountCents: this.moneyToCents(planInstallment.amount),
          }),
        );
        if (installmentTypes.some((type) => type === null)) {
          throw new BadRequestException('付款计划与订单冻结金额拆分不一致，不能发起在线收款');
        }
        const installmentType = installmentTypes[nextIndex]!;
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
            boundPayment.type !== installmentType ||
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
              type: installmentType,
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
      if (gatewayOperation) {
        await tx.customerGatewayOperation.update({
          where: { id: gatewayOperation.id },
          data: { paymentId: payment.id },
        });
      }
      return {
        order,
        payment,
        dueCents,
        timeExpire,
        reused,
        gatewayOperation,
        staffOperator,
      };
    });

    try {
      if (prepared.gatewayOperation) {
        // 准备事务提交到真正外调之间仍可能发生账户注销。再次以精确 token CAS
        // 续租；注销若已先线性化会级联删除 operation，此处失败且绝不触达渠道。
        await this.bindGatewayOperationPayment(
          prepared.gatewayOperation,
          prepared.payment.id,
        );
      }
      let result;
      try {
        const createPayment = () => this.paymentGateway.createPayment(method, {
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
        result = context.staffPrincipal
          ? await this.withAuthorizedStaffActor(
              context.staffPrincipal,
              'PAYMENT_ADMIN',
              createPayment,
            )
          : await createPayment();
        if (context.staffPrincipal) {
          await this.prisma.$transaction((tx) =>
            lockAuthorizedStaffForPayment(tx, context.staffPrincipal!, 'PAYMENT_ADMIN'),
          );
        }
      } catch (error) {
        // 预下单发生网络异常时无法证明渠道未受理。保留同一个 PENDING 商户单号，
        // 后续只能用原单号重试/查单/关单，避免生成第二个可支付单号导致重复付款。
        if (prepared.gatewayOperation) {
          await this.markCustomerGatewayResultUnknown(
            prepared.gatewayOperation,
            prepared.payment.id,
            '渠道预下单结果未确认；必须复用原商户单号查单、重试或关单',
          );
        } else {
          await this.prisma.payment.updateMany({
            where: { id: prepared.payment.id, status: 'PENDING' },
            data: {
              reviewNote: '渠道预下单结果未确认；必须复用原商户单号查单、重试或关单',
            },
          });
        }
        throw error;
      }

      const payUrl =
        result.scene === 'h5' && result.payUrl
          ? `${result.payUrl}${result.payUrl.includes('?') ? '&' : '?'}redirect_url=${encodeURIComponent(`${siteBase}/checkout?paymentReturn=1&orderId=${orderId}`)}`
          : result.payUrl;

      this.logger.log(
        `订单 #${orderId} 发起 ${method} 收款 ${prepared.payment.paymentNo}，金额 ${(prepared.dueCents / 100).toFixed(2)} 元（操作者 ${(prepared.staffOperator ?? operator).type}:${(prepared.staffOperator ?? operator).id ?? '-'}）`,
      );
      return {
        payment: {
          id: prepared.payment.id,
          paymentNo: prepared.payment.paymentNo,
          amount: prepared.payment.amount,
          type: prepared.payment.type,
        },
        provider: method,
        scene: result.scene,
        qrCode: result.qrCode,
        payUrl,
        reused: prepared.reused,
      };
    } finally {
      if (prepared.gatewayOperation) {
        await this.releaseGatewayOperation(prepared.gatewayOperation);
      }
    }
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
  private async setAttentionReviewNoteIfEmpty(
    paymentId: number,
    reviewNote: string,
    customerPrincipal?: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    staffPrincipal?: Pick<StaffPrincipal, 'id'>,
  ) {
    const update = (client: Pick<Prisma.TransactionClient, 'payment'>) =>
      client.payment.updateMany({
        where: {
          id: paymentId,
          OR: [{ reviewNote: null }, { reviewNote: '' }],
        },
        data: { reviewNote },
      });
    if (staffPrincipal) {
      await this.prisma.$transaction(async (tx) => {
        await lockAuthorizedStaffForPayment(tx, staffPrincipal, 'PAYMENT_QUERY');
        await update(tx);
      });
      return;
    }
    if (customerPrincipal) {
      await this.prisma.$transaction(async (tx) => {
        await lockActiveCustomerForWrite(tx, customerPrincipal);
        await update(tx);
      });
      return;
    }
    await update(this.prisma).catch(() => undefined);
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
    customerPrincipal?: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    staffPrincipal?: Pick<StaffPrincipal, 'id'>,
  ): Promise<'PAID' | 'ATTENTION' | 'MISSING'> {
    const readFacts = async (client: Pick<Prisma.TransactionClient, 'payment'>) => {
      const payment = await client.payment.findUnique({
        where: { paymentNo: fact.paymentNo },
      });
      return { payment };
    };
    const { payment } = staffPrincipal
      ? await this.prisma.$transaction(async (tx) => {
          await lockAuthorizedStaffForPayment(tx, staffPrincipal, 'PAYMENT_QUERY');
          return readFacts(tx);
        })
      : await readFacts(this.prisma);
    if (!payment) {
      this.logger.error(`${provider} ${source} 商户单号 ${fact.paymentNo} 无对应 Payment，疑似环境不匹配`);
      return 'MISSING';
    }
    if (payment.method !== provider) {
      this.logger.error(`${provider} ${source} 与本地付款方式 ${payment.method} 不一致：${payment.paymentNo}`);
      await this.setAttentionReviewNoteIfEmpty(
        payment.id,
        `渠道不符告警：${provider} 事实不能核销 ${payment.method} 付款`,
        customerPrincipal,
        staffPrincipal,
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
        customerPrincipal,
        staffPrincipal,
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
        customerPrincipal,
        staffPrincipal,
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
        customerPrincipal,
        staffPrincipal,
      );
      return "ATTENTION";
    }
    const readReusedGatewayTrade = (client: Pick<Prisma.TransactionClient, 'payment'>) =>
      client.payment.findFirst({
        where: {
          id: { not: payment.id },
          gatewayTradeNo: fact.gatewayTradeNo,
        },
        select: { id: true, paymentNo: true },
      });
    const reusedGatewayTrade = staffPrincipal
      ? await this.prisma.$transaction(async (tx) => {
          await lockAuthorizedStaffForPayment(tx, staffPrincipal, 'PAYMENT_QUERY');
          return readReusedGatewayTrade(tx);
        })
      : await readReusedGatewayTrade(this.prisma);
    if (reusedGatewayTrade) {
      this.logger.error(
        `${provider} ${source} 渠道交易号已绑定另一付款：${reusedGatewayTrade.paymentNo}`,
      );
      await this.setAttentionReviewNoteIfEmpty(
        payment.id,
        "渠道交易号已绑定另一付款，请人工对账",
        customerPrincipal,
        staffPrincipal,
      );
      return "ATTENTION";
    }
    if (['PAID', 'PARTIAL_REFUND', 'REFUNDED'].includes(payment.status)) {
      if (!payment.gatewayTradeNo) {
        await this.setAttentionReviewNoteIfEmpty(
          payment.id,
          "已付款记录缺少渠道交易号，请人工对账",
          customerPrincipal,
          staffPrincipal,
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
        {
          customerPrincipal,
          staffPrincipal,
          staffAuthorization: staffPrincipal ? 'PAYMENT_QUERY' : undefined,
        },
      );
      this.logger.log(`${provider} ${source} 核销成功：${payment.paymentNo}`);
      return 'PAID';
    } catch (error) {
      if (
        (customerPrincipal && error instanceof UnauthorizedException)
        || (staffPrincipal && error instanceof ForbiddenException)
      ) {
        throw error;
      }
      const current = staffPrincipal
        ? await this.prisma.$transaction(async (tx) => {
            await lockAuthorizedStaffForPayment(tx, staffPrincipal, 'PAYMENT_QUERY');
            return tx.payment.findUnique({
              where: { id: payment.id },
              select: { status: true, gatewayTradeNo: true },
            });
          })
        : await this.prisma.payment.findUnique({
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
          customerPrincipal,
          staffPrincipal,
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
    customerPrincipal?: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    staffPrincipal?: Pick<StaffPrincipal, 'id'>,
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
        customerPrincipal,
        staffPrincipal,
      );
      return state === 'PAID' ? 'PAID' as const : 'ATTENTION' as const;
    }
    if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(query.state)) {
      const failed = await this.ordersService.failPendingPaymentAttempt(
        payment.id,
        `微信支付状态：${query.state}`,
        { type: 'SYSTEM' },
        {
          expectedMethod: 'wechat',
          customerPrincipal,
          staffPrincipal,
          staffAuthorization: staffPrincipal ? 'PAYMENT_QUERY' : undefined,
        },
      );
      return this.customerPaymentState(failed?.status ?? 'FAILED');
    }
    if (query.state === 'NOTPAY' || query.state === 'USERPAYING') {
      return 'PENDING' as const;
    }
    return 'ATTENTION' as const;
  }

  /** 客户查自己的订单付款；成功事实会复用与异步回调相同的核销管线。 */
  async queryCustomerPayment(
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    orderId: number,
  ) {
    const gatewayOperation = await this.prisma.$transaction((tx) =>
      reserveCustomerGatewayOperation(tx, principal, 'QUERY_PAYMENT', orderId),
    );
    try {
      const { order, payment } = await this.getCustomerOnlinePayment(principal.id, orderId);
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
      await this.bindGatewayOperationPayment(gatewayOperation, payment.id);
      const query = await this.paymentGateway.queryPayment('wechat', payment.paymentNo);
      // 外调期间可能发生改密、换绑、注销或 lease 过期；任何本地结算写入前
      // 必须再次复核当前身份和 operation，旧会话只能交给回调/系统查单收敛。
      await this.bindGatewayOperationPayment(gatewayOperation, payment.id);
      const state = await this.applyCustomerQuery(payment, query, principal);
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
    } finally {
      await this.releaseGatewayOperation(gatewayOperation);
    }
  }

  /** 关单前必须先查单；正在支付或已成功时绝不直接关闭。 */
  async closeCustomerPayment(
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    orderId: number,
  ) {
    const customerId = principal.id;
    const gatewayOperation = await this.prisma.$transaction((tx) =>
      reserveCustomerGatewayOperation(tx, principal, 'CLOSE_PAYMENT', orderId),
    );
    try {
      const { order, payment } = await this.getCustomerOnlinePayment(customerId, orderId);
      if (!payment) return { orderId: order.id, state: 'NONE' as const };
      const localState = this.customerPaymentState(payment.status);
      if (localState !== 'PENDING') return { orderId: order.id, state: localState };
      if (payment.method !== 'wechat') {
        throw new BadRequestException('当前支付渠道不支持客户关单');
      }
      await this.bindGatewayOperationPayment(gatewayOperation, payment.id);
      const query = await this.paymentGateway.queryPayment('wechat', payment.paymentNo);
      await this.bindGatewayOperationPayment(gatewayOperation, payment.id);
      const reconciled = await this.applyCustomerQuery(payment, query, principal);
      if (reconciled === 'PAID') return { orderId: order.id, state: 'PAID' as const };
      if (query.state === 'USERPAYING') {
        throw new BadRequestException('微信正在处理该笔支付，请稍后查单，不要重复支付');
      }
      if (query.state === 'NOTPAY') {
        try {
          await this.paymentGateway.closePayment('wechat', payment.paymentNo);
        } catch (error) {
          // 渠道可能已受理关单但响应丢失；本地继续保持 PENDING，交给系统查单确认真实终态。
          await this.markCustomerGatewayResultUnknown(
            gatewayOperation,
            payment.id,
            '渠道关单结果未确认；必须主动查单后再决定本地终态',
            'wechat',
          );
          throw error;
        }
        await this.bindGatewayOperationPayment(gatewayOperation, payment.id);
        const failed = await this.ordersService.failPendingPaymentAttempt(
          payment.id,
          '客户在有效会话中发起关单，渠道确认关单成功',
          { type: 'SYSTEM' },
          { expectedMethod: 'wechat', customerPrincipal: principal },
        );
        return {
          orderId: order.id,
          state: this.customerPaymentState(failed?.status ?? 'FAILED'),
        };
      }
      if (reconciled === 'FAILED') return { orderId: order.id, state: 'FAILED' as const };
      throw new BadRequestException('当前渠道状态需要对账，暂不能关闭支付');
    } finally {
      await this.releaseGatewayOperation(gatewayOperation);
    }
  }

  private async releaseGatewayOperation(lease: CustomerGatewayOperationLease) {
    try {
      await releaseCustomerGatewayOperation(this.prisma, lease);
    } catch (error) {
      this.logger.warn(
        `客户 #${lease.customerId} 的支付操作 lease 释放失败，将等待自动过期：${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async bindGatewayOperationPayment(
    lease: CustomerGatewayOperationLease,
    paymentId: number,
  ) {
    await this.prisma.$transaction((tx) =>
      this.bindGatewayOperationPaymentInTransaction(tx, lease, paymentId),
    );
  }

  private async bindGatewayOperationPaymentInTransaction(
    tx: Prisma.TransactionClient,
    lease: CustomerGatewayOperationLease,
    paymentId: number,
  ) {
    await lockActiveCustomerForWrite(tx, {
      id: lease.customerId,
      authVersion: lease.authVersion,
    });
    const now = new Date();
    const bound = await tx.customerGatewayOperation.updateMany({
      where: {
        id: lease.id,
        customerId: lease.customerId,
        authVersion: lease.authVersion,
        expiresAt: { gt: now },
      },
      data: {
        paymentId,
        expiresAt: new Date(now.getTime() + CUSTOMER_GATEWAY_OPERATION_LEASE_MS),
      },
    });
    if (bound.count !== 1) {
      throw new ConflictException('支付操作凭据已过期，请刷新后重试');
    }
  }

  private async markCustomerGatewayResultUnknown(
    lease: CustomerGatewayOperationLease,
    paymentId: number,
    reviewNote: string,
    expectedMethod?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.bindGatewayOperationPaymentInTransaction(tx, lease, paymentId);
      await tx.payment.updateMany({
        where: {
          id: paymentId,
          status: 'PENDING',
          ...(expectedMethod ? { method: expectedMethod } : {}),
        },
        data: { reviewNote },
      });
    });
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
  async queryChannelPayment(paymentId: number, actor?: StaffPaymentActor) {
    const staffPrincipal = actor ? this.requireStaffActor(actor) : undefined;
    const payment = staffPrincipal
      ? await this.prisma.$transaction(async (tx) => {
          await lockAuthorizedStaffForPayment(tx, staffPrincipal, 'PAYMENT_QUERY');
          return tx.payment.findUnique({
            where: { id: paymentId },
            select: { id: true, paymentNo: true, method: true, status: true },
          });
        })
      : await this.prisma.payment.findUnique({
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
    const queryPayment = () => this.paymentGateway.queryPayment('wechat', payment.paymentNo);
    const query = staffPrincipal
      ? await this.withAuthorizedStaffActor(staffPrincipal, 'PAYMENT_QUERY', queryPayment)
      : await queryPayment();
    const state = await this.applyCustomerQuery(
      payment,
      query,
      undefined,
      staffPrincipal,
    );
    this.logger.log(
      `付款 #${paymentId} 人工查单 ${payment.paymentNo}：渠道 ${query.state} / 本地 ${state}（操作者 ${actor ? 'ADMIN' : 'SYSTEM'}:${actor?.id ?? '-'}）`,
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
