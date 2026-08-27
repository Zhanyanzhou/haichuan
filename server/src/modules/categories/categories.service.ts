import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Category } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { customerFacingProductWhereForVisibilities } from '../products/product-eligibility';

type ManageCategoryNode = Category & {
  products: Array<{ id: number }>;
  children?: ManageCategoryNode[];
  _count?: { children: number; products: number };
};

type AnnotatedManageCategoryNode = Omit<ManageCategoryNode, 'products' | 'children'> & {
  children: AnnotatedManageCategoryNode[];
  hasPublicProduct: boolean;
};

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private retainPublicBranches<T extends { id: number; children?: T[] }>(
    nodes: T[],
    publicCategoryIds: Set<number>,
  ): T[] {
    return nodes.flatMap((node) => {
      const children = this.retainPublicBranches(
        node.children ?? [],
        publicCategoryIds,
      );
      if (!publicCategoryIds.has(node.id) && children.length === 0) return [];
      return [{ ...node, children } as T];
    });
  }

  private async findPublicProductCategoryIds(): Promise<Set<number>> {
    const categories = await this.prisma.product.findMany({
      where: {
        ...customerFacingProductWhereForVisibilities(['PUBLIC']),
        category: { isActive: true, deletedAt: null },
      },
      select: { categoryId: true },
      distinct: ['categoryId'],
    });
    return new Set(categories.map(({ categoryId }) => categoryId));
  }

  async findAll() {
    const [categories, directPublicIds] = await Promise.all([
      this.prisma.category.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        include: {
          children: {
            where: { isActive: true, deletedAt: null },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      this.findPublicProductCategoryIds(),
    ]);
    const byId = new Map(categories.map((category) => [category.id, category]));
    const publicIds = new Set(directPublicIds);
    for (const categoryId of directPublicIds) {
      let parentId = byId.get(categoryId)?.parentId;
      while (parentId) {
        publicIds.add(parentId);
        parentId = byId.get(parentId)?.parentId;
      }
    }
    return categories
      .filter(({ id }) => publicIds.has(id))
      .map((category) => ({
        ...category,
        children: category.children.filter(({ id }) => publicIds.has(id)),
      }));
  }

  async findTree() {
    const [categories, publicCategoryIds] = await Promise.all([
      this.prisma.category.findMany({
        where: { level: 1, isActive: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        include: {
          children: {
            where: { isActive: true, deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            include: {
              children: {
                where: { isActive: true, deletedAt: null },
                orderBy: { sortOrder: 'asc' },
                include: {
                  children: {
                    where: { isActive: true, deletedAt: null },
                    orderBy: { sortOrder: 'asc' },
                  },
                },
              },
            },
          },
        },
      }),
      this.findPublicProductCategoryIds(),
    ]);
    return this.retainPublicBranches(categories, publicCategoryIds);
  }

  /** 管理端分类树：保留已停用的二、三级类目，便于重新启用。 */
  async findManageTree() {
    const publicProducts = {
      where: customerFacingProductWhereForVisibilities(['PUBLIC']),
      take: 1,
      select: { id: true },
    };
    const categories = await this.prisma.category.findMany({
      where: { level: 1 },
      orderBy: { sortOrder: 'asc' },
      include: {
        products: publicProducts,
        children: {
          orderBy: { sortOrder: 'asc' },
          include: {
            products: publicProducts,
            _count: { select: { children: true, products: true } },
            children: {
              orderBy: { sortOrder: 'asc' },
              include: {
                products: publicProducts,
                _count: { select: { children: true, products: true } },
              },
            },
          },
        },
      },
    });
    const annotate = (node: ManageCategoryNode): AnnotatedManageCategoryNode => {
      const children = (node.children ?? []).map(annotate);
      const hasPublicProduct =
        (node.products?.length ?? 0) > 0 ||
        children.some((child) => child.hasPublicProduct);
      const { products: _products, ...rest } = node;
      return { ...rest, children, hasPublicProduct };
    };
    return categories.map(annotate);
  }

  async resolveReferences(inputSlugs: string[]) {
    const slugs = inputSlugs
      .map((slug) => slug.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (slugs.length === 0) return [];

    const categories = await this.prisma.category.findMany({
      select: {
        id: true,
        parentId: true,
        slug: true,
        name: true,
        level: true,
        coverImage: true,
        isActive: true,
        deletedAt: true,
        products: {
          where: {
            ...customerFacingProductWhereForVisibilities(['PUBLIC']),
          },
          take: 1,
          select: { id: true },
        },
      },
    });
    const byId = new Map(categories.map((category) => [category.id, category]));
    const publicBranchIds = new Set<number>();
    for (const category of categories) {
      if (category.deletedAt || !category.isActive || category.products.length === 0) continue;
      let current: (typeof categories)[number] | undefined = category;
      while (current) {
        publicBranchIds.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }
    const bySlug = new Map(categories.map((category) => [category.slug, category]));

    return slugs.map((slug) => {
      const category = bySlug.get(slug);
      if (!category) {
        return { slug, eligible: false, reason: 'NOT_FOUND' as const };
      }
      const reason = category.deletedAt
        ? 'DELETED'
        : !category.isActive
          ? 'INACTIVE'
          : !publicBranchIds.has(category.id)
            ? 'NO_PUBLIC_PRODUCT'
            : !category.coverImage
              ? 'MISSING_COVER'
              : 'AVAILABLE';
      return {
        slug,
        id: category.id,
        name: category.name,
        level: category.level,
        coverImage: category.coverImage,
        eligible: reason === 'AVAILABLE',
        reason,
      };
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

  private categoryData(data: CreateCategoryDto | UpdateCategoryDto, level: 1 | 2 | 3) {
    const name = data.name === undefined ? undefined : String(data.name).trim();
    const slug = data.slug === undefined ? undefined : String(data.slug).trim();
    const sortOrder = data.sortOrder === undefined ? undefined : Number(data.sortOrder);
    const label = ['一级', '二级', '三级'][level - 1];

    if (name !== undefined && !name) {
      throw new BadRequestException(`${label}类目名称不能为空`);
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

  async create(data: CreateCategoryDto) {
    const hasParent = data.parentId !== undefined && data.parentId !== null;

    // 创建一级类目（parentId 为空）
    if (!hasParent) {
      const level = 1 as const;
      const categoryData = this.categoryData(data, level);
      if (!categoryData.name || !categoryData.slug) {
        throw new BadRequestException('请填写一级类目名称和 Slug');
      }
      await this.ensureSlugAvailable(categoryData.slug);
      return this.prisma.category.create({
        data: {
          ...categoryData,
          name: categoryData.name!,
          slug: categoryData.slug!,
          level: 1,
          parentId: null,
        },
      });
    }

    // 创建二/三级类目
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

  async update(id: number, data: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('类目不存在');
    if (data.level !== undefined && Number(data.level) !== category.level) {
      throw new BadRequestException('不支持调整类目层级');
    }
    // 一级类目不支持调整归属（本轮不做跨级迁移）
    if (
      category.level === 1 &&
      data.parentId !== undefined &&
      data.parentId !== null
    ) {
      throw new BadRequestException('一级类目不支持调整归属');
    }

    const level = category.level as 1 | 2 | 3;
    const categoryData = this.categoryData(data, level);
    await this.ensureSlugAvailable(categoryData.slug, id);

    const parent =
      category.level === 1 || data.parentId === undefined
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
    if (category._count.children > 0 || category._count.products > 0) {
      throw new BadRequestException('该类目仍关联下级分类或商品，不能停用');
    }
    return this.prisma.category.update({ where: { id }, data: { isActive: false } });
  }

  /** 批量调整分类排序（仅同级 sortOrder，事务保证原子性）。 */
  async reorder(items: { id: number; sortOrder: number }[]) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('排序数据不能为空');
    }
    const seen = new Set<number>();
    for (const it of items) {
      if (!Number.isInteger(it.id) || it.id <= 0) {
        throw new BadRequestException('分类 ID 不合法');
      }
      if (!Number.isInteger(it.sortOrder) || it.sortOrder < 0) {
        throw new BadRequestException('排序值必须为非负整数');
      }
      if (seen.has(it.id)) {
        throw new BadRequestException('排序数据存在重复分类');
      }
      seen.add(it.id);
    }
    await this.prisma.$transaction(
      items.map((it) =>
        this.prisma.category.update({
          where: { id: it.id },
          data: { sortOrder: it.sortOrder },
        }),
      ),
    );
    return { success: true, updated: items.length };
  }
}
