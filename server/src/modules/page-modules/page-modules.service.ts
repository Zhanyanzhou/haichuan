import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

// 模块类型定义与默认值
const MODULE_SCHEMAS: Record<string, { defaults: any; requiredFields: string[] }> = {
  hero: {
    requiredFields: ['desktopImage'],
    defaults: { desktopImage: '', mobileImage: '', tagline: '', title: '', subtitle: '', buttonText: '', buttonLink: '', alignment: 'center', overlay: false, height: 'screen' },
  },
  imageText: {
    requiredFields: ['image', 'title'],
    defaults: { image: '', title: '', description: '', imagePosition: 'left', buttonText: '', buttonLink: '' },
  },
  richText: {
    requiredFields: ['content'],
    defaults: { content: '', title: '', maxWidth: '800px' },
  },
  gallery: {
    requiredFields: [],
    defaults: { title: '', images: [], columns: 3, gap: 16 },
  },
  serviceCards: {
    requiredFields: [],
    defaults: { title: '', subtitle: '', cards: [], columns: 3 },
  },
  productRecommendation: {
    requiredFields: ['productIds'],
    defaults: { title: '', productSource: 'manual', productIds: [], displayCount: 6, columns: 3, showPrice: false, buttonType: 'view', viewAllLink: '' },
  },
  cta: {
    requiredFields: ['title'],
    defaults: { title: '', subtitle: '', buttonText: '', buttonLink: '', bgImage: '', style: 'primary' },
  },
  faq: {
    requiredFields: [],
    defaults: { title: '', items: [] },
  },
};

@Injectable()
export class PageModulesService {
  constructor(private prisma: PrismaService) {}

  getModuleSchema(moduleType: string) {
    return MODULE_SCHEMAS[moduleType] || null;
  }

  getAvailableModules() {
    return Object.keys(MODULE_SCHEMAS).map(type => ({
      type,
      label: ({ hero: '首屏主视觉', imageText: '图文模块', richText: '富文本', gallery: '图库', serviceCards: '服务卡片', productRecommendation: '商品推荐', cta: '行动号召', faq: '常见问题' } as any)[type] || type,
      defaults: MODULE_SCHEMAS[type].defaults,
    }));
  }

  async getPublished(pageKey: string) {
    return (this.prisma as any).pageModule.findMany({
      where: { pageKey, status: 'PUBLISHED', isVisible: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getAdminAll(pageKey: string) {
    return (this.prisma as any).pageModule.findMany({
      where: { pageKey },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async saveDraft(data: {
    id?: number; pageKey: string; moduleType: string; sortOrder: number;
    isVisible?: boolean; content?: any; layoutConfig?: any; styleConfig?: any; updatedBy?: number;
  }) {
    const { id, ...rest } = data;
    const payload = { ...rest, status: 'DRAFT' };
    if (id) {
      return (this.prisma as any).pageModule.update({ where: { id }, data: payload });
    }
    return (this.prisma as any).pageModule.create({ data: payload });
  }

  async reorder(items: { id: number; sortOrder: number }[]) {
    const ops = items.map(i =>
      (this.prisma as any).pageModule.update({ where: { id: i.id }, data: { sortOrder: i.sortOrder } })
    );
    return (this.prisma as any).$transaction(ops);
  }

  async toggleVisibility(id: number, isVisible: boolean) {
    return (this.prisma as any).pageModule.update({ where: { id }, data: { isVisible } });
  }

  async duplicate(id: number) {
    const src = await (this.prisma as any).pageModule.findUnique({ where: { id } });
    if (!src) throw new Error('Module not found');
    const { id: _id, createdAt, updatedAt, ...data } = src;
    return (this.prisma as any).pageModule.create({
      data: { ...data, status: 'DRAFT', sortOrder: data.sortOrder + 1 },
    });
  }

  async remove(id: number) {
    return (this.prisma as any).pageModule.delete({ where: { id } });
  }

  async publish(pageKey: string, userId?: number) {
    const drafts = await (this.prisma as any).pageModule.findMany({
      where: { pageKey, status: 'DRAFT' },
    });

    for (const draft of drafts) {
      // 保存版本历史
      await (this.prisma as any).pageModuleVersion.create({
        data: {
          moduleId: draft.id,
          pageKey: draft.pageKey,
          moduleType: draft.moduleType,
          content: draft.content,
          layoutConfig: draft.layoutConfig,
          styleConfig: draft.styleConfig,
          version: draft.version,
          savedBy: userId,
        },
      });
      // 发布: 快照草稿内容 + 递增版本号
      await (this.prisma as any).pageModule.update({
        where: { id: draft.id },
        data: {
          status: 'PUBLISHED',
          publishedContent: draft.content,
          version: draft.version + 1,
          updatedBy: userId,
        },
      });
    }

    return this.getPublished(pageKey);
  }

  async getVersions(moduleId: number) {
    return (this.prisma as any).pageModuleVersion.findMany({
      where: { moduleId },
      orderBy: { version: 'desc' },
      take: 20,
    });
  }

  async restoreVersion(moduleId: number, version: number) {
    const v = await (this.prisma as any).pageModuleVersion.findFirst({
      where: { moduleId, version },
    });
    if (!v) throw new Error('Version not found');
    return (this.prisma as any).pageModule.update({
      where: { id: moduleId },
      data: {
        content: v.content,
        layoutConfig: v.layoutConfig,
        styleConfig: v.styleConfig,
        status: 'DRAFT',
      },
    });
  }
}
