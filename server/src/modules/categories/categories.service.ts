import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { children: true },
    });
  }

  async findTree() {
    const categories = await this.prisma.category.findMany({
      where: { level: 1, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          orderBy: { sortOrder: 'asc' },
          include: {
            children: {
              orderBy: { sortOrder: 'asc' },
              include: {
                children: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    });
    return categories;
  }

  async create(data: any) {
    return this.prisma.category.create({ data });
  }

  async update(id: number, data: any) {
    return this.prisma.category.update({ where: { id }, data });
  }

  async delete(id: number) {
    return this.prisma.category.update({ where: { id }, data: { isActive: false } });
  }
}
