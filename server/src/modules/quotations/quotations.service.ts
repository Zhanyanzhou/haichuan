import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, QuotationStatus, Role, type QuoteChannel, type WaxType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { businessDateKey } from '../../common/time/business-date';
import { runWithDocumentNumberRetry } from '../../common/trade/document-number-retry';
import { OrdersService } from '../orders/orders.service';
import type { IssueQuotationDto } from './dto/quotation-commerce.dto';
import {
  DEFAULT_WAX_RATES,
  computeFinalQuoteAmounts,
  hashBusinessSnapshot,
  resolveWaxRate,
  roundMoney,
  roundWeight,
  snapshotFeeSortKey,
  snapshotItemSortKey,
  snapshotResourceSortKey,
  sortSnapshotRows,
} from './quotation-snapshot';
import { UploadService } from '../upload/upload.service';

export interface QuotationActor {
  id: number;
  role: Role;
}

/**
 * 报价管理服务：员工维护草稿、提交待确认和取消，客户本人接受不可变版本并转单。
 * 旧后台直接确认与转单入口保持失败关闭；客户链路使用身份归属、版本快照与付款计划校验。
 * 报价单号、金额计算及其余状态转换仍分别使用唯一约束、整数分和事务锁。
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

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly uploadService?: UploadService,
  ) {}

  private designMediaAuthority() {
    if (!this.uploadService) throw new Error('UploadService is not configured');
    return this.uploadService;
  }

  /** 仅为不可达的旧分步转单实现保留类型锚点；正式服务由 QuotationTransactionService 注入订单服务。 */
  private get orders(): OrdersService {
    throw new ServiceUnavailableException('旧分步转单服务已关闭');
  }

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

  private assertUniqueSkuIds(
    items: Array<{ skuId?: number | null }>,
    message = '报价单不能包含重复的商品规格',
  ) {
    const seen = new Set<number>();
    for (const item of items) {
      if (item.skuId == null) continue;
      if (seen.has(item.skuId)) throw new BadRequestException(message);
      seen.add(item.skuId);
    }
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
    params: { page?: number; pageSize?: number; status?: string; keyword?: string; salesConsultantId?: number; channel?: QuoteChannel },
    actor: QuotationActor,
  ) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Prisma.QuotationWhereInput = {};
    if (params.status && params.status !== 'all') where.status = params.status as QuotationStatus;
    if (params.channel) where.channel = params.channel;
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
        versions: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            channel: true,
            status: true,
            snapshotSchemaVersion: true,
            currency: true,
            subtotalAmount: true,
            discountAmount: true,
            feeAmount: true,
            totalAmount: true,
            validUntil: true,
            issuedAt: true,
            acceptedAt: true,
            items: true,
            feeLines: true,
            resourceRequirements: {
              include: { resourceBucket: true },
            },
            designFileVersion: {
              select: {
                id: true,
                designFileId: true,
                version: true,
                status: true,
                targetGoldWeight: true,
                redWaxWeight: true,
                purpleWaxWeight: true,
                checksumSha256: true,
                confirmedAt: true,
              },
            },
          },
        },
      },
    });
    if (!quotation) throw new NotFoundException('报价单不存在');
    return {
      ...quotation,
      currentVersionRecord:
        quotation.versions.find((version) => version.version === quotation.currentVersion) ?? null,
    };
  }

  async searchIssueCustomers(params: { keyword?: string; pageSize?: number }) {
    const keyword = params.keyword?.trim();
    const list = await this.prisma.customer.findMany({
      where: {
        status: 'ACTIVE',
        ...(keyword
          ? { OR: [
              { name: { contains: keyword } },
              { phone: { contains: keyword } },
              { email: { contains: keyword } },
            ] }
          : {}),
      },
      take: Math.min(Math.max(params.pageSize ?? 20, 1), 50),
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        accountType: true,
        partnerStatus: true,
        status: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { list };
  }

  async getIssueOptions(id: number, actor: QuotationActor) {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, ...this.accessScope(actor) },
      select: { id: true, channel: true, customerId: true },
    });
    if (!quotation) throw new NotFoundException('报价单不存在');
    const now = new Date();
    const [feeRuleCandidates, resourceBuckets, designFiles] = await Promise.all([
      this.prisma.quotationFeeRule.findMany({
        where: {
          channel: quotation.channel,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
        select: {
          id: true,
          code: true,
          version: true,
          channel: true,
          waxType: true,
          calculationMethod: true,
          unitAmount: true,
          currency: true,
          enabled: true,
          displayText: true,
        },
        orderBy: [{ code: 'asc' }, { version: 'desc' }],
      }),
      quotation.channel === 'RETAIL'
        ? Promise.resolve([])
        : this.prisma.tradeResourceBucket.findMany({
            where: {
              channel: quotation.channel,
              isActive: true,
              OR: [{ bucketStart: null }, { bucketStart: { lte: now } }],
              AND: [{ OR: [{ bucketEnd: null }, { bucketEnd: { gt: now } }] }],
            },
            select: {
              id: true,
              channel: true,
              kind: true,
              code: true,
              bucketKey: true,
              displayName: true,
              unit: true,
              availableQuantity: true,
              reservedQuantity: true,
              version: true,
              bucketStart: true,
              bucketEnd: true,
            },
            orderBy: [{ kind: 'asc' }, { code: 'asc' }, { bucketKey: 'asc' }],
          }),
      quotation.channel === 'PARTNER_WAX' && quotation.customerId
        ? this.prisma.cooperationDesignFile.findMany({
            where: { customerId: quotation.customerId },
            select: {
              id: true,
              referenceNo: true,
              currentVersion: true,
              versions: {
                where: { status: 'CONFIRMED' },
                select: {
                  id: true,
                  designFileId: true,
                  version: true,
                  status: true,
                  redWaxWeight: true,
                  purpleWaxWeight: true,
                  confirmedAt: true,
                },
                orderBy: { version: 'desc' },
              },
            },
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);
    const seenFeeCodes = new Set<string>();
    const feeRules = feeRuleCandidates
      .filter((rule) => {
        if (seenFeeCodes.has(rule.code)) return false;
        seenFeeCodes.add(rule.code);
        return rule.enabled;
      })
      .map(({ enabled: _enabled, ...rule }) => rule);
    return { feeRules, resourceBuckets, designFiles };
  }

  async create(data: {
    channel?: 'RETAIL' | 'CUSTOM' | 'PARTNER_WAX';
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
    this.assertUniqueSkuIds(data.items);
    if (!data.customerName?.trim() || !data.customerPhone?.trim()) {
      throw new BadRequestException('请提供客户姓名和手机号');
    }
    let customerName = data.customerName.trim();
    let customerPhone = data.customerPhone.trim();
    let customerEmail = data.customerEmail?.trim() || null;
    if (data.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: data.customerId },
        select: { id: true, name: true, phone: true, email: true, status: true },
      });
      if (!customer || customer.status !== 'ACTIVE') {
        throw new BadRequestException('关联客户不存在或已停用');
      }
      customerName = customer.name?.trim() || customerName;
      customerPhone = customer.phone;
      customerEmail = customer.email?.trim() || null;
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
            customerName,
            customerPhone,
            customerEmail,
            salesConsultantId: salesConsultantId ?? null,
            status: 'DRAFT',
            channel: data.channel ?? 'CUSTOM',
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
    channel?: 'RETAIL' | 'CUSTOM' | 'PARTNER_WAX';
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    salesConsultantId?: number;
    remark?: string;
    depositAmount?: number;
    validUntil?: Date;
    items?: Array<{ skuId?: number; productId?: number; productName: string; productImage?: string; spec?: string; quantity: number; unitPrice: number; quotedPrice: number }>;
  }, actor: QuotationActor) {
    if (data.items) this.assertUniqueSkuIds(data.items);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM quotations WHERE id = ${id} FOR UPDATE`,
      );
      if (locked.length === 0) throw new NotFoundException('报价单不存在');
      const quotation = await tx.quotation.findFirst({
        where: { id, ...this.accessScope(actor) },
      });
      if (!quotation) throw new NotFoundException('报价单不存在');
      if (quotation.status !== 'DRAFT') {
        throw new ConflictException('只有草稿状态的报价单可以编辑');
      }
      if (
        quotation.customerId &&
        (data.customerName !== undefined ||
          data.customerPhone !== undefined ||
          data.customerEmail !== undefined)
      ) {
        throw new BadRequestException('已绑定客户的姓名、手机号和邮箱必须来自客户档案');
      }

      const updateData: Prisma.QuotationUncheckedUpdateInput = {};
      if (data.channel !== undefined) updateData.channel = data.channel;
      if (data.customerName !== undefined) updateData.customerName = data.customerName.trim();
      if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone.trim();
      if (data.customerEmail !== undefined) updateData.customerEmail = data.customerEmail.trim() || null;
      if (this.isAdministrator(actor) && data.salesConsultantId !== undefined) {
        const consultant = await tx.user.findUnique({
          where: { id: data.salesConsultantId },
          select: { id: true, role: true, status: true },
        });
        if (!consultant || consultant.role !== 'SALES_CONSULTANT' || consultant.status !== 'ACTIVE') {
          throw new BadRequestException('销售顾问不存在、已停用或角色不正确');
        }
        updateData.salesConsultantId = consultant.id;
      }
      if (data.remark !== undefined) updateData.remark = data.remark?.trim() || null;
      if (data.depositAmount !== undefined) {
        updateData.depositAmount = new Prisma.Decimal(
          Math.round(Number(data.depositAmount) * 100),
        ).div(100);
      }
      if (data.validUntil !== undefined) updateData.validUntil = data.validUntil || null;
      if (data.items) {
        const amounts = this.computeAmounts(data.items);
        updateData.totalAmount = amounts.totalAmount;
        updateData.discountAmount = amounts.discountAmount;
        updateData.finalAmount = amounts.finalAmount;
      }

      return tx.quotation.update({
        where: { id, status: 'DRAFT', ...this.accessScope(actor) },
        data: {
          ...updateData,
          ...(data.items
            ? { items: { deleteMany: {}, create: this.buildItemData(data.items) } }
            : {}),
        },
        include: { items: true },
      });
    });
  }

  /** 推进报价单状态（乐观锁） */
  async changeStatus(id: number, newStatus: QuotationStatus, actor: QuotationActor) {
    if (newStatus === 'CONFIRMED') {
      throw new ForbiddenException(
        '后台员工不能代替客户确认报价；请由客户本人通过报价确认入口操作',
      );
    }
    if (newStatus === 'PENDING_CONFIRM') {
      return this.issueVersion(id, {}, actor);
    }
    if (newStatus === 'CANCELLED') {
      return this.cancelQuotation(id, actor);
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

  issue(id: number, dto: IssueQuotationDto, actor: QuotationActor) {
    return this.issueVersion(id, dto, actor);
  }

  async revise(id: number, actor: QuotationActor) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM quotations WHERE id = ${id} FOR UPDATE`);
      const quotation = await tx.quotation.findFirst({
        where: { id, ...this.accessScope(actor) },
      });
      if (!quotation) throw new NotFoundException('报价单不存在');
      if (quotation.status !== 'PENDING_CONFIRM') {
        throw new ConflictException('只有待客户确认的报价可以创建修订版');
      }
      const version = await tx.quotationVersion.findUnique({
        where: { quotationId_version: { quotationId: id, version: quotation.currentVersion } },
        include: { paymentPlans: { include: { installments: true } }, conversion: true },
      });
      const plan = version?.paymentPlans[0];
      if (
        !version ||
        version.status !== 'ISSUED' ||
        version.conversion != null ||
        version.paymentPlans.length !== 1 ||
        !plan ||
        plan.status !== 'DRAFT' ||
        plan.orderId != null ||
        plan.installments.some((installment) =>
          installment.paymentId != null || !['PENDING', 'DUE'].includes(installment.status),
        )
      ) {
        throw new ConflictException('当前报价版本不可修订');
      }
      const superseded = await tx.quotationVersion.updateMany({
        where: { id: version.id, status: 'ISSUED', acceptedByCustomerId: null },
        data: { status: 'SUPERSEDED' },
      });
      if (superseded.count !== 1) throw new ConflictException('报价版本状态已变化，请刷新后重试');
      const planIds = version.paymentPlans.map((plan) => plan.id);
      if (planIds.length) {
        await tx.paymentPlanInstallment.updateMany({
          where: { paymentPlanId: { in: planIds }, paymentId: null, status: { in: ['PENDING', 'DUE'] } },
          data: { status: 'CANCELLED' },
        });
      }
      await tx.paymentPlan.updateMany({
        where: { quotationVersionId: version.id, status: 'DRAFT', orderId: null },
        data: { status: 'CANCELLED' },
      });
      const reopened = await tx.quotation.updateMany({
        where: { id, status: 'PENDING_CONFIRM', currentVersion: quotation.currentVersion },
        data: { status: 'DRAFT' },
      });
      if (reopened.count !== 1) throw new ConflictException('报价状态已变化，请刷新后重试');
      return tx.quotation.findUniqueOrThrow({ where: { id }, include: { items: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async cancelQuotation(id: number, actor: QuotationActor) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM quotations WHERE id = ${id} FOR UPDATE`,
      );
      if (locked.length === 0) throw new NotFoundException('报价单不存在');
      const quotation = await tx.quotation.findFirst({
        where: { id, ...this.accessScope(actor) },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            include: {
              paymentPlans: {
                include: { installments: { orderBy: { sequence: 'asc' } } },
              },
            },
          },
        },
      });
      if (!quotation) throw new NotFoundException('报价单不存在');
      if (quotation.status === 'CANCELLED') {
        return tx.quotation.findFirst({
          where: { id, ...this.accessScope(actor) },
        });
      }
      const allowed = QuotationsService.VALID_TRANSITIONS[quotation.status];
      if (!allowed?.includes('CANCELLED')) {
        throw new BadRequestException(
          `报价单状态不能从 ${quotation.status} 变更为 CANCELLED`,
        );
      }

      if (quotation.status === 'CONFIRMED') {
        const version = quotation.versions[0];
        if (
          !version ||
          version.version !== quotation.currentVersion ||
          version.status !== 'ACCEPTED' ||
          version.paymentPlans.length !== 1 ||
          version.paymentPlans[0].status !== 'ACTIVE'
        ) {
          throw new ConflictException('已确认报价的版本或付款计划状态不一致，不能取消');
        }
        const plan = version.paymentPlans[0];
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM payment_plans WHERE id = ${plan.id} FOR UPDATE`,
        );
        if (
          quotation.convertedOrderId != null ||
          plan.orderId != null ||
          plan.installments.some(
            (installment) =>
              installment.paymentId != null ||
              !['PENDING', 'DUE'].includes(installment.status),
          )
        ) {
          throw new ConflictException(
            '报价已产生付款、转单或不可逆分期事实，不能取消',
          );
        }
        const cancelledInstallments = await tx.paymentPlanInstallment.updateMany({
          where: {
            paymentPlanId: plan.id,
            paymentId: null,
            status: { in: ['PENDING', 'DUE'] },
          },
          data: { status: 'CANCELLED' },
        });
        if (cancelledInstallments.count !== plan.installments.length) {
          throw new ConflictException('付款计划分期状态已变化，请刷新后重试');
        }
        const cancelledPlan = await tx.paymentPlan.updateMany({
          where: { id: plan.id, status: 'ACTIVE', orderId: null },
          data: { status: 'CANCELLED' },
        });
        if (cancelledPlan.count !== 1) {
          throw new ConflictException('付款计划状态已变化，请刷新后重试');
        }
        const cancelledVersion = await tx.quotationVersion.updateMany({
          where: { id: version.id, status: 'ACCEPTED' },
          data: { status: 'CANCELLED' },
        });
        if (cancelledVersion.count !== 1) {
          throw new ConflictException('报价版本状态已变化，请刷新后重试');
        }
      }
      if (quotation.status === 'PENDING_CONFIRM') {
        const version = quotation.versions[0];
        const plan = version?.paymentPlans[0];
        if (
          !version ||
          version.version !== quotation.currentVersion ||
          version.status !== 'ISSUED' ||
          version.paymentPlans.length !== 1 ||
          !plan ||
          plan.status !== 'DRAFT' ||
          plan.orderId != null ||
          quotation.convertedOrderId != null ||
          plan.installments.some((installment) =>
            installment.paymentId != null || !['PENDING', 'DUE'].includes(installment.status),
          )
        ) {
          throw new ConflictException('待确认报价已有支付、转单或版本不一致，不能取消');
        }
        await tx.paymentPlanInstallment.updateMany({
          where: { paymentPlanId: plan.id, paymentId: null, status: { in: ['PENDING', 'DUE'] } },
          data: { status: 'CANCELLED' },
        });
        const cancelledPlan = await tx.paymentPlan.updateMany({
          where: { id: plan.id, status: 'DRAFT', orderId: null },
          data: { status: 'CANCELLED' },
        });
        const cancelledVersion = await tx.quotationVersion.updateMany({
          where: { id: version.id, status: 'ISSUED', acceptedByCustomerId: null },
          data: { status: 'CANCELLED' },
        });
        if (cancelledPlan.count !== 1 || cancelledVersion.count !== 1) {
          throw new ConflictException('报价版本或付款计划状态已变化，请刷新后重试');
        }
      }

      const updated = await tx.quotation.updateMany({
        where: { id, status: quotation.status, ...this.accessScope(actor) },
        data: { status: 'CANCELLED' },
      });
      if (updated.count === 0) {
        throw new ConflictException('报价单状态已变化，请刷新后重试');
      }
      return tx.quotation.findFirst({
        where: { id, ...this.accessScope(actor) },
      });
    });
  }

  private async issueVersion(id: number, dto: IssueQuotationDto, actor: QuotationActor) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM quotations WHERE id = ${id} FOR UPDATE`,
      );
      if (locked.length === 0) throw new NotFoundException('报价单不存在');
      const quotation = await tx.quotation.findFirst({
        where: { id, ...this.accessScope(actor) },
        include: {
          items: true,
          customer: {
            select: {
              id: true,
              status: true,
              accountType: true,
              partnerStatus: true,
            },
          },
        },
      });
      if (!quotation) throw new NotFoundException('报价单不存在');
      if (quotation.status !== 'DRAFT') {
        throw new ConflictException('只有草稿报价可以提交新版本');
      }
      this.assertUniqueSkuIds(quotation.items);
      if (!quotation.customerId || !quotation.customer || quotation.customer.status !== 'ACTIVE') {
        throw new BadRequestException('提交报价前必须绑定有效客户身份');
      }
      if (quotation.validUntil && quotation.validUntil.getTime() <= Date.now()) {
        throw new BadRequestException('报价有效期已过，请先更新有效期');
      }
      const version = quotation.currentVersion + 1;
      const customerSnapshot = {
        version: 2,
        legacy: false,
        customerId: quotation.customerId,
        customerName: quotation.customerName,
        customerPhone: quotation.customerPhone,
        customerEmail: quotation.customerEmail,
        salesConsultantId: quotation.salesConsultantId,
        depositAmount: quotation.depositAmount.toString(),
      };
      const now = new Date();
      const channel = quotation.channel;
      let designFileVersionId: number | null = null;
      let partnerPriceAgreementId: number | null = null;
      let pricing: Prisma.JsonObject = { method: channel === 'RETAIL' ? 'SKU_FIXED' : 'QUOTED' };
      let internalDesign: Prisma.JsonObject | null = null;
      let waxWeight: Prisma.Decimal | null = null;
      let versionItems: Array<{
        productId: number | null;
        skuId: number | null;
        waxType: WaxType | null;
        description: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        subtotal: Prisma.Decimal;
        pricingSnapshot: Prisma.JsonObject;
      }>;

      if (channel === 'RETAIL') {
        if (dto.designFileVersionId || dto.waxType || dto.resourceRequirements?.length) {
          throw new BadRequestException('零售报价不能绑定 3D 文件、蜡种或定制资源');
        }
        const skuIds = quotation.items.map((item) => item.skuId).filter((value): value is number => value != null);
        if (skuIds.length !== quotation.items.length || new Set(skuIds).size !== skuIds.length) {
          throw new BadRequestException('零售报价每一行必须绑定唯一 SKU');
        }
        const skus = await tx.productSKU.findMany({
          where: { id: { in: skuIds }, isActive: true },
          select: {
            id: true,
            productId: true,
            price: true,
            skuCode: true,
            product: { select: { name: true, code: true, status: true, salesMode: true } },
          },
        });
        if (skus.length !== skuIds.length) throw new BadRequestException('零售报价包含无效 SKU');
        const skuById = new Map(skus.map((sku) => [sku.id, sku]));
        versionItems = quotation.items.map((item) => {
          const sku = skuById.get(item.skuId!);
          if (!sku || sku.productId !== item.productId || sku.product.status !== 'PUBLISHED' || sku.product.salesMode !== 'DIRECT_PURCHASE') {
            throw new BadRequestException('零售报价只能使用当前可直接购买的商品规格');
          }
          const unitPrice = roundMoney(sku.price);
          const subtotal = roundMoney(unitPrice.mul(item.quantity));
          return {
            productId: sku.productId,
            skuId: sku.id,
            waxType: null,
            description: [sku.product.name, item.spec].filter(Boolean).join(' / '),
            quantity: item.quantity,
            unitPrice,
            subtotal,
            pricingSnapshot: {
              version: 2,
              method: 'SKU_FIXED',
              productName: sku.product.name,
              productCode: sku.product.code,
              productImage: item.productImage,
              skuCode: sku.skuCode,
              spec: item.spec,
            },
          };
        });
      } else if (channel === 'PARTNER_WAX') {
        if (quotation.customer.accountType !== 'PARTNER' || quotation.customer.partnerStatus !== 'APPROVED') {
          throw new ForbiddenException('合作蜡模报价只允许发送给有效合作商家');
        }
        if (!dto.designFileVersionId || !dto.waxType) {
          throw new BadRequestException('合作蜡模报价必须选择客户已确认的 3D 文件版本和蜡种');
        }
        if (quotation.items.length !== 1) {
          throw new BadRequestException('合作蜡模报价必须且只能包含一个文件计价行');
        }
        const design = await tx.cooperationDesignFileVersion.findFirst({
          where: {
            id: dto.designFileVersionId,
            status: 'CONFIRMED',
            confirmedByCustomerId: quotation.customerId,
            designFile: { customerId: quotation.customerId },
          },
          include: {
            designFile: { select: { referenceNo: true, currentVersion: true } },
            mediaAsset: {
              select: {
                id: true,
                storageKey: true,
                originalName: true,
                mimeType: true,
                byteSize: true,
                checksumSha256: true,
                accessLevel: true,
                status: true,
              },
            },
          },
        });
        if (!design || design.version !== design.designFile.currentVersion) {
          throw new ConflictException('只能使用客户本人确认的当前 3D 文件版本');
        }
        const verifiedDesignMedia = await this.designMediaAuthority().readVerifiedDesignFile(
          design.mediaAsset,
          design.checksumSha256,
        );
        waxWeight = dto.waxType === 'RED' ? design.redWaxWeight : design.purpleWaxWeight;
        if (!waxWeight || waxWeight.lte(0)) throw new BadRequestException('所选蜡种缺少已确认蜡重');
        waxWeight = roundWeight(waxWeight);
        const agreements = await tx.partnerPriceAgreement.findMany({
          where: {
            customerId: quotation.customerId!,
            effectiveFrom: { lte: now },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
          },
          orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
          take: 2,
        });
        if (agreements.length > 1) {
          throw new ConflictException('合作客户存在重叠生效的双蜡价，请先修复价格协议');
        }
        const agreement = agreements[0] ?? null;
        const effectiveRate = resolveWaxRate(dto.waxType, agreement);
        const rate = effectiveRate.rate;
        const unitPrice = roundMoney(waxWeight.mul(rate));
        const item = quotation.items[0];
        designFileVersionId = design.id;
        partnerPriceAgreementId = effectiveRate.agreementId;
        pricing = {
          method: 'WAX_WEIGHT_RATE',
          waxType: dto.waxType,
          confirmedWaxWeight: waxWeight.toFixed(3),
          rate: roundMoney(rate).toFixed(2),
          rateSource: effectiveRate.source,
          agreementId: agreement?.id ?? null,
          agreementVersion: agreement?.version ?? null,
          agreementEffectiveFrom: agreement?.effectiveFrom.toISOString() ?? null,
          agreementEffectiveUntil: agreement?.effectiveUntil?.toISOString() ?? null,
        };
        internalDesign = {
          designFileVersionId: design.id,
          designFileVersion: design.version,
          referenceNo: design.designFile.referenceNo,
          mediaAssetId: design.mediaAsset.id,
          originalName: verifiedDesignMedia.originalName,
          byteSize: verifiedDesignMedia.byteSize,
          mimeType: verifiedDesignMedia.mimeType,
          checksumSha256: verifiedDesignMedia.checksumSha256,
          targetGoldWeight: design.targetGoldWeight?.toFixed(3) ?? null,
        };
        versionItems = [{
          productId: item.productId,
          skuId: null,
          waxType: dto.waxType,
          description: item.productName,
          quantity: 1,
          unitPrice,
          subtotal: unitPrice,
          pricingSnapshot: {
            version: 2,
            productName: item.productName,
            productImage: item.productImage,
            ...pricing,
          },
        }];
      } else {
        if (dto.designFileVersionId || dto.waxType) {
          throw new BadRequestException('高级定制报价不能使用合作蜡模文件计价字段');
        }
        versionItems = quotation.items.map((item) => ({
          productId: item.productId,
          skuId: item.skuId,
          waxType: null,
          description: [item.productName, item.spec].filter(Boolean).join(' / '),
          quantity: item.quantity,
          unitPrice: roundMoney(item.quotedPrice),
          subtotal: roundMoney(item.quotedPrice.mul(item.quantity)),
          pricingSnapshot: {
            version: 2,
            method: 'QUOTED',
            productName: item.productName,
            productImage: item.productImage,
            spec: item.spec,
          },
        }));
      }

      const requestedResources = dto.resourceRequirements ?? [];
      if (channel !== 'RETAIL') {
        const resourceIds = requestedResources.map((item) => item.resourceBucketId);
        if (resourceIds.length !== new Set(resourceIds).size) throw new BadRequestException('报价资源桶不能重复');
        const buckets = await tx.tradeResourceBucket.findMany({ where: { id: { in: resourceIds }, isActive: true } });
        if (buckets.length !== resourceIds.length) throw new BadRequestException('报价包含无效资源桶');
        if (buckets.some((bucket) => bucket.channel !== channel)) throw new BadRequestException('资源桶与报价通道不匹配');
        if (buckets.some((bucket) =>
          (bucket.bucketStart && bucket.bucketStart > now) ||
          (bucket.bucketEnd && bucket.bucketEnd <= now),
        )) throw new BadRequestException('报价包含当前未生效的资源桶');
        const kinds = new Set(buckets.map((bucket) => bucket.kind));
        if (!kinds.has('CAPACITY') || !kinds.has('MATERIAL')) {
          throw new BadRequestException('定制与合作蜡模报价必须同时配置产能和材料门禁');
        }
      }

      const requestedFeeIds = dto.feeRuleIds ?? [];
      if (requestedFeeIds.length !== new Set(requestedFeeIds).size) throw new BadRequestException('费用规则不能重复');
      const feeRules = await tx.quotationFeeRule.findMany({
        where: {
          id: { in: requestedFeeIds },
          channel,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
      });
      if (feeRules.length !== requestedFeeIds.length) throw new BadRequestException('报价包含无效或未生效的费用规则');
      if (new Set(feeRules.map((rule) => rule.code)).size !== feeRules.length) {
        throw new BadRequestException('同一报价不能选择同代码的多个费用版本');
      }
      const currentFeeVersions = feeRules.length === 0
        ? []
        : await tx.quotationFeeRule.findMany({
            where: {
              channel,
              code: { in: feeRules.map((rule) => rule.code) },
              effectiveFrom: { lte: now },
              OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
            },
            orderBy: [{ code: 'asc' }, { version: 'desc' }],
          });
      const currentFeeByCode = new Map<string, (typeof currentFeeVersions)[number]>();
      for (const rule of currentFeeVersions) {
        if (!currentFeeByCode.has(rule.code)) currentFeeByCode.set(rule.code, rule);
      }
      if (feeRules.some((rule) => !rule.enabled || currentFeeByCode.get(rule.code)?.id !== rule.id)) {
        throw new BadRequestException('报价费用规则已被新版替代或停用');
      }
      if (feeRules.some((rule) => rule.waxType != null && rule.waxType !== dto.waxType)) {
        throw new BadRequestException('费用规则与所选蜡种不匹配');
      }
      const feeLines = feeRules.map((rule) => {
        const basisQuantity = rule.calculationMethod === 'PER_GRAM' ? waxWeight : null;
        if (rule.calculationMethod === 'PER_GRAM' && !basisQuantity) {
          throw new BadRequestException('按克费用只能用于具有确认蜡重的报价');
        }
        const amount = roundMoney(
          rule.calculationMethod === 'PER_GRAM'
            ? rule.unitAmount.mul(basisQuantity!)
            : rule.unitAmount,
        );
        return {
          feeRuleId: rule.id,
          code: rule.code,
          displayText: rule.displayText,
          calculationMethod: rule.calculationMethod,
          rate: roundMoney(rule.unitAmount),
          basisQuantity,
          amount,
          currency: rule.currency,
        };
      });
      const { subtotalAmount, discountAmount, feeAmount, totalAmount } =
        computeFinalQuoteAmounts(
          versionItems.map((item) => item.subtotal),
          feeLines.map((item) => item.amount),
        );
      if (totalAmount.lte(0)) throw new BadRequestException('提交报价前必须设置正数成交总额');
      const buckets = channel === 'RETAIL' ? [] : await tx.tradeResourceBucket.findMany({
        where: { id: { in: requestedResources.map((item) => item.resourceBucketId) } },
      });
      const bucketById = new Map(buckets.map((bucket) => [bucket.id, bucket]));
      const businessSnapshot: Prisma.JsonObject = {
        schemaVersion: 2,
        quotationId: quotation.id,
        quoteNo: quotation.quoteNo,
        version,
        channel,
        currency: 'CNY',
        validUntil: quotation.validUntil?.toISOString() ?? null,
        customer: customerSnapshot,
        pricing,
        internalDesign,
        items: sortSnapshotRows(versionItems.map((item) => ({
          productId: item.productId,
          skuId: item.skuId,
          waxType: item.waxType,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          subtotal: item.subtotal.toFixed(2),
          pricingSnapshot: item.pricingSnapshot,
        })), snapshotItemSortKey),
        fees: sortSnapshotRows(feeLines.map((line) => ({
          feeRuleId: line.feeRuleId,
          code: line.code,
          displayText: line.displayText,
          calculationMethod: line.calculationMethod,
          rate: line.rate.toFixed(2),
          basisQuantity: line.basisQuantity?.toFixed(3) ?? null,
          amount: line.amount.toFixed(2),
        })), snapshotFeeSortKey),
        resources: sortSnapshotRows(requestedResources.map((requirement) => {
          const bucket = bucketById.get(requirement.resourceBucketId)!;
          return {
            resourceBucketId: bucket.id,
            channel: bucket.channel,
            kind: bucket.kind,
            code: bucket.code,
            bucketKey: bucket.bucketKey,
            displayName: bucket.displayName,
            unit: bucket.unit,
            requiredQuantity: roundWeight(requirement.requiredQuantity).toFixed(3),
          };
        }), snapshotResourceSortKey),
        amounts: {
          subtotalAmount: subtotalAmount.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          feeAmount: feeAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
        },
      };
      const contentHash = hashBusinessSnapshot(businessSnapshot);
      const quotationVersion = await tx.quotationVersion.create({
        data: {
          quotationId: quotation.id,
          version,
          channel: quotation.channel,
          status: 'ISSUED',
          currency: 'CNY',
          subtotalAmount,
          discountAmount,
          feeAmount,
          totalAmount,
          validUntil: quotation.validUntil,
          contentHash,
          customerSnapshot,
          snapshotSchemaVersion: 2,
          businessSnapshot,
          designFileVersionId,
          partnerPriceAgreementId,
          createdBy: actor.id,
          issuedAt: new Date(),
          items: {
            create: versionItems,
          },
          feeLines: { create: feeLines },
          resourceRequirements: {
            create: requestedResources.map((requirement) => {
              const bucket = bucketById.get(requirement.resourceBucketId)!;
              return {
                resourceBucketId: requirement.resourceBucketId,
                requiredQuantity: roundWeight(requirement.requiredQuantity),
                resourceSnapshot: {
                  version: 1,
                  channel: bucket.channel,
                  kind: bucket.kind,
                  code: bucket.code,
                  bucketKey: bucket.bucketKey,
                  displayName: bucket.displayName,
                  unit: bucket.unit,
                },
              };
            }),
          },
        },
        include: { items: true, feeLines: true, resourceRequirements: true },
      });
      const finalCents = Math.round(Number(totalAmount) * 100);
      const depositCents = Math.round(Number(quotation.depositAmount) * 100);
      if (finalCents <= 0) {
        throw new BadRequestException('提交报价前必须设置正数成交总额');
      }
      if (depositCents < 0 || depositCents > finalCents) {
        throw new BadRequestException('定金金额不能超过报价总额');
      }
      const installments = depositCents > 0
        ? [
            { sequence: 1, label: '定金', amount: new Prisma.Decimal(depositCents).div(100) },
            { sequence: 2, label: '尾款', amount: new Prisma.Decimal(finalCents - depositCents).div(100) },
          ].filter((item) => Number(item.amount) > 0)
        : [{ sequence: 1, label: '全款', amount: totalAmount }];
      await tx.paymentPlan.create({
        data: {
          quotationVersionId: quotationVersion.id,
          currency: 'CNY',
          totalAmount,
          status: 'DRAFT',
          installments: { create: installments },
        },
      });
      const updated = await tx.quotation.updateMany({
        where: { id, status: 'DRAFT', currentVersion: quotation.currentVersion },
        data: {
          status: 'PENDING_CONFIRM',
          currentVersion: version,
          totalAmount: subtotalAmount,
          discountAmount,
          finalAmount: totalAmount,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException('报价单状态已变化，请刷新后重试');
      }
      return quotationVersion;
    });
  }

  async findForCustomer(customerId: number) {
    const quotations = await this.prisma.quotation.findMany({
      where: {
        customerId,
        status: { in: ['PENDING_CONFIRM', 'CONFIRMED', 'CONVERTED', 'EXPIRED'] },
      },
      select: {
        id: true,
        quoteNo: true,
        channel: true,
        status: true,
        currentVersion: true,
        finalAmount: true,
        validUntil: true,
        convertedOrderId: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            status: true,
            snapshotSchemaVersion: true,
            currency: true,
            totalAmount: true,
            validUntil: true,
            issuedAt: true,
            acceptedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return quotations.map((quotation) => ({
      ...quotation,
      currentVersionRecord: quotation.versions[0] ?? null,
    }));
  }

  async findForCustomerById(customerId: number, id: number) {
    const quotation = await this.prisma.quotation.findFirst({
      where: { id, customerId, status: { not: 'DRAFT' } },
      select: {
        id: true,
        quoteNo: true,
        channel: true,
        status: true,
        currentVersion: true,
        finalAmount: true,
        validUntil: true,
        convertedOrderId: true,
        versions: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            channel: true,
            status: true,
            snapshotSchemaVersion: true,
            currency: true,
            subtotalAmount: true,
            discountAmount: true,
            feeAmount: true,
            totalAmount: true,
            validUntil: true,
            issuedAt: true,
            acceptedAt: true,
            items: {
              select: {
                id: true,
                productId: true,
                skuId: true,
                waxType: true,
                description: true,
                quantity: true,
                unitPrice: true,
                subtotal: true,
                pricingSnapshot: true,
              },
            },
            feeLines: {
              select: {
                id: true,
                code: true,
                displayText: true,
                calculationMethod: true,
                rate: true,
                basisQuantity: true,
                amount: true,
                currency: true,
              },
            },
            resourceRequirements: {
              select: {
                requiredQuantity: true,
                resourceBucket: {
                  select: { kind: true, displayName: true, unit: true },
                },
              },
            },
            designFileVersion: {
              select: {
                id: true,
                designFileId: true,
                version: true,
                status: true,
                checksumSha256: true,
                redWaxWeight: true,
                purpleWaxWeight: true,
                confirmedAt: true,
                designFile: { select: { referenceNo: true } },
                mediaAsset: { select: { originalName: true, byteSize: true } },
              },
            },
            paymentPlans: {
              select: {
                id: true,
                status: true,
                currency: true,
                totalAmount: true,
                installments: {
                  select: { sequence: true, label: true, amount: true, dueAt: true, status: true },
                  orderBy: { sequence: 'asc' },
                },
              },
            },
          },
        },
        convertedOrder: { select: { id: true, orderNo: true, status: true } },
      },
    });
    if (!quotation) throw new NotFoundException('报价单不存在或无权访问');
    const versions = quotation.versions.map((version) => {
      const safeItems = version.items.map((item) => {
        const pricing = item.pricingSnapshot && typeof item.pricingSnapshot === 'object' && !Array.isArray(item.pricingSnapshot)
          ? item.pricingSnapshot as Prisma.JsonObject
          : {};
        const source = String(pricing.rateSource ?? pricing.method ?? 'CUSTOM_QUOTE');
        const sourceCode = source === 'SKU_FIXED'
          ? 'SKU_FIXED_PRICE'
          : source === 'QUOTED'
            ? 'CUSTOM_QUOTE'
            : source;
        const rateSourceLabel = sourceCode === 'CUSTOMER_AGREEMENT'
          ? '客户专属协议价'
          : sourceCode === 'SYSTEM_DEFAULT_D19_V1'
            ? '系统默认合作价'
            : sourceCode === 'SKU_FIXED_PRICE'
              ? 'SKU 固定价'
              : '定制报价';
        return {
          id: item.id,
          productId: item.productId,
          skuId: item.skuId,
          waxType: item.waxType,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          pricingSnapshot: {
            source: sourceCode,
            confirmedWaxWeight: pricing.confirmedWaxWeight ?? null,
            rate: pricing.rate ?? null,
            rateSourceLabel,
          },
          pricingSource: sourceCode,
          confirmedWaxWeight: pricing.confirmedWaxWeight ?? null,
          rate: pricing.rate ?? null,
        };
      });
      const source = safeItems[0]?.pricingSource ?? 'CUSTOM_QUOTE';
      const pricingSource = source === 'CUSTOMER_AGREEMENT'
        ? { code: source, label: '客户专属协议价' }
        : source === 'SYSTEM_DEFAULT_D19_V1'
          ? { code: source, label: '系统默认合作价' }
          : source === 'SKU_FIXED_PRICE'
            ? { code: source, label: 'SKU 固定价' }
            : { code: 'CUSTOM_QUOTE', label: '定制报价' };
      const waxType = safeItems.find((item) => item.waxType)?.waxType ?? null;
      return {
        ...version,
        subtotal: version.subtotalAmount,
        items: safeItems,
        feeLines: version.feeLines,
        resourceRequirements: version.resourceRequirements.map((requirement) => ({
          kind: requirement.resourceBucket.kind,
          displayName: requirement.resourceBucket.displayName,
          unit: requirement.resourceBucket.unit,
          requiredQuantity: requirement.requiredQuantity,
          resourceBucket: requirement.resourceBucket,
        })),
        designFileVersion: version.designFileVersion ? {
          id: version.designFileVersion.id,
          fileId: version.designFileVersion.designFileId,
          designFileId: version.designFileVersion.designFileId,
          fileName: version.designFileVersion.designFile.referenceNo,
          originalName: version.designFileVersion.mediaAsset.originalName,
          byteSize: version.designFileVersion.mediaAsset.byteSize,
          checksumSha256: version.designFileVersion.checksumSha256,
          downloadUrl: `/api/customers/me/cooperation-design-files/${version.designFileVersion.designFileId}/versions/${version.designFileVersion.version}/content`,
          version: version.designFileVersion.version,
          status: version.designFileVersion.status,
          waxType,
          confirmedWaxWeight: waxType === 'RED'
            ? version.designFileVersion.redWaxWeight
            : waxType === 'PURPLE'
              ? version.designFileVersion.purpleWaxWeight
              : null,
          redWaxWeight: version.designFileVersion.redWaxWeight,
          purpleWaxWeight: version.designFileVersion.purpleWaxWeight,
          confirmedAt: version.designFileVersion.confirmedAt,
        } : null,
        pricingSource,
      };
    });
    return {
      ...quotation,
      versions,
      currentVersionRecord:
        versions.find((version) => version.version === quotation.currentVersion) ?? null,
    };
  }

  async acceptCurrentVersion(customerId: number, id: number) {
    void customerId;
    void id;
    throw new ServiceUnavailableException(
      '分步接受入口已关闭，请使用客户报价确认并转单的原子入口',
    );
    /* istanbul ignore next -- legacy implementation kept unreachable during compatibility cleanup */
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM quotations WHERE id = ${id} FOR UPDATE`);
      const quotation = await tx.quotation.findFirst({
        where: { id, customerId },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            include: {
              items: true,
              paymentPlans: {
                include: { installments: { orderBy: { sequence: 'asc' } } },
              },
            },
          },
        },
      });
      if (!quotation) throw new NotFoundException('报价单不存在或无权操作');
      const version = quotation.versions[0];
      if (!version || version.version !== quotation.currentVersion) {
        throw new ConflictException('报价单缺少当前不可变版本');
      }
      this.requireTrustedCustomerSnapshot(version.customerSnapshot, customerId);
      this.assertVersionContentHash(version);
      if (
        quotation.status === 'CONFIRMED' &&
        version.status === 'ACCEPTED' &&
        version.acceptedByCustomerId === customerId
      ) {
        if (
          version.paymentPlans.length !== 1 ||
          version.paymentPlans[0].status !== 'ACTIVE'
        ) {
          throw new ConflictException('已接受报价版本缺少唯一的生效付款计划');
        }
        return version;
      }
      if (quotation.status !== 'PENDING_CONFIRM' || version.status !== 'ISSUED') {
        throw new ConflictException('当前报价版本不可接受');
      }
      if (version.validUntil && version.validUntil.getTime() <= Date.now()) {
        throw new ConflictException('报价已过有效期，请联系顾问重新报价');
      }
      if (
        version.paymentPlans.length !== 1 ||
        version.paymentPlans[0].status !== 'DRAFT'
      ) {
        throw new ConflictException('当前报价版本缺少唯一的待激活付款计划');
      }
      this.assertPaymentPlanMatchesVersion(version, version.paymentPlans[0]);
      const acceptedAt = new Date();
      const accepted = await tx.quotationVersion.updateMany({
        where: { id: version.id, status: 'ISSUED', acceptedByCustomerId: null },
        data: { status: 'ACCEPTED', acceptedByCustomerId: customerId, acceptedAt },
      });
      if (accepted.count === 0) throw new ConflictException('报价状态已变化，请刷新后重试');
      const activated = await tx.paymentPlan.updateMany({
        where: { quotationVersionId: version.id, status: 'DRAFT' },
        data: { status: 'ACTIVE' },
      });
      if (activated.count !== 1) {
        throw new ConflictException('付款计划状态已变化，请刷新后重试');
      }
      await tx.quotation.update({ where: { id }, data: { status: 'CONFIRMED' } });
      return tx.quotationVersion.findUnique({ where: { id: version.id } });
    });
  }

  async convertAcceptedVersion(
    customerId: number,
    id: number,
    data: { address: string },
  ) {
    void customerId;
    void id;
    void data;
    throw new ServiceUnavailableException(
      '分步转单入口已关闭，请使用客户报价确认并转单的原子入口',
    );
    /* istanbul ignore next -- legacy implementation kept unreachable during compatibility cleanup */
    const address = data.address?.trim();
    if (!address) throw new BadRequestException('请提供有效的收货地址');
    return runWithDocumentNumberRetry({
      targetMarkers: ['orderNo', 'order_no', 'orders_order_no_key'],
      documentLabel: '订单',
      runTransaction: () => this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM quotations WHERE id = ${id} FOR UPDATE`);
        const quotation = await tx.quotation.findFirst({
          where: { id, customerId },
          include: {
            convertedOrder: true,
          },
        });
        if (!quotation) throw new NotFoundException('报价单不存在或无权操作');
        if (quotation.convertedOrder) return quotation.convertedOrder;
        const acceptedVersions = await tx.quotationVersion.findMany({
          where: {
            quotationId: id,
            status: 'ACCEPTED',
            acceptedByCustomerId: customerId,
          },
          orderBy: { acceptedAt: 'desc' },
          take: 2,
          include: {
            items: true,
            paymentPlans: {
              include: { installments: { orderBy: { sequence: 'asc' } } },
            },
          },
        });
        if (acceptedVersions.length !== 1) {
          throw new ConflictException('报价单缺少唯一的客户已接受版本');
        }
        const version = acceptedVersions[0];
        if (
          quotation.status !== 'CONFIRMED' ||
          version.status !== 'ACCEPTED' ||
          version.acceptedByCustomerId !== customerId
        ) {
          throw new ConflictException('只有客户本人已接受的不可变报价版本可以转单');
        }
        this.assertUniqueSkuIds(version.items, '已接受报价版本包含重复商品规格，不能转单');
        const snapshot = this.requireTrustedCustomerSnapshot(
          version.customerSnapshot,
          customerId,
        );
        this.assertVersionContentHash(version);
        if (version.items.some((item) => !item.productId || !item.skuId)) {
          throw new ServiceUnavailableException(
            '报价包含非标准 SKU 定制项，需完成定制订单行模型后才能转单',
          );
        }
        const plan = version.paymentPlans[0];
        if (!plan || version.paymentPlans.length !== 1 || plan.status !== 'ACTIVE') {
          throw new ConflictException('报价版本缺少唯一的生效付款计划');
        }
        this.assertPaymentPlanMatchesVersion(version, plan);
        const latestGoldPrice = await tx.goldPrice.findFirst({
          orderBy: { recordDate: 'desc' },
        });
        const reservedAt = new Date();
        if (!this.orders) {
          throw new ServiceUnavailableException('报价转单服务未配置');
        }
        const customerName =
          typeof snapshot.customerName === 'string'
            ? snapshot.customerName.trim()
            : '';
        const customerPhone =
          typeof snapshot.customerPhone === 'string'
            ? snapshot.customerPhone.trim()
            : '';
        if (!customerName || !customerPhone) {
          throw new ConflictException('已接受报价版本缺少完整客户快照');
        }
        const customerEmail =
          typeof snapshot.customerEmail === 'string'
            ? snapshot.customerEmail.trim() || undefined
            : undefined;
        const snapshotConsultantId = Number(snapshot.salesConsultantId);
        const snapshotDepositCents = Math.round(Number(snapshot.depositAmount) * 100);
        const plannedDepositCents = snapshotDepositCents > 0
          ? Math.round(Number(plan.installments[0]?.amount) * 100)
          : 0;
        if (
          !Number.isSafeInteger(snapshotDepositCents) ||
          snapshotDepositCents !== plannedDepositCents
        ) {
          throw new ConflictException('已接受报价快照与付款计划的定金不一致');
        }
        const order = await this.orders.createOrderFromQuotationInTx(tx, {
          quotationId: quotation.id,
          quotationVersionId: version.id,
          customerId,
          customerName,
          customerPhone,
          customerEmail,
          address,
          salesConsultantId:
            Number.isInteger(snapshotConsultantId) && snapshotConsultantId > 0
              ? snapshotConsultantId
              : undefined,
          orderType: version.channel === 'RETAIL' ? 'SPOT' : 'CUSTOM',
          totalAmount: version.subtotalAmount.toString(),
          discountAmount: version.discountAmount.toString(),
          finalAmount: version.totalAmount.toString(),
          depositAmount: new Prisma.Decimal(snapshotDepositCents).div(100).toString(),
          items: version.items.map((item) => {
            const pricing = item.pricingSnapshot as Record<string, unknown>;
            return {
              skuId: item.skuId!,
              productId: item.productId!,
              productName: String(pricing.productName || item.description),
              productImage: typeof pricing.productImage === 'string' ? pricing.productImage : null,
              skuSnapshot: typeof pricing.spec === 'string' ? pricing.spec : null,
              quantity: item.quantity,
              unitPrice: item.unitPrice.toString(),
              subtotal: item.subtotal.toString(),
            };
          }),
        }, {
          operator: { type: 'CUSTOMER', id: customerId },
          customer: {
            customerName,
            customerPhone,
            address,
          },
          reservedAt,
          expiresAt: new Date(reservedAt.getTime() + 24 * 60 * 60 * 1000),
          latestGoldPrice,
        });
        const advanced = await tx.quotation.updateMany({
          where: { id, status: 'CONFIRMED', convertedOrderId: null },
          data: { status: 'CONVERTED', convertedOrderId: order.id, convertedAt: new Date() },
        });
        if (advanced.count === 0) throw new ConflictException('报价已被转换，请刷新后重试');
        await tx.paymentPlan.update({
          where: { id: plan.id },
          data: { orderId: order.id },
        });
        return order;
      }),
    });
  }

  private requireTrustedCustomerSnapshot(
    customerSnapshot: Prisma.JsonValue | null,
    customerId: number,
  ) {
    if (
      !customerSnapshot ||
      typeof customerSnapshot !== 'object' ||
      Array.isArray(customerSnapshot)
    ) {
      throw new ConflictException('已接受报价版本缺少可信客户快照');
    }
    const snapshot = customerSnapshot as Record<string, unknown>;
    if (
      snapshot.version !== 1 ||
      snapshot.legacy !== false ||
      snapshot.customerId !== customerId
    ) {
      throw new ConflictException('已接受报价版本的客户快照不可信');
    }
    return snapshot;
  }

  private canonicalVersionContent(version: any) {
    const snapshot = version.customerSnapshot as Record<string, unknown>;
    const items = version.items.map((item: any) => {
      const pricing = item.pricingSnapshot as Record<string, unknown>;
      return {
        productId: item.productId,
        skuId: item.skuId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        subtotal: item.subtotal.toString(),
        pricingSnapshot: {
          version: pricing.version,
          originalUnitPrice: pricing.originalUnitPrice,
          quotedUnitPrice: pricing.quotedUnitPrice,
          productName: pricing.productName,
          productImage: pricing.productImage ?? null,
          spec: pricing.spec ?? null,
        },
      };
    }).sort((left: any, right: any) => {
      const leftJson = JSON.stringify(left);
      const rightJson = JSON.stringify(right);
      return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
    });
    return {
      version: version.version,
      channel: version.channel,
      currency: version.currency,
      subtotalAmount: version.subtotalAmount.toString(),
      discountAmount: version.discountAmount.toString(),
      feeAmount: version.feeAmount.toString(),
      totalAmount: version.totalAmount.toString(),
      validUntil: version.validUntil?.toISOString() ?? null,
      customerSnapshot: {
        version: snapshot.version,
        legacy: snapshot.legacy,
        customerId: snapshot.customerId,
        customerName: snapshot.customerName,
        customerPhone: snapshot.customerPhone,
        customerEmail: snapshot.customerEmail ?? null,
        salesConsultantId: snapshot.salesConsultantId ?? null,
        depositAmount: String(snapshot.depositAmount),
      },
      items,
    };
  }

  private assertVersionContentHash(version: any) {
    const expected = createHash('sha256')
      .update(JSON.stringify(this.canonicalVersionContent(version)))
      .digest('hex');
    if (version.contentHash !== expected) {
      throw new ConflictException('报价版本内容校验失败，不能接受或转单');
    }
  }

  private assertPaymentPlanMatchesVersion(version: any, plan: any) {
    const planCents = Math.round(Number(plan.totalAmount) * 100);
    const installmentCents = plan.installments.reduce(
      (sum: number, item: any) => sum + Math.round(Number(item.amount) * 100),
      0,
    );
    if (
      plan.currency !== version.currency ||
      planCents !== Math.round(Number(version.totalAmount) * 100) ||
      installmentCents !== planCents ||
      plan.installments.some((item: any) => item.status === 'WAIVED')
    ) {
      throw new ConflictException('付款计划与报价版本金额、币种或分期状态不一致');
    }
  }

  /** 旧后台直接转单入口保留为失败关闭；正式链路使用客户接受后的不可变版本转单。 */
  async convertToOrder(
    _id: number,
    _data: {
      address: string;
      orderType?: 'SPOT' | 'CUSTOM' | 'RESERVATION' | 'OFFLINE';
    },
  ): Promise<never> {
    throw new ServiceUnavailableException(
      '后台直接转单入口不可用：请由客户先接受当前报价版本，再通过客户转单入口创建订单',
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
