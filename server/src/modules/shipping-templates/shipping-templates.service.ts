import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateShippingTemplateDto, UpdateShippingTemplateDto } from "./dto/shipping-template.dto";

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

@Injectable()
export class ShippingTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.shippingTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });
  }

  async create(dto: CreateShippingTemplateDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.shippingTemplate.updateMany({ data: { isDefault: false } });
      }
      return tx.shippingTemplate.create({ data: toCreateData(dto) });
    });
  }

  async update(id: number, dto: UpdateShippingTemplateDto) {
    const existing = await this.prisma.shippingTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("运费模板不存在");
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.shippingTemplate.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      }
      return tx.shippingTemplate.update({ where: { id }, data: toUpdateData(dto) });
    });
  }
}
