import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class AttributesService {
  constructor(private readonly prisma: PrismaService) {}

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
  findAll() {
    return this.prisma.attribute.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        values: { orderBy: { sortOrder: "asc" } },
        _count: { select: { values: true } },
      },
    });
  }

  async create(body: any) {
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
    const exists = await this.prisma.attribute.findUnique({ where: { key } });
    if (exists) throw new ConflictException("属性键已存在");
    return this.prisma.attribute.create({
      data: {
        key,
        name,
        sortOrder: Number(body?.sortOrder) || 0,
        isFilterable: body?.isFilterable ?? true,
      },
    });
  }

  async update(id: number, body: any) {
    await this.ensureAttribute(id);
    return this.prisma.attribute.update({
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
  }

  /** 软删除：停用属性（保留历史引用） */
  async remove(id: number) {
    await this.ensureAttribute(id);
    return this.prisma.attribute.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async addValue(attributeId: number, body: any) {
    await this.ensureAttribute(attributeId);
    const value = String(body?.value ?? "").trim();
    if (!value) throw new BadRequestException("属性值不能为空");
    const exists = await this.prisma.attributeValue.findUnique({
      where: { attributeId_value: { attributeId, value } },
    });
    if (exists) throw new ConflictException("属性值已存在");
    return this.prisma.attributeValue.create({
      data: { attributeId, value, sortOrder: Number(body?.sortOrder) || 0 },
    });
  }

  async updateValue(valueId: number, body: any) {
    const val = await this.prisma.attributeValue.findUnique({
      where: { id: valueId },
    });
    if (!val) throw new NotFoundException("属性值不存在");
    return this.prisma.attributeValue.update({
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
  }

  async removeValue(valueId: number) {
    const val = await this.prisma.attributeValue.findUnique({
      where: { id: valueId },
    });
    if (!val) throw new NotFoundException("属性值不存在");
    return this.prisma.attributeValue.update({
      where: { id: valueId },
      data: { isActive: false },
    });
  }

  private async ensureAttribute(id: number) {
    const attr = await this.prisma.attribute.findUnique({ where: { id } });
    if (!attr) throw new NotFoundException("属性不存在");
    return attr;
  }
}
