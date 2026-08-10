import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async findByUser(userId: number, isRead?: boolean) {
    const where: any = { userId };
    if (isRead !== undefined) where.isRead = isRead;
    return this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async markAsRead(id: number, userId: number) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    if (result.count === 0) throw new NotFoundException('通知不存在');
    return { id, isRead: true };
  }

  async markAllAsRead(userId: number) {
    return this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  }

  async create(data: { userId: number; type: string; title: string; content: string; link?: string }) {
    return this.prisma.notification.create({ data });
  }

  async getUnreadCount(userId: number) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }
}
