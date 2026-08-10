import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });
  }

  async findTree() {
    const categories = await this.prisma.category.findMany({
      where: { level: 1, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            children: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    });
    return categories;
  }

  /** 管理端分类树：保留已停用的二、三级类目，便于重新启用。 */
  async findManageTree() {
    return this.prisma.category.findMany({
      where: { level: 1 },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: { select: { children: true, products: true } },
            children: {
              orderBy: { sortOrder: 'asc' },
              include: { _count: { select: { children: true, products: true } } },
            },
          },
        },
      },
    });
  }

  private async getParentCategory(parentId: unknown, expectedLevel: 1 | 2) {
    const id = Number(parentId);
    if (!Number.isInteger(id)) {
      throw new BadRequestException(`请选择${expectedLevel === 1 ? '一级' : '二级'}类目`);
    }

    const parent = await this.prisma.category.findUnique({ where: { id } });
    if (!parent || parent.level !== expectedLevel) {
      throw new BadRequestException(
        `${expectedLevel === 1 ? '二级' : '三级'}类目只能归属到${expectedLevel === 1 ? '一级' : '二级'}类目`,
      );
    }
    return parent;
  }

  private categoryData(data: any, level: 2 | 3) {
    const name = data.name === undefined ? undefined : String(data.name).trim();
    const slug = data.slug === undefined ? undefined : String(data.slug).trim();
    const sortOrder = data.sortOrder === undefined ? undefined : Number(data.sortOrder);

    if (name !== undefined && !name) {
      throw new BadRequestException(`${level === 2 ? '二级' : '三级'}类目名称不能为空`);
    }
    if (slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException('Slug 仅支持小写字母、数字和连字符');
    }
    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0)) {
      throw new BadRequestException('排序必须是大于或等于 0 的整数');
    }
    if (data.isActive !== undefined && typeof data.isActive !== 'boolean') {
      throw new BadRequestException('启用状态格式错误');
    }

    return {
      name,
      slug,
      icon: data.icon === undefined ? undefined : String(data.icon).trim(),
      coverImage: data.coverImage === undefined ? undefined : String(data.coverImage).trim(),
      sortOrder,
      isActive: data.isActive,
    };
  }

  private async ensureSlugAvailable(slug: string | undefined, excludeId?: number) {
    if (!slug) return;
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('该 Slug 已被其他类目使用');
    }
  }

  async create(data: any) {
    const parentId = Number(data.parentId);
    const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
    if (!parent || ![1, 2].includes(parent.level)) {
      throw new BadRequestException('请选择一级或二级类目作为归属');
    }
    const level = (parent.level + 1) as 2 | 3;
    const categoryData = this.categoryData(data, level);
    if (!categoryData.name || !categoryData.slug) {
      throw new BadRequestException(`请填写${level === 2 ? '二级' : '三级'}类目名称和 Slug`);
    }
    await this.ensureSlugAvailable(categoryData.slug);
    return this.prisma.category.create({
      data: {
        ...categoryData,
        name: categoryData.name!,
        slug: categoryData.slug!,
        parentId: parent.id,
        level,
      },
    });
  }

  async update(id: number, data: any) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('类目不存在');
    if (![2, 3].includes(category.level)) {
      throw new BadRequestException('一级类目为固定类目，不支持编辑');
    }
    if (data.level !== undefined && Number(data.level) !== category.level) {
      throw new BadRequestException('不支持调整类目层级');
    }

    const level = category.level as 2 | 3;
    const categoryData = this.categoryData(data, level);
    await this.ensureSlugAvailable(categoryData.slug, id);

    const parent = data.parentId === undefined
      ? undefined
      : await this.getParentCategory(data.parentId, (level - 1) as 1 | 2);
    return this.prisma.category.update({
      where: { id },
      data: {
        ...categoryData,
        ...(parent ? { parentId: parent.id } : {}),
      },
    });
  }

  async delete(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            // 仅统计未软删除的子分类与商品，否则全是已删除商品时分类无法停用
            children: { where: { deletedAt: null } },
            products: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!category) throw new NotFoundException('类目不存在');
    if (![2, 3].includes(category.level)) {
      throw new BadRequestException('一级类目为固定类目，不支持删除');
    }
    if (category._count.children > 0 || category._count.products > 0) {
      throw new BadRequestException('该类目仍关联下级分类或商品，不能停用');
    }
    return this.prisma.category.update({ where: { id }, data: { isActive: false } });
  }
}
