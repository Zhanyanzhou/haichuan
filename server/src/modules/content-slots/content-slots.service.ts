import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ContentSlotsService {
  constructor(private prisma: PrismaService) {}

  /** 前台：获取已发布插槽 */
  async getPublished(pageKey: string) {
    const rows = await (this.prisma as any).contentSlot.findMany({
      where: { pageKey, status: 'PUBLISHED', isVisible: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows;
  }

  /** 后台：获取全部插槽（含草稿） */
  async getAdminAll(pageKey: string) {
    const rows = await (this.prisma as any).contentSlot.findMany({
      where: { pageKey },
      orderBy: { sortOrder: 'asc' },
    });
    return rows;
  }

  /** 保存草稿 */
  async saveDraft(data: {
    slotKey: string; pageKey: string; sectionKey: string; contentType: string;
    desktopAsset?: string; mobileAsset?: string; title?: string; subtitle?: string;
    linkUrl?: string; altText?: string; isVisible?: boolean; updatedBy?: number;
  }) {
    return (this.prisma as any).contentSlot.upsert({
      where: { slotKey: data.slotKey },
      update: { ...data, status: 'DRAFT' },
      create: { ...data, status: 'DRAFT' },
    });
  }

  /** 发布单个插槽 */
  async publish(slotKey: string) {
    return (this.prisma as any).contentSlot.update({
      where: { slotKey },
      data: { status: 'PUBLISHED' },
    });
  }

  /** 一键发布某页面全部草稿 */
  async publishAll(pageKey: string) {
    return (this.prisma as any).contentSlot.updateMany({
      where: { pageKey, status: 'DRAFT' },
      data: { status: 'PUBLISHED' },
    });
  }

  /** 取消发布（回退到默认内容） */
  async unpublish(slotKey: string) {
    return (this.prisma as any).contentSlot.update({
      where: { slotKey },
      data: { status: 'DRAFT' },
    });
  }

  /** 删除插槽记录 */
  async delete(slotKey: string) {
    return (this.prisma as any).contentSlot.delete({ where: { slotKey } });
  }
}
