import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import type {
  CreateAttributeDto,
  CreateAttributeValueDto,
  UpdateAttributeDto,
  UpdateAttributeValueDto,
} from "./dto/attribute.dto";

type AttributeActor = Pick<StaffPrincipal, "id" | "sessionFamilyId">;

@Injectable()
export class AttributesService {
  constructor(private readonly prisma: PrismaService) {}

  private async lockAuthorizedActor(
    tx: Prisma.TransactionClient,
    actor: AttributeActor,
  ): Promise<void> {
    if (!actor || !Number.isSafeInteger(actor.id) || actor.id <= 0) {
      throw new ForbiddenException("当前员工已停用或无权访问属性管理");
    }
    const locked = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'EDITOR') FOR UPDATE`,
    );
    if (locked.length !== 1) {
      throw new ForbiddenException("当前员工已停用或无权访问属性管理");
    }
    if (actor.sessionFamilyId) {
      const sessions = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
      );
      if (sessions.length !== 1) {
        throw new ForbiddenException("当前员工会话已失效，不能访问属性管理");
      }
    }
  }

  /** 前台筛选用：仅返回启用中的属性与启用中的属性值 */
  findPublic() {
    return this.prisma.attribute.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        key: true,
        name: true,
        isFilterable: true,
        sortOrder: true,
        values: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, value: true, sortOrder: true },
        },
      },
    });
  }

  /** 管理端：返回全部属性与全部属性值（含停用，便于重新启用） */
  findAll(actor: AttributeActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);
      return tx.attribute.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          values: { orderBy: { sortOrder: "asc" } },
          _count: { select: { values: true } },
        },
      });
    });
  }

  async create(body: CreateAttributeDto, actor: AttributeActor) {
    const name = String(body?.name ?? "").trim();
    const key = String(body?.key ?? "")
      .trim()
      .toLowerCase();
    if (!name) throw new BadRequestException("属性名称不能为空");
    if (!key) throw new BadRequestException("属性键不能为空");
    if (!/^[a-z][a-z0-9_-]*$/.test(key)) {
      throw new BadRequestException(
        "属性键仅支持小写字母、数字、下划线与连字符",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);
      const exists = await tx.attribute.findUnique({ where: { key } });
      if (exists) throw new ConflictException("属性键已存在");
      return tx.attribute.create({
        data: {
          key,
          name,
          sortOrder: Number(body?.sortOrder) || 0,
          isFilterable: body?.isFilterable ?? true,
        },
      });
    });
  }

  async update(id: number, body: UpdateAttributeDto, actor: AttributeActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);
      await this.ensureAttribute(id, tx);
      return tx.attribute.update({
        where: { id },
        data: {
          ...(body?.name !== undefined ? { name: String(body.name).trim() } : {}),
          ...(body?.sortOrder !== undefined
            ? { sortOrder: Number(body.sortOrder) || 0 }
            : {}),
          ...(body?.isFilterable !== undefined
            ? { isFilterable: Boolean(body.isFilterable) }
            : {}),
          ...(body?.isActive !== undefined
            ? { isActive: Boolean(body.isActive) }
            : {}),
        },
      });
    });
  }

  /** 软删除：停用属性（保留历史引用） */
  async remove(id: number, actor: AttributeActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);
      await this.ensureAttribute(id, tx);
      return tx.attribute.update({
        where: { id },
        data: { isActive: false },
      });
    });
  }

  async addValue(
    attributeId: number,
    body: CreateAttributeValueDto,
    actor: AttributeActor,
  ) {
    const value = String(body?.value ?? "").trim();
    if (!value) throw new BadRequestException("属性值不能为空");
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);
      await this.ensureAttribute(attributeId, tx);
      const exists = await tx.attributeValue.findUnique({
        where: { attributeId_value: { attributeId, value } },
      });
      if (exists) throw new ConflictException("属性值已存在");
      return tx.attributeValue.create({
        data: { attributeId, value, sortOrder: Number(body?.sortOrder) || 0 },
      });
    });
  }

  async updateValue(
    valueId: number,
    body: UpdateAttributeValueDto,
    actor: AttributeActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);
      const val = await tx.attributeValue.findUnique({
        where: { id: valueId },
      });
      if (!val) throw new NotFoundException("属性值不存在");
      return tx.attributeValue.update({
        where: { id: valueId },
        data: {
          ...(body?.value !== undefined
            ? { value: String(body.value).trim() }
            : {}),
          ...(body?.sortOrder !== undefined
            ? { sortOrder: Number(body.sortOrder) || 0 }
            : {}),
          ...(body?.isActive !== undefined
            ? { isActive: Boolean(body.isActive) }
            : {}),
        },
      });
    });
  }

  async removeValue(valueId: number, actor: AttributeActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);
      const val = await tx.attributeValue.findUnique({
        where: { id: valueId },
      });
      if (!val) throw new NotFoundException("属性值不存在");
      return tx.attributeValue.update({
        where: { id: valueId },
        data: { isActive: false },
      });
    });
  }

  private async ensureAttribute(id: number, tx: Prisma.TransactionClient) {
    const attr = await tx.attribute.findUnique({ where: { id } });
    if (!attr) throw new NotFoundException("属性不存在");
    return attr;
  }
}
