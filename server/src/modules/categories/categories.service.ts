import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Category } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CATEGORY_SIZE_RULES, readCategoryPublicationRules } from './category-publication-rules';
import {
  customerFacingProductWhereForVisibilities,
  staffWorkingProductWhere,
} from '../products/product-eligibility';

type ManageCategoryNode = Category & {
  products: Array<{ id: number }>;
  children?: ManageCategoryNode[];
  _count?: { children: number; products: number };
};

type AnnotatedManageCategoryNode = Omit<ManageCategoryNode, 'products' | 'children'> & {
  children: AnnotatedManageCategoryNode[];
  hasPublicProduct: boolean;
  manageableProductCount: number;
  isUncategorized?: true;
};

type CategoryActor = Pick<StaffPrincipal, 'id' | 'sessionFamilyId'>;
type CategoryDb = Prisma.TransactionClient | PrismaService;
const UNCATEGORIZED_SLUG = 'system-uncategorized';
const UNCATEGORIZED_NAME = '未分类';

const PUBLIC_CATEGORY_FIELDS = {
  id: true,
  name: true,
  slug: true,
  level: true,
  parentId: true,
  icon: true,
  coverImage: true,
  sortOrder: true,
  seoTitle: true,
  seoDesc: true,
  seoKeywords: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

function normalizePublicationRules(value: unknown) {
  const rules = readCategoryPublicationRules(value);
  if (value != null && (!Array.isArray(value) || rules.length !== value.length)) {
    throw new BadRequestException('请选择有效且不重复的商品发布规则');
  }
  if (rules.includes('GROUP_ONLY') && rules.length > 1) {
    throw new BadRequestException('仅用于组织的分类不能同时设置商品资料要求');
  }
  if (CATEGORY_SIZE_RULES.filter((rule) => rules.includes(rule)).length > 1) {
    throw new BadRequestException('请选择一种适用的尺寸要求');
  }
  return rules;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private async lockAuthorizedActor(
    tx: Prisma.TransactionClient,
    actor: CategoryActor,
  ): Promise<void> {
    if (!actor || !Number.isSafeInteger(actor.id) || actor.id <= 0) {
      throw new ForbiddenException('当前员工已停用或无权访问分类管理');
    }
    const locked = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'EDITOR') FOR UPDATE`,
    );
    if (locked.length !== 1) {
      throw new ForbiddenException('当前员工已停用或无权访问分类管理');
    }
    if (actor.sessionFamilyId) {
      const sessions = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
      );
      if (sessions.length !== 1) {
        throw new ForbiddenException('当前员工会话已失效，不能访问分类管理');
      }
    }
  }

  /** 选款中心与分类管理共用启用中的分类。没有公开商品的分类也保留。 */
  async findAll() {
    return this.prisma.category.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: {
        ...PUBLIC_CATEGORY_FIELDS,
        children: {
          where: { isActive: true, deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: PUBLIC_CATEGORY_FIELDS,
        },
      },
    });
  }

  async findTree() {
    const active = { isActive: true, deletedAt: null };
    return this.prisma.category.findMany({
      where: { level: 1, ...active },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: {
        ...PUBLIC_CATEGORY_FIELDS,
        children: {
          where: active,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            ...PUBLIC_CATEGORY_FIELDS,
            children: {
              where: active,
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              select: {
                ...PUBLIC_CATEGORY_FIELDS,
                children: {
                  where: active,
                  orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                  select: PUBLIC_CATEGORY_FIELDS,
                },
              },
            },
          },
        },
      },
    });
  }

  /** 管理端分类树。不在前台且没有下级和商品的分类会先物理删除。 */
  async findManageTree(actor: CategoryActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);
      await this.removeRetiredEmpty(tx);
      const publicProducts = {
        where: customerFacingProductWhereForVisibilities(['PUBLIC']),
        take: 1,
        select: { id: true },
      };
      const categories = await tx.category.findMany({
        where: { level: 1 },
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: { select: { children: true, products: true } },
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
      const collectIds = (nodes: ManageCategoryNode[]): number[] =>
        nodes.flatMap((node) => [node.id, ...collectIds(node.children ?? [])]);
      const ids = collectIds(categories);
      const counts = ids.length ? await tx.product.groupBy({
        by: ['categoryId'],
        where: { ...staffWorkingProductWhere, categoryId: { in: ids } },
        _count: { _all: true },
      }) : [];
      const manageableCounts = new Map(counts.map((row) => [row.categoryId, row._count._all]));
      const annotate = (node: ManageCategoryNode): AnnotatedManageCategoryNode => {
        const children = (node.children ?? []).map(annotate);
        const hasPublicProduct =
          (node.products?.length ?? 0) > 0 ||
          children.some((child) => child.hasPublicProduct);
        const { products: _products, ...rest } = node;
        return {
          ...rest,
          children,
          hasPublicProduct,
          manageableProductCount: manageableCounts.get(node.id) ?? 0,
          ...(node.slug === UNCATEGORIZED_SLUG ? { isUncategorized: true as const } : {}),
        };
      };
      return categories.map(annotate);
    });
  }

  async resolveReferences(inputSlugs: string[], actor: CategoryActor) {
    const slugs = inputSlugs
      .map((slug) => slug.trim())
      .filter(Boolean)
      .slice(0, 20);
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);
      if (slugs.length === 0) return [];

      const categories = await tx.category.findMany({
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
    });
  }

  private async getParentCategory(
    parentId: unknown,
    expectedLevel: 1 | 2,
    db: CategoryDb,
  ) {
    const id = Number(parentId);
    if (!Number.isInteger(id)) {
      throw new BadRequestException(`请选择${expectedLevel === 1 ? '一级' : '二级'}类目`);
    }

    const parent = await db.category.findUnique({ where: { id } });
    if (parent?.slug === UNCATEGORIZED_SLUG) {
      throw new BadRequestException('不能在「未分类」下添加分类');
    }
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

    const publicationRules = data.publicationRules === undefined
      ? undefined
      : normalizePublicationRules(data.publicationRules);

    return {
      name,
      slug,
      icon: data.icon === undefined ? undefined : String(data.icon).trim(),
      coverImage: data.coverImage === undefined ? undefined : String(data.coverImage).trim(),
      sortOrder,
      isActive: data.isActive,
      ...(publicationRules && {
        publicationRules: publicationRules.length ? publicationRules : Prisma.DbNull,
      }),
    };
  }

  private async ensureSlugAvailable(
    slug: string | undefined,
    db: CategoryDb,
    excludeId?: number,
  ) {
    if (!slug) return;
    if (slug === UNCATEGORIZED_SLUG) {
      throw new ConflictException('该 Slug 为系统「未分类」保留');
    }
    const existing = await db.category.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('该 Slug 已被其他类目使用');
    }
  }

  async create(data: CreateCategoryDto, actor: CategoryActor) {
    const hasParent = data.parentId !== undefined && data.parentId !== null;
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);

      // 创建一级类目（parentId 为空）
      if (!hasParent) {
        const level = 1 as const;
        const categoryData = this.categoryData(data, level);
        if (!categoryData.name || !categoryData.slug) {
          throw new BadRequestException('请填写一级类目名称和 Slug');
        }
        await this.ensureSlugAvailable(categoryData.slug, tx);
        return tx.category.create({
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
      const parent = await tx.category.findUnique({ where: { id: parentId } });
      if (parent?.slug === UNCATEGORIZED_SLUG) {
        throw new BadRequestException('不能在「未分类」下添加分类');
      }
      if (!parent || ![1, 2].includes(parent.level)) {
        throw new BadRequestException('请选择一级或二级类目作为归属');
      }
      const level = (parent.level + 1) as 2 | 3;
      const categoryData = this.categoryData(data, level);
      if (!categoryData.name || !categoryData.slug) {
        throw new BadRequestException(`请填写${level === 2 ? '二级' : '三级'}类目名称和 Slug`);
      }
      await this.ensureSlugAvailable(categoryData.slug, tx);
      return tx.category.create({
        data: {
          ...categoryData,
          name: categoryData.name!,
          slug: categoryData.slug!,
          parentId: parent.id,
          level,
        },
      });
    });
  }

  async update(id: number, data: UpdateCategoryDto, actor: CategoryActor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);
      if (data.publicationRules !== undefined) {
        if (data.expectedPublicationRules === undefined) {
          throw new BadRequestException('请重新加载分类后再保存商品发布规则');
        }
        await tx.$queryRaw(Prisma.sql`SELECT id FROM categories WHERE id = ${id} FOR UPDATE`);
      }
      const category = await tx.category.findUnique({ where: { id } });
      if (!category) throw new NotFoundException('类目不存在');
      if (category.slug === UNCATEGORIZED_SLUG) {
        throw new BadRequestException('不能编辑系统「未分类」');
      }
      if (
        data.publicationRules !== undefined
        && normalizePublicationRules(data.expectedPublicationRules).join(',')
          !== readCategoryPublicationRules(category.publicationRules).join(',')
      ) {
        throw new ConflictException('商品发布规则已被其他操作更新，请重新加载分类后再试');
      }
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
      await this.ensureSlugAvailable(categoryData.slug, tx, id);

      // 旧数据上的停用入口。有下级或商品时不能停用，避免导航消失但商品仍可被找到。
      // 后台「删除」走 delete()：下级款式一并删除；仍有商品时先改归属。
      if (categoryData.isActive === false) {
        await this.assertDeactivatable(id, tx);
      }

      const parent =
        category.level === 1 || data.parentId === undefined
          ? undefined
          : await this.getParentCategory(data.parentId, (level - 1) as 1 | 2, tx);
      return tx.category.update({
        where: { id },
        data: {
          ...categoryData,
          ...(parent ? { parentId: parent.id } : {}),
        },
      });
    });
  }

  /** 停用前检查：仍有关联的未软删除子分类或商品时拒绝。 */
  private async assertDeactivatable(id: number, db: CategoryDb) {
    const category = await db.category.findUnique({
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
    if (category && (category._count.children > 0 || category._count.products > 0)) {
      throw new BadRequestException('该类目仍关联下级分类或商品，不能停用');
    }
  }

  /** 不在前台、且没有下级和商品的分类直接删掉，列表里不再保留。 */
  private async removeRetiredEmpty(db: CategoryDb) {
    for (let depth = 0; depth < 4; depth += 1) {
      const retired = await db.category.findMany({
        where: {
          isActive: false,
          slug: { not: UNCATEGORIZED_SLUG },
          children: { none: {} },
          products: { none: {} },
        },
        select: { id: true },
      });
      if (retired.length === 0) return;
      await db.category.deleteMany({
        where: { id: { in: retired.map((item) => item.id) } },
      });
    }
  }

  private subtreeIds(
    categories: Array<{ id: number; parentId: number | null }>,
    rootId: number,
  ): number[] {
    const childrenByParent = new Map<number, number[]>();
    for (const category of categories) {
      if (category.parentId == null) continue;
      const children = childrenByParent.get(category.parentId) ?? [];
      children.push(category.id);
      childrenByParent.set(category.parentId, children);
    }
    const ids: number[] = [];
    const walk = (categoryId: number) => {
      ids.push(categoryId);
      for (const childId of childrenByParent.get(categoryId) ?? []) walk(childId);
    };
    walk(rootId);
    return ids;
  }

  /** 并发首次创建可能争用唯一 slug，整个删除事务可安全重试一次。 */
  async delete(id: number, actor: CategoryActor, moveTo?: number) {
    try {
      return await this.deleteInTransaction(id, actor, moveTo);
    } catch (error) {
      if (moveTo === undefined && error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === 'P2002' || error.code === 'P2034')) {
        return this.deleteInTransaction(id, actor, moveTo);
      }
      throw error;
    }
  }

  /** 归属转移和分类删除在同一事务内完成，商品和其生命周期状态均保留。 */
  private async deleteInTransaction(id: number, actor: CategoryActor, moveTo?: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);
      const categories = await tx.category.findMany({
        select: { id: true, parentId: true, slug: true },
      });
      if (!categories.some((category) => category.id === id)) {
        throw new NotFoundException('分类不存在');
      }
      const subtree = this.subtreeIds(categories, id);
      const subtreeSet = new Set(subtree);
      if (categories.some((category) => subtreeSet.has(category.id) && category.slug === UNCATEGORIZED_SLUG)) {
        throw new BadRequestException('不能删除系统「未分类」');
      }
      const sourceProducts = { categoryId: { in: subtree } };
      const productCount = await tx.product.count({ where: sourceProducts });
      let movedProductCount = 0;
      let uncategorizedCategoryId: number | undefined;
      if (productCount > 0) {
        let destinationId = moveTo;
        let requireUnpublished = false;
        if (destinationId === undefined) {
          const fallback = await tx.category.upsert({
            where: { slug: UNCATEGORIZED_SLUG },
            create: { name: UNCATEGORIZED_NAME, slug: UNCATEGORIZED_SLUG, isActive: false, sortOrder: 2_147_483_647 },
            update: {},
          });
          if (fallback.name !== UNCATEGORIZED_NAME || fallback.level !== 1 || fallback.parentId !== null
            || fallback.isActive || fallback.deletedAt) {
            throw new ConflictException('系统「未分类」不可用，分类未删除');
          }
          destinationId = uncategorizedCategoryId = fallback.id;
        } else {
          if (subtreeSet.has(destinationId)) {
            throw new BadRequestException('要改去的分类不存在，或就在即将删除的分类里');
          }
          // 锁定目标分类的当前规则，避免按事务较早的分类树快照绕过规则变更。
          const [destination] = await tx.$queryRaw<Array<{ publicationRules: Prisma.JsonValue }>>(
            Prisma.sql`SELECT publication_rules AS publicationRules FROM categories
              WHERE id = ${destinationId} AND is_active = true AND deleted_at IS NULL
                AND slug <> ${UNCATEGORIZED_SLUG} FOR SHARE`,
          );
          if (!destination) throw new BadRequestException('请选择已启用且不在删除范围内的目标分类');
          const rules = readCategoryPublicationRules(destination.publicationRules);
          if (rules.includes('GROUP_ONLY')) throw new BadRequestException('仅用于组织的分类不能接收商品');
          requireUnpublished = rules.length > 0;
        }
        const moved = await tx.product.updateMany({
          // UPDATE 使用当前状态，拒绝刚被其他操作上架的商品一并改类目。
          where: requireUnpublished ? { ...sourceProducts, status: { not: 'PUBLISHED' } } : sourceProducts,
          data: { categoryId: destinationId },
        });
        if (requireUnpublished && moved.count !== productCount) {
          throw new ConflictException('仍有已上架商品或商品归属已变化，请先在商品管理调整分类，再删除');
        }
        movedProductCount = moved.count;
      }

      const childrenByParent = new Map<number, number[]>();
      for (const category of categories) {
        if (category.parentId == null) continue;
        const children = childrenByParent.get(category.parentId) ?? [];
        children.push(category.id);
        childrenByParent.set(category.parentId, children);
      }
      const pending = new Set(subtree);
      while (pending.size > 0) {
        const leaves = [...pending]
          .filter((categoryId) =>
            (childrenByParent.get(categoryId) ?? []).every((childId) => !pending.has(childId)),
          )
          .sort((left, right) => left - right);
        if (leaves.length === 0) {
          throw new BadRequestException('分类层级异常，没有删除');
        }
        await tx.category.deleteMany({ where: { id: { in: leaves } } });
        for (const leaf of leaves) pending.delete(leaf);
      }
      return { success: true, movedProductCount, ...(uncategorizedCategoryId === undefined ? {} : { uncategorizedCategoryId }) };
    });
  }

  /** 批量调整分类排序（仅同级 sortOrder，事务保证原子性）。 */
  async reorder(
    items: { id: number; sortOrder: number }[],
    actor: CategoryActor,
  ) {
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
    await this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor);
      for (const it of items) {
        const updated = await tx.category.updateMany({
          where: { id: it.id, slug: { not: UNCATEGORIZED_SLUG } },
          data: { sortOrder: it.sortOrder },
        });
        if (updated.count !== 1) throw new BadRequestException('分类不存在或为系统「未分类」，无法调整顺序');
      }
    });
    return { success: true, updated: items.length };
  }
}
