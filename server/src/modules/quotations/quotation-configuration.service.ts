import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateCooperationDesignFileDto,
  CreateCooperationDesignFileVersionDto,
  CreatePartnerPriceAgreementDto,
  CreateQuotationFeeRuleDto,
  CreateTradeResourceBucketDto,
  UpdateTradeResourceBucketDto,
} from './dto/quotation-commerce.dto';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class QuotationConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly uploadService?: UploadService,
  ) {}

  private designMediaAuthority() {
    if (!this.uploadService) throw new Error('UploadService is not configured');
    return this.uploadService;
  }

  listPartnerPrices(customerId: number) {
    return this.prisma.partnerPriceAgreement.findMany({
      where: { customerId },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
    });
  }

  async createPartnerPrice(dto: CreatePartnerPriceAgreementDto, actorId: number) {
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveUntil = dto.effectiveUntil ? new Date(dto.effectiveUntil) : null;
    if (effectiveUntil && effectiveUntil <= effectiveFrom) {
      throw new BadRequestException('双蜡价失效时间必须晚于生效时间');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM customers WHERE id = ${dto.customerId} FOR UPDATE`);
      const customer = await tx.customer.findFirst({
        where: {
          id: dto.customerId,
          status: 'ACTIVE',
          accountType: 'PARTNER',
          partnerStatus: 'APPROVED',
        },
        select: { id: true },
      });
      if (!customer) throw new BadRequestException('仅可为已通过的有效合作客户配置双蜡价');
      const overlap = await tx.partnerPriceAgreement.findFirst({
        where: {
          customerId: dto.customerId,
          effectiveFrom: { lt: effectiveUntil ?? new Date('9999-12-31T23:59:59.999Z') },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: effectiveFrom } }],
        },
        select: { id: true },
      });
      if (overlap) throw new ConflictException('该客户已有重叠生效区间的双蜡价');
      const previous = await tx.partnerPriceAgreement.findFirst({
        where: { customerId: dto.customerId },
        orderBy: [{ version: 'desc' }, { id: 'desc' }],
        select: { id: true, version: true },
      });
      return tx.partnerPriceAgreement.create({
        data: {
          customerId: dto.customerId,
          version: (previous?.version ?? 0) + 1,
          redWaxRate: new Prisma.Decimal(dto.redWaxRate).toDecimalPlaces(2),
          purpleWaxRate: new Prisma.Decimal(dto.purpleWaxRate).toDecimalPlaces(2),
          effectiveFrom,
          effectiveUntil,
          reason: dto.reason,
          createdBy: actorId,
          previousAgreementId: previous?.id ?? null,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  listFeeRules() {
    return this.prisma.quotationFeeRule.findMany({
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
    });
  }

  async createFeeRule(dto: CreateQuotationFeeRuleDto, actorId: number) {
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveUntil = dto.effectiveUntil ? new Date(dto.effectiveUntil) : null;
    if (effectiveUntil && effectiveUntil <= effectiveFrom) {
      throw new BadRequestException('费用规则失效时间必须晚于生效时间');
    }
    if (dto.calculationMethod === 'PER_GRAM' && dto.channel !== 'PARTNER_WAX') {
      throw new BadRequestException('按克费用仅适用于合作蜡模报价');
    }
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.quotationFeeRule.findFirst({
        where: { code: dto.code, channel: dto.channel },
        orderBy: [{ version: 'desc' }, { id: 'desc' }],
        select: { version: true },
      });
      return tx.quotationFeeRule.create({
        data: {
          code: dto.code,
          version: (latest?.version ?? 0) + 1,
          channel: dto.channel,
          waxType: dto.waxType ?? null,
          calculationMethod: dto.calculationMethod,
          unitAmount: new Prisma.Decimal(dto.unitAmount).toDecimalPlaces(2),
          enabled: dto.enabled ?? true,
          effectiveFrom,
          effectiveUntil,
          displayText: dto.displayText,
          reason: dto.reason ?? null,
          createdBy: actorId,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  listResourceBuckets() {
    return this.prisma.tradeResourceBucket.findMany({
      orderBy: [{ channel: 'asc' }, { kind: 'asc' }, { code: 'asc' }, { bucketKey: 'asc' }],
    });
  }

  listDesignFiles(customerId: number) {
    return this.prisma.cooperationDesignFile.findMany({
      where: { customerId },
      select: {
        id: true,
        customerId: true,
        productId: true,
        referenceNo: true,
        currentVersion: true,
        createdAt: true,
        updatedAt: true,
        versions: { orderBy: { version: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createResourceBucket(dto: CreateTradeResourceBucketDto, actorId: number) {
    if (dto.channel === 'RETAIL') {
      throw new BadRequestException('零售库存只能使用 Inventory，不能创建资源桶');
    }
    const bucketStart = dto.bucketStart ? new Date(dto.bucketStart) : null;
    const bucketEnd = dto.bucketEnd ? new Date(dto.bucketEnd) : null;
    if (bucketStart && bucketEnd && bucketEnd <= bucketStart) {
      throw new BadRequestException('资源桶结束时间必须晚于开始时间');
    }
    return this.prisma.tradeResourceBucket.create({
      data: {
        channel: dto.channel,
        kind: dto.kind,
        code: dto.code,
        bucketKey: dto.bucketKey,
        displayName: dto.displayName,
        unit: dto.unit,
        bucketStart,
        bucketEnd,
        availableQuantity: new Prisma.Decimal(dto.availableQuantity).toDecimalPlaces(3),
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  async updateResourceBucket(id: number, dto: UpdateTradeResourceBucketDto, actorId: number) {
    if (dto.availableQuantity === undefined && dto.isActive === undefined) {
      throw new BadRequestException('至少提供一项资源桶变更');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM trade_resource_buckets WHERE id = ${id} FOR UPDATE`);
      const current = await tx.tradeResourceBucket.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('资源桶不存在');
      if (current.version !== dto.expectedVersion) {
        throw new ConflictException('资源桶已发生变化，请刷新后重试');
      }
      const availableQuantity = dto.availableQuantity === undefined
        ? current.availableQuantity
        : new Prisma.Decimal(dto.availableQuantity).toDecimalPlaces(3);
      if (availableQuantity.lt(current.reservedQuantity)) {
        throw new ConflictException('资源总额度不能低于已经预占的数量');
      }
      const updated = await tx.tradeResourceBucket.updateMany({
        where: { id, version: dto.expectedVersion },
        data: {
          availableQuantity,
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          version: { increment: 1 },
          updatedBy: actorId,
        },
      });
      if (updated.count !== 1) throw new ConflictException('资源桶已发生变化，请刷新后重试');
      return tx.tradeResourceBucket.findUniqueOrThrow({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async createDesignFile(dto: CreateCooperationDesignFileDto, _actorId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: dto.customerId,
        status: 'ACTIVE',
        accountType: 'PARTNER',
        partnerStatus: 'APPROVED',
      },
      select: { id: true },
    });
    if (!customer) throw new BadRequestException('仅可为已通过的有效合作客户创建文件');
    return this.prisma.cooperationDesignFile.create({
      data: {
        customerId: dto.customerId,
        productId: dto.productId ?? null,
        referenceNo: dto.referenceNo,
      },
    });
  }

  async createDesignFileVersion(
    designFileId: number,
    dto: CreateCooperationDesignFileVersionDto,
    actorId: number,
  ) {
    if (dto.redWaxWeight == null && dto.purpleWaxWeight == null) {
      throw new BadRequestException('至少提供一种蜡的确认重量');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM cooperation_design_files WHERE id = ${designFileId} FOR UPDATE`);
      const file = await tx.cooperationDesignFile.findUnique({
        where: { id: designFileId },
        select: { id: true, currentVersion: true },
      });
      if (!file) throw new NotFoundException('3D 文件档案不存在');
      const mediaAsset = await tx.mediaAsset.findUnique({
        where: { id: dto.mediaAssetId },
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
      });
      if (!mediaAsset) {
        throw new BadRequestException('只能使用已登记的私有 3D 媒体资产');
      }
      await this.designMediaAuthority().readVerifiedDesignFile(mediaAsset);
      if (
        dto.checksumSha256
        && mediaAsset.checksumSha256 !== dto.checksumSha256.toLowerCase()
      ) {
        throw new BadRequestException('媒体资产校验值不匹配');
      }
      const version = file.currentVersion + 1;
      await tx.cooperationDesignFileVersion.updateMany({
        where: {
          designFileId,
          version: file.currentVersion,
          status: { in: ['SUBMITTED', 'CONFIRMED'] },
        },
        data: { status: 'SUPERSEDED' },
      });
      const created = await tx.cooperationDesignFileVersion.create({
        data: {
          designFileId,
          version,
          mediaAssetId: dto.mediaAssetId,
          status: 'SUBMITTED',
          targetGoldWeight: dto.targetGoldWeight == null
            ? null
            : new Prisma.Decimal(dto.targetGoldWeight).toDecimalPlaces(3),
          redWaxWeight: dto.redWaxWeight == null
            ? null
            : new Prisma.Decimal(dto.redWaxWeight).toDecimalPlaces(3),
          purpleWaxWeight: dto.purpleWaxWeight == null
            ? null
            : new Prisma.Decimal(dto.purpleWaxWeight).toDecimalPlaces(3),
          checksumSha256: mediaAsset.checksumSha256,
          createdBy: actorId,
        },
      });
      await tx.cooperationDesignFile.update({
        where: { id: designFileId },
        data: { currentVersion: version },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async createDesignFileVersionFromUpload(
    designFileId: number,
    file: Express.Multer.File,
    dto: Omit<CreateCooperationDesignFileVersionDto, 'mediaAssetId' | 'checksumSha256'>,
    actorId: number,
  ) {
    const mediaAsset = await this.designMediaAuthority().uploadPrivateDesignFile(file, actorId);
    try {
      return await this.createDesignFileVersion(designFileId, {
        ...dto,
        mediaAssetId: mediaAsset.mediaAssetId,
        checksumSha256: mediaAsset.checksumSha256,
      }, actorId);
    } catch (error) {
      await this.designMediaAuthority().discardUnattachedDesignFile(
        mediaAsset.mediaAssetId,
        actorId,
      );
      throw error;
    }
  }
}
