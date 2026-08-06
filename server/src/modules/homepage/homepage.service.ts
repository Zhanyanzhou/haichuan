import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class HomepageService {
  constructor(private prisma: PrismaService) {}

  async getConfig() {
    return (this.prisma as any).homeSection.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getAdminConfig() {
    return (this.prisma as any).homeSection.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateConfig(sections: any[]) {
    const operations = sections.map((section, index) => {
      const { id, ...data } = section;
      const normalized = { ...data, sortOrder: index + 1 };
      return (this.prisma as any).homeSection.upsert({
        where: { id: id || 0 },
        update: normalized,
        create: normalized,
      });
    });
    const results = await (this.prisma as any).$transaction(operations);
    return results.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  }

  async deleteSection(id: number) {
    return (this.prisma as any).homeSection.delete({ where: { id } });
  }

  async createSection(data: any) {
    return (this.prisma as any).homeSection.create({ data });
  }
}
