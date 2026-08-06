import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PageModulesService {
  constructor(private prisma: PrismaService) {}

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

  async publish(pageKey: string) {
    await (this.prisma as any).pageModule.updateMany({
      where: { pageKey, status: 'DRAFT' },
      data: { status: 'PUBLISHED' },
    });
    return this.getPublished(pageKey);
  }
}
