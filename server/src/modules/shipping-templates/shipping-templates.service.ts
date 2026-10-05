import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import { ProductsService } from "../products/products.service";
import { CreateShippingTemplateDto, UpdateShippingTemplateDto } from "./dto/shipping-template.dto";

type ShippingTemplateActor = Pick<StaffPrincipal, "id" | "sessionFamilyId">;
type ShippingTemplateAction = "READ" | "WRITE";

const toCreateData = (dto: CreateShippingTemplateDto) =>
  ({
    name: dto.name,
    carrier: dto.carrier,
    feeMode: dto.feeMode,
    baseFee: dto.baseFee,
    remoteSurcharge: dto.remoteSurcharge,
    freeShippingThreshold: dto.freeShippingThreshold,
    excludedRegions: dto.excludedRegions,
    insured: dto.insured,
    signatureRequired: dto.signatureRequired,
    isDefault: dto.isDefault,
    isActive: dto.isActive,
  }) satisfies Prisma.ShippingTemplateUncheckedCreateInput;

const toUpdateData = (dto: UpdateShippingTemplateDto) =>
  ({
    name: dto.name,
    carrier: dto.carrier,
    feeMode: dto.feeMode,
    baseFee: dto.baseFee,
    remoteSurcharge: dto.remoteSurcharge,
    freeShippingThreshold: dto.freeShippingThreshold,
    excludedRegions: dto.excludedRegions,
    insured: dto.insured,
    signatureRequired: dto.signatureRequired,
    isDefault: dto.isDefault,
    isActive: dto.isActive,
  }) satisfies Prisma.ShippingTemplateUncheckedUpdateInput;

async function clearOtherDefaultTemplates(
  tx: Prisma.TransactionClient,
  exceptId?: number,
): Promise<number[]> {
  const previousDefaults = await tx.shippingTemplate.findMany({
    where: {
      isDefault: true,
      ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
    },
    select: { id: true },
  });
  const ids = previousDefaults.map((template) => template.id);
  if (ids.length > 0) {
    await tx.shippingTemplate.updateMany({
      where: { id: { in: ids } },
      data: { isDefault: false },
    });
  }
  return ids;
}

async function invalidateReferencedProductQuality(
  tx: Prisma.TransactionClient,
  shippingTemplateIds: number[],
): Promise<number[]> {
  const ids = [...new Set(shippingTemplateIds)];
  if (ids.length === 0) return [];
  // 先锁定全部引用商品，而不是只锁当前 READY 行：这样并发发布也不能在模板
  // 变化与质量失效之间把旧模板事实重新写成 READY。
  const referencedProducts = await tx.$queryRaw<Array<{
    id: number;
    publicationQualityStatus: "QUARANTINED" | "READY";
  }>>(
    Prisma.sql`SELECT id, publication_quality_status AS publicationQualityStatus FROM products WHERE shipping_template_id IN (${Prisma.join(ids)}) FOR UPDATE`,
  );
  const readyProductIds = referencedProducts
    .filter((product) => product.publicationQualityStatus === "READY")
    .map((product) => product.id);
  if (readyProductIds.length === 0) return [];
  const invalidated = await tx.product.updateMany({
    where: {
      id: { in: readyProductIds },
      publicationQualityStatus: "READY",
    },
    data: {
      publicationQualityStatus: "QUARANTINED",
      publicationQualityHash: null,
      publicationQualityCheckedAt: null,
    },
  });
  if (invalidated.count !== readyProductIds.length) {
    throw new ConflictException("引用商品状态已变化，请重试配送模板修改");
  }
  return readyProductIds;
}

@Injectable()
export class ShippingTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  private async lockAuthorizedActor(
    tx: Prisma.TransactionClient,
    actor: ShippingTemplateActor,
    action: ShippingTemplateAction,
  ): Promise<void> {
    if (!actor || !Number.isSafeInteger(actor.id) || actor.id <= 0) {
      throw new ForbiddenException("当前员工已停用或无权访问运费模板");
    }
    const locked = action === "READ"
      ? await tx.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'EDITOR') FOR SHARE`,
        )
      : await tx.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR UPDATE`,
        );
    if (locked.length !== 1) {
      throw new ForbiddenException("当前员工已停用或无权访问运费模板");
    }
    if (actor.sessionFamilyId) {
      const sessions = action === "READ"
        ? await tx.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
          )
        : await tx.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
          );
      if (sessions.length !== 1) {
        throw new ForbiddenException("当前员工会话已失效，不能访问运费模板");
      }
    }
  }

  list(actor: ShippingTemplateActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor, "READ");
      return tx.shippingTemplate.findMany({
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      });
    });
  }

  async create(dto: CreateShippingTemplateDto, actor: ShippingTemplateActor) {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor, "WRITE");
      const changedDefaultIds = dto.isDefault
        ? await clearOtherDefaultTemplates(tx)
        : [];
      const created = await tx.shippingTemplate.create({ data: toCreateData(dto) });
      const changedProductIds = await invalidateReferencedProductQuality(
        tx,
        changedDefaultIds,
      );
      return { created, changedProductIds };
    });
    result.changedProductIds.forEach((productId) =>
      this.productsService.notifyTradeProductChanged(productId),
    );
    return result.created;
  }

  async update(
    id: number,
    dto: UpdateShippingTemplateDto,
    actor: ShippingTemplateActor,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor, "WRITE");
      const lockedTemplate = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM shipping_templates WHERE id = ${id} FOR UPDATE`,
      );
      if (lockedTemplate.length !== 1) {
        throw new NotFoundException("运费模板不存在");
      }
      const existing = await tx.shippingTemplate.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException("运费模板不存在");
      if (dto.isActive === false && existing.isActive !== false) {
        const activePublishedProducts = await tx.product.count({
          where: {
            shippingTemplateId: id,
            deletedAt: null,
            status: "PUBLISHED",
            publicationQualityStatus: "READY",
            salesMode: "DIRECT_PURCHASE",
          },
        });
        if (activePublishedProducts > 0) {
          throw new ConflictException(
            `该模板仍被 ${activePublishedProducts} 个可交易上架商品使用，请先更换商品配送模板`,
          );
        }
      }
      const changedDefaultIds = dto.isDefault
        ? await clearOtherDefaultTemplates(tx, id)
        : [];
      const updated = await tx.shippingTemplate.update({ where: { id }, data: toUpdateData(dto) });
      // 发布质量 hash 包含运费模板的完整服务事实及其 revision（updatedAt）。
      // 模板和引用商品必须在同一事务内失效，避免模板已变化但公开查询仍消费旧 READY 的窗口。
      const changedProductIds = await invalidateReferencedProductQuality(
        tx,
        [id, ...changedDefaultIds],
      );
      return { updated, changedProductIds };
    });
    result.changedProductIds.forEach((productId) =>
      this.productsService.notifyTradeProductChanged(productId),
    );
    return result.updated;
  }
}
