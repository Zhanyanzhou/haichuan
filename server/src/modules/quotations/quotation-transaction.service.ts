import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApiError } from '../../common/errors/api-error';
import { runWithDocumentNumberRetry } from '../../common/trade/document-number-retry';
import { OrdersService } from '../orders/orders.service';
import type { ConfirmQuotationOrderDto } from './dto/quotation-commerce.dto';
import {
  asSnapshotArray,
  asSnapshotObject,
  hashBusinessSnapshot,
  requireBusinessSnapshot,
  resolveWaxRate,
  roundMoney,
  snapshotFeeSortKey,
  snapshotItemSortKey,
  snapshotResourceSortKey,
  sortSnapshotRows,
} from './quotation-snapshot';
import { UploadService } from '../upload/upload.service';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

@Injectable()
export class QuotationTransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    @Optional() private readonly uploadService?: UploadService,
  ) {}

  private designMediaAuthority() {
    if (!this.uploadService) throw new Error('UploadService is not configured');
    return this.uploadService;
  }

  listDesignFilesForCustomer(customerId: number) {
    return this.prisma.cooperationDesignFile.findMany({
      where: { customerId },
      select: {
        id: true,
        referenceNo: true,
        productId: true,
        currentVersion: true,
        versions: {
          where: { status: { in: ['SUBMITTED', 'CONFIRMED'] } },
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            status: true,
            checksumSha256: true,
            redWaxWeight: true,
            purpleWaxWeight: true,
            confirmedAt: true,
            mediaAsset: { select: { originalName: true, byteSize: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }).then((files) => files.map((file) => ({
      ...file,
      versions: file.versions.map((version) => ({
        id: version.id,
        version: version.version,
        status: version.status,
        fileName: version.mediaAsset.originalName,
        byteSize: version.mediaAsset.byteSize,
        checksumSha256: version.checksumSha256,
        redWaxWeight: version.redWaxWeight,
        purpleWaxWeight: version.purpleWaxWeight,
        confirmedAt: version.confirmedAt,
        downloadUrl: `/api/customers/me/cooperation-design-files/${file.id}/versions/${version.version}/content`,
      })),
    })));
  }

  async confirmDesignFileVersion(customerId: number, designFileId: number, version: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`,
      );
      const customer = await tx.customer.findFirst({
        where: {
          id: customerId,
          status: 'ACTIVE',
          accountType: 'PARTNER',
          partnerStatus: 'APPROVED',
        },
        select: { id: true },
      });
      if (!customer) {
        throw new ApiError(HttpStatus.FORBIDDEN, 'PARTNER_NOT_APPROVED', '当前合作资格不能确认此文件');
      }
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM cooperation_design_files WHERE id = ${designFileId} FOR UPDATE`,
      );
      const file = await tx.cooperationDesignFile.findFirst({
        where: { id: designFileId, customerId },
        select: {
          id: true,
          referenceNo: true,
          currentVersion: true,
          versions: {
            where: { version },
            take: 1,
            select: {
              id: true,
              version: true,
              status: true,
              checksumSha256: true,
              redWaxWeight: true,
              purpleWaxWeight: true,
              confirmedAt: true,
              confirmedByCustomerId: true,
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
          },
        },
      });
      if (!file) throw new NotFoundException('3D 文件版本不存在或无权操作');
      const target = file.versions[0];
      if (!target || file.currentVersion !== version) {
        throw new ConflictException('只能确认当前 3D 文件版本');
      }
      if (
        target.status === 'CONFIRMED' &&
        target.confirmedByCustomerId === customerId &&
        target.confirmedAt
      ) {
        return {
          id: target.id,
          version: target.version,
          status: target.status,
          redWaxWeight: target.redWaxWeight,
          purpleWaxWeight: target.purpleWaxWeight,
          confirmedAt: target.confirmedAt,
        };
      }
      if (target.status !== 'SUBMITTED') {
        throw new ConflictException('当前 3D 文件版本不可确认');
      }
      if (target.redWaxWeight == null && target.purpleWaxWeight == null) {
        throw new ConflictException('3D 文件版本缺少可确认蜡重');
      }
      await this.designMediaAuthority().readVerifiedDesignFile(
        target.mediaAsset,
        target.checksumSha256,
      );
      await tx.cooperationDesignFileVersion.updateMany({
        where: { designFileId, status: 'CONFIRMED', id: { not: target.id } },
        data: { status: 'SUPERSEDED' },
      });
      const confirmedAt = new Date();
      const updated = await tx.cooperationDesignFileVersion.updateMany({
        where: { id: target.id, status: 'SUBMITTED', confirmedByCustomerId: null },
        data: { status: 'CONFIRMED', confirmedByCustomerId: customerId, confirmedAt },
      });
      if (updated.count !== 1) throw new ConflictException('3D 文件版本状态已变化，请刷新后重试');
      return tx.cooperationDesignFileVersion.findUniqueOrThrow({
        where: { id: target.id },
        select: {
          id: true,
          version: true,
          status: true,
          redWaxWeight: true,
          purpleWaxWeight: true,
          confirmedAt: true,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async confirmAndCreateOrder(
    customerId: number,
    quotationId: number,
    rawIdempotencyKey: string | undefined,
    dto: ConfirmQuotationOrderDto,
  ) {
    const idempotencyKey = rawIdempotencyKey?.trim() ?? '';
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key 必须为 8 至 200 位安全字符');
    }
    const idempotencyKeyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    const requestHash = createHash('sha256').update(JSON.stringify({
      customerId,
      quotationId,
      quotationVersion: dto.quotationVersion,
      addressId: dto.addressId ?? null,
      address: dto.address?.trim() ?? null,
    })).digest('hex');

    const order = await runWithDocumentNumberRetry({
      targetMarkers: [
        'orderNo',
        'order_no',
        'orders_order_no_key',
        'quotation_conversions_idempotency_key_hash_key',
        'quotation_conversions_quotation_version_id_key',
      ],
      documentLabel: '报价订单',
      runTransaction: () => this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM quotations WHERE id = ${quotationId} FOR UPDATE`);
        const previous = await tx.quotationConversion.findUnique({
          where: { idempotencyKeyHash },
          include: { order: true },
        });
        if (previous) {
          if (
            previous.customerId !== customerId ||
            previous.requestHash !== requestHash ||
            previous.quotationVersionId == null
          ) {
            throw new ApiError(
              HttpStatus.CONFLICT,
              'IDEMPOTENCY_KEY_REUSED',
              '幂等键已用于不同的确认请求',
            );
          }
          return previous.order;
        }
        const quotation = await tx.quotation.findFirst({
          where: { id: quotationId, customerId },
          select: {
            id: true,
            quoteNo: true,
            status: true,
            channel: true,
            currentVersion: true,
            convertedOrderId: true,
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                status: true,
                accountType: true,
                partnerStatus: true,
              },
            },
            versions: {
              where: { version: dto.quotationVersion },
              take: 1,
              include: {
                items: true,
                feeLines: true,
                resourceRequirements: { include: { resourceBucket: true } },
                designFileVersion: { include: { designFile: true } },
                partnerPriceAgreement: true,
                paymentPlans: { include: { installments: { orderBy: { sequence: 'asc' } } } },
                conversion: { include: { order: true } },
              },
            },
          },
        });
        if (!quotation || !quotation.customer || quotation.customer.status !== 'ACTIVE') {
          throw new NotFoundException('报价单不存在或无权操作');
        }
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`,
        );
        const liveCustomer = await tx.customer.findUnique({
          where: { id: customerId },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            status: true,
            accountType: true,
            partnerStatus: true,
          },
        });
        if (!liveCustomer || liveCustomer.status !== 'ACTIVE') {
          throw new NotFoundException('报价单不存在或无权操作');
        }
        const version = quotation.versions[0];
        if (version?.conversion) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            'QUOTE_ALREADY_CONVERTED_WITH_DIFFERENT_KEY',
            '报价已由另一确认请求转换为订单',
          );
        }
        if (
          !version ||
          quotation.status !== 'PENDING_CONFIRM' ||
          quotation.convertedOrderId != null ||
          quotation.currentVersion !== dto.quotationVersion ||
          version.status !== 'ISSUED'
        ) {
          throw new ApiError(HttpStatus.CONFLICT, 'QUOTE_VERSION_STALE', '报价已有新版本');
        }
        if (version.validUntil && version.validUntil.getTime() <= Date.now()) {
          throw new ApiError(HttpStatus.CONFLICT, 'QUOTE_EXPIRED', '报价已过有效期');
        }
        if (version.snapshotSchemaVersion !== 2) {
          throw new ConflictException('旧版报价只能复制并重新发出后成交');
        }
        const businessSnapshot = requireBusinessSnapshot(version.businessSnapshot);
        if (hashBusinessSnapshot(businessSnapshot) !== version.contentHash) {
          throw new ApiError(HttpStatus.CONFLICT, 'QUOTE_SNAPSHOT_MISMATCH', '报价快照校验失败');
        }
        const snapshotItems = asSnapshotArray(businessSnapshot.items, '报价版本缺少行项目快照');
        const actualItems = version.items.map((item) => ({
          productId: item.productId,
          skuId: item.skuId,
          waxType: item.waxType,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          subtotal: item.subtotal.toFixed(2),
          pricingSnapshot: item.pricingSnapshot,
        }));
        const snapshotFees = asSnapshotArray(businessSnapshot.fees, '报价版本缺少费用快照');
        const actualFees = version.feeLines.map((line) => ({
          feeRuleId: line.feeRuleId,
          code: line.code,
          displayText: line.displayText,
          calculationMethod: line.calculationMethod,
          rate: line.rate.toFixed(2),
          basisQuantity: line.basisQuantity?.toFixed(3) ?? null,
          amount: line.amount.toFixed(2),
        }));
        const snapshotResources = asSnapshotArray(businessSnapshot.resources, '报价版本缺少资源快照');
        const actualResources = version.resourceRequirements.map((requirement) => {
          const resource = asSnapshotObject(requirement.resourceSnapshot, '报价资源要求缺少快照');
          return {
            resourceBucketId: requirement.resourceBucketId,
            channel: resource.channel,
            kind: resource.kind,
            code: resource.code,
            bucketKey: resource.bucketKey,
            displayName: resource.displayName,
            unit: resource.unit,
            requiredQuantity: requirement.requiredQuantity.toFixed(3),
          };
        });
        if (
          hashBusinessSnapshot({ rows: sortSnapshotRows(snapshotItems, snapshotItemSortKey) }) !== hashBusinessSnapshot({ rows: sortSnapshotRows(actualItems, snapshotItemSortKey) }) ||
          hashBusinessSnapshot({ rows: sortSnapshotRows(snapshotFees, snapshotFeeSortKey) }) !== hashBusinessSnapshot({ rows: sortSnapshotRows(actualFees, snapshotFeeSortKey) }) ||
          hashBusinessSnapshot({ rows: sortSnapshotRows(snapshotResources, snapshotResourceSortKey) }) !== hashBusinessSnapshot({ rows: sortSnapshotRows(actualResources, snapshotResourceSortKey) })
        ) {
          throw new ApiError(HttpStatus.CONFLICT, 'QUOTE_SNAPSHOT_MISMATCH', '报价快照校验失败');
        }
        const snapshotCustomer = asSnapshotObject(
          businessSnapshot.customer,
          '报价版本缺少客户快照',
        );
        if (snapshotCustomer.customerId !== customerId) {
          throw new ConflictException('报价客户快照不匹配');
        }

        if (quotation.channel === 'PARTNER_WAX') {
          if (
            liveCustomer.accountType !== 'PARTNER' ||
            liveCustomer.partnerStatus !== 'APPROVED'
          ) {
            throw new ApiError(HttpStatus.FORBIDDEN, 'PARTNER_NOT_APPROVED', '当前合作资格不能确认此报价');
          }
          const design = version.designFileVersion;
          if (design) {
            await tx.$queryRaw(
              Prisma.sql`SELECT id FROM cooperation_design_files WHERE id = ${design.designFileId} FOR UPDATE`,
            );
          }
          const liveDesign = design ? await tx.cooperationDesignFileVersion.findUnique({
            where: { id: design.id },
            include: {
              designFile: true,
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
          }) : null;
          if (
            !liveDesign ||
            liveDesign.status !== 'CONFIRMED' ||
            liveDesign.designFile.customerId !== customerId ||
            liveDesign.designFile.currentVersion !== liveDesign.version ||
            liveDesign.confirmedByCustomerId !== customerId
          ) {
            throw new ApiError(HttpStatus.CONFLICT, 'DESIGN_VERSION_CHANGED', '3D 文件版本已经变化');
          }
          const verifiedDesignMedia = await this.designMediaAuthority().readVerifiedDesignFile(
            liveDesign.mediaAsset,
            liveDesign.checksumSha256,
          );
          const pricing = asSnapshotObject(businessSnapshot.pricing, '报价版本缺少计价快照');
          const internalDesign = asSnapshotObject(
            businessSnapshot.internalDesign,
            '合作蜡模报价缺少文件快照',
          );
          const waxType = pricing.waxType;
          if (waxType !== 'RED' && waxType !== 'PURPLE') {
            throw new ApiError(HttpStatus.CONFLICT, 'RATE_AGREEMENT_CHANGED', '合作价格协议已经变化');
          }
          const confirmedWaxWeight = waxType === 'RED'
            ? liveDesign.redWaxWeight
            : liveDesign.purpleWaxWeight;
          if (
            internalDesign.designFileVersionId !== liveDesign.id ||
            internalDesign.designFileVersion !== liveDesign.version ||
            internalDesign.mediaAssetId !== liveDesign.mediaAsset.id ||
            internalDesign.originalName !== verifiedDesignMedia.originalName ||
            internalDesign.byteSize !== verifiedDesignMedia.byteSize ||
            internalDesign.mimeType !== verifiedDesignMedia.mimeType ||
            internalDesign.checksumSha256 !== verifiedDesignMedia.checksumSha256 ||
            String(internalDesign.targetGoldWeight ?? null) !== (liveDesign.targetGoldWeight?.toFixed(3) ?? 'null') ||
            !confirmedWaxWeight ||
            confirmedWaxWeight.toFixed(3) !== String(pricing.confirmedWaxWeight)
          ) {
            throw new ApiError(HttpStatus.CONFLICT, 'DESIGN_VERSION_CHANGED', '3D 文件版本已经变化');
          }
          const now = new Date();
          const currentAgreements = await tx.partnerPriceAgreement.findMany({
            where: {
              customerId,
              effectiveFrom: { lte: now },
              OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
            },
            orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
            take: 2,
          });
          if (currentAgreements.length > 1) {
            throw new ApiError(HttpStatus.CONFLICT, 'RATE_AGREEMENT_OVERLAP', '合作价格协议生效区间重叠');
          }
          const currentAgreement = currentAgreements[0] ?? null;
          const currentRate = resolveWaxRate(waxType, currentAgreement);
          if (
            currentRate.source !== pricing.rateSource ||
            currentRate.agreementId !== (pricing.agreementId ?? null) ||
            roundMoney(currentRate.rate).toFixed(2) !== String(pricing.rate)
          ) {
            throw new ApiError(HttpStatus.CONFLICT, 'RATE_AGREEMENT_CHANGED', '合作价格协议已经变化');
          }
        }

        const amountSnapshot = asSnapshotObject(
          businessSnapshot.amounts,
          '报价版本缺少金额快照',
        );
        const lineSubtotal = version.items.reduce(
          (sum, item) => sum.plus(item.subtotal),
          new Prisma.Decimal(0),
        );
        const feeTotal = version.feeLines.reduce(
          (sum, item) => sum.plus(item.amount),
          new Prisma.Decimal(0),
        );
        const recomputedTotal = roundMoney(lineSubtotal.minus(version.discountAmount).plus(feeTotal));
        if (
          !lineSubtotal.equals(version.subtotalAmount) ||
          !feeTotal.equals(version.feeAmount) ||
          !version.discountAmount.equals(0) ||
          !recomputedTotal.equals(version.totalAmount) ||
          String(amountSnapshot.subtotalAmount) !== version.subtotalAmount.toFixed(2) ||
          String(amountSnapshot.discountAmount) !== version.discountAmount.toFixed(2) ||
          String(amountSnapshot.feeAmount) !== version.feeAmount.toFixed(2) ||
          String(amountSnapshot.totalAmount) !== version.totalAmount.toFixed(2)
        ) {
          throw new ApiError(HttpStatus.CONFLICT, 'QUOTE_AMOUNT_CHANGED', '报价金额已经变化');
        }

        const liveResourceVersions = new Map<number, number>();
        if (quotation.channel === 'RETAIL') {
          if (version.resourceRequirements.length > 0) {
            throw new ConflictException('零售报价不能使用定制资源桶');
          }
          const skuIds = version.items.map((item) => item.skuId).filter((id): id is number => id != null);
          if (skuIds.length !== version.items.length || new Set(skuIds).size !== skuIds.length) {
            throw new ConflictException('零售报价缺少唯一 SKU');
          }
          const skus = await tx.productSKU.findMany({
            where: { id: { in: skuIds }, isActive: true },
            select: { id: true, productId: true, price: true, product: { select: { salesMode: true, status: true } } },
          });
          if (skus.length !== skuIds.length) {
            throw new ApiError(HttpStatus.CONFLICT, 'RETAIL_SKU_CHANGED', '零售商品规格已经变化');
          }
          const skuById = new Map(skus.map((sku) => [sku.id, sku]));
          for (const item of version.items) {
            const sku = skuById.get(item.skuId!);
            if (
              !sku ||
              sku.productId !== item.productId ||
              sku.product.salesMode !== 'DIRECT_PURCHASE' ||
              sku.product.status !== 'PUBLISHED' ||
              !roundMoney(sku.price).equals(item.unitPrice)
            ) {
              throw new ApiError(HttpStatus.CONFLICT, 'RETAIL_PRICE_CHANGED', '零售商品价格已经变化');
            }
          }
        } else {
          const kinds = new Set(version.resourceRequirements.map((item) => item.resourceBucket.kind));
          if (!kinds.has('CAPACITY') || !kinds.has('MATERIAL')) {
            throw new ConflictException('报价缺少完整产能和材料门禁');
          }
          const resourceNow = new Date();
          for (const requirement of [...version.resourceRequirements].sort((a, b) => a.resourceBucketId - b.resourceBucketId)) {
            await tx.$queryRaw(
              Prisma.sql`SELECT id FROM trade_resource_buckets WHERE id = ${requirement.resourceBucketId} FOR UPDATE`,
            );
            const bucket = await tx.tradeResourceBucket.findUnique({
              where: { id: requirement.resourceBucketId },
              select: {
                id: true,
                channel: true,
                isActive: true,
                availableQuantity: true,
                reservedQuantity: true,
                version: true,
                bucketStart: true,
                bucketEnd: true,
              },
            });
            if (
              !bucket ||
              !bucket.isActive ||
              bucket.channel !== quotation.channel ||
              (bucket.bucketStart != null && bucket.bucketStart > resourceNow) ||
              (bucket.bucketEnd != null && bucket.bucketEnd <= resourceNow) ||
              bucket.availableQuantity
                .minus(bucket.reservedQuantity)
                .lt(requirement.requiredQuantity)
            ) {
              throw new ApiError(HttpStatus.CONFLICT, 'RESOURCE_INSUFFICIENT', '当前生产资源不足');
            }
            liveResourceVersions.set(bucket.id, bucket.version);
          }
        }

        const addressRecord = dto.addressId == null
          ? null
          : await tx.customerAddress.findFirst({
              where: { id: dto.addressId, customerId },
              select: { recipientName: true, recipientPhone: true, province: true, city: true, district: true, detail: true },
            });
        if (dto.addressId != null && !addressRecord) {
          throw new NotFoundException('收货地址不存在或无权使用');
        }
        const customerName = addressRecord?.recipientName || liveCustomer.name?.trim() || '';
        const customerPhone = addressRecord?.recipientPhone || liveCustomer.phone;
        const address = addressRecord
          ? [addressRecord.province, addressRecord.city, addressRecord.district, addressRecord.detail].filter(Boolean).join('')
          : dto.address?.trim() || '';
        if (!customerName || !customerPhone || !address) {
          throw new BadRequestException('请提供完整收货人、手机号和地址');
        }

        const plan = version.paymentPlans[0];
        if (!plan || version.paymentPlans.length !== 1 || plan.status !== 'DRAFT') {
          throw new ConflictException('报价版本缺少唯一待激活付款计划');
        }
        const installmentTotal = plan.installments.reduce(
          (sum, item) => sum.plus(item.amount),
          new Prisma.Decimal(0),
        );
        if (!installmentTotal.equals(version.totalAmount) || !plan.totalAmount.equals(version.totalAmount)) {
          throw new ConflictException('付款计划与报价金额不一致');
        }
        const depositAmount = roundMoney(String(snapshotCustomer.depositAmount ?? '0'));
        const balanceAmount = roundMoney(version.totalAmount.minus(depositAmount));
        const installments = [...plan.installments].sort((left, right) => left.sequence - right.sequence);
        const expectedInstallments = depositAmount.gt(0)
          ? [
              { sequence: 1, label: '定金', amount: depositAmount },
              ...(balanceAmount.gt(0)
                ? [{ sequence: 2, label: '尾款', amount: balanceAmount }]
                : []),
            ]
          : [{ sequence: 1, label: '全款', amount: version.totalAmount }];
        if (
          depositAmount.lt(0) ||
          balanceAmount.lt(0) ||
          installments.length !== expectedInstallments.length ||
          installments.some((installment, index) =>
            installment.status !== 'PENDING' ||
            installment.paymentId != null ||
            installment.sequence !== expectedInstallments[index]?.sequence ||
            installment.label !== expectedInstallments[index]?.label ||
            !installment.amount.equals(expectedInstallments[index]?.amount ?? -1),
          )
        ) {
          throw new ConflictException('付款计划与报价定金分拆不一致');
        }

        const confirmedAt = new Date();
        const transactionSnapshot = {
          ...businessSnapshot,
          confirmation: {
            customerId,
            confirmedAt: confirmedAt.toISOString(),
            idempotencyKeyHash,
          },
          shipping: { customerName, customerPhone, address },
        } satisfies Prisma.JsonObject;
        const transactionSnapshotHash = hashBusinessSnapshot(transactionSnapshot);
        const reservedAt = confirmedAt;
        const order = await this.orders.createOrderFromQuotationInTx(tx, {
          quotationId,
          quotationVersionId: version.id,
          channel: quotation.channel,
          customerId,
          customerAccountTypeSnapshot: liveCustomer.accountType,
          confirmedAt,
          customerName,
          customerPhone,
          customerEmail: liveCustomer.email ?? undefined,
          address,
          salesConsultantId: Number(snapshotCustomer.salesConsultantId) || undefined,
          orderType: quotation.channel === 'RETAIL' ? 'SPOT' : 'CUSTOM',
          totalAmount: version.subtotalAmount.toString(),
          discountAmount: version.discountAmount.toString(),
          feeAmount: version.feeAmount.toString(),
          finalAmount: version.totalAmount.toString(),
          depositAmount: depositAmount.toFixed(2),
          transactionSnapshot,
          transactionSnapshotHash,
          items: version.items.map((item) => {
            const itemPricing = asSnapshotObject(item.pricingSnapshot, '报价行缺少计价快照');
            return {
              quotationVersionItemId: item.id,
              skuId: item.skuId,
              productId: item.productId,
              waxType: item.waxType,
              productName: String(itemPricing.productName ?? item.description),
              productImage: typeof itemPricing.productImage === 'string' ? itemPricing.productImage : null,
              productCode: typeof itemPricing.productCode === 'string' ? itemPricing.productCode : null,
              skuSnapshot: typeof itemPricing.spec === 'string' ? itemPricing.spec : null,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice.toString(),
              subtotal: item.subtotal.toString(),
              pricingSnapshot: item.pricingSnapshot,
            };
          }),
          resourceRequirements: version.resourceRequirements.map((requirement) => ({
            quotationRequirementId: requirement.id,
            resourceBucketId: requirement.resourceBucketId,
            resourceBucketVersion: liveResourceVersions.get(requirement.resourceBucketId)!,
            quantity: requirement.requiredQuantity.toString(),
          })),
        }, {
          operator: { type: 'CUSTOMER', id: customerId },
          customer: { customerName, customerPhone, address },
          reservedAt,
          expiresAt: new Date(reservedAt.getTime() + 24 * 60 * 60 * 1000),
          latestGoldPrice: null,
        });

        await tx.quotationConversion.create({
          data: {
            quotationVersionId: version.id,
            orderId: order.id,
            customerId,
            idempotencyKeyHash,
            requestHash,
          },
        });
        const accepted = await tx.quotationVersion.updateMany({
          where: { id: version.id, status: 'ISSUED', acceptedByCustomerId: null },
          data: { status: 'ACCEPTED', acceptedByCustomerId: customerId, acceptedAt: confirmedAt },
        });
        if (accepted.count !== 1) throw new ConflictException('报价状态已变化，请刷新后重试');
        const advanced = await tx.quotation.updateMany({
          where: { id: quotationId, status: 'PENDING_CONFIRM', convertedOrderId: null },
          data: { status: 'CONVERTED', convertedOrderId: order.id, convertedAt: confirmedAt },
        });
        if (advanced.count !== 1) throw new ConflictException('报价状态已变化，请刷新后重试');
        const activated = await tx.paymentPlan.updateMany({
          where: { id: plan.id, status: 'DRAFT', orderId: null },
          data: { status: 'ACTIVE', orderId: order.id },
        });
        if (activated.count !== 1) throw new ConflictException('付款计划状态已变化，请刷新后重试');
        return order;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    });
    return {
      order: {
        id: order.id,
        orderNo: order.orderNo,
        status: order.status,
        finalAmount: order.finalAmount,
        quoteChannel: order.quoteChannel ?? null,
      },
    };
  }

  async getDesignFileContentForCustomer(
    customerId: number,
    designFileId: number,
    version: number,
  ) {
    const record = await this.prisma.cooperationDesignFileVersion.findFirst({
      where: {
        designFileId,
        version,
        status: { in: ['SUBMITTED', 'CONFIRMED'] },
        designFile: { customerId },
      },
      select: {
        checksumSha256: true,
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
    if (!record) throw new NotFoundException('3D 文件版本不存在或无权读取');
    return this.designMediaAuthority().readVerifiedDesignFile(
      record.mediaAsset,
      record.checksumSha256,
    );
  }
}
