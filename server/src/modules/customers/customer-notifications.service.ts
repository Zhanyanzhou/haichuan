import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CustomerNotificationQueryDto } from "./dto/customer-notification-query.dto";
import { Prisma } from "@prisma/client";

const CUSTOMER_NOTIFICATION_SELECT = {
  id: true,
  type: true,
  locale: true,
  title: true,
  body: true,
  actionUrl: true,
  status: true,
  availableAt: true,
  readAt: true,
  createdAt: true,
} as const;

@Injectable()
export class CustomerNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(customerId: number, query: CustomerNotificationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const now = new Date();
    const where: Prisma.NotificationWhereInput = {
      customerId,
      availableAt: { lte: now },
      status: query.unreadOnly === "true"
        ? "AVAILABLE" as const
        : { in: ["AVAILABLE", "READ"] },
    };
    const [list, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: CUSTOMER_NOTIFICATION_SELECT,
        orderBy: [{ availableAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { customerId, status: "AVAILABLE", availableAt: { lte: now } },
      }),
    ]);
    return { list, total, unreadCount, page, pageSize };
  }

  async markRead(customerId: number, notificationId: number) {
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      throw new BadRequestException("无效的通知编号");
    }
    const now = new Date();
    await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        customerId,
        status: "AVAILABLE",
        availableAt: { lte: now },
      },
      data: { status: "READ", readAt: now },
    });
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        customerId,
        status: { in: ["AVAILABLE", "READ"] },
        availableAt: { lte: now },
      },
      select: CUSTOMER_NOTIFICATION_SELECT,
    });
    if (!notification) throw new NotFoundException("通知不存在");
    return notification;
  }

  async markAllRead(customerId: number) {
    const now = new Date();
    const result = await this.prisma.notification.updateMany({
      where: { customerId, status: "AVAILABLE", availableAt: { lte: now } },
      data: { status: "READ", readAt: now },
    });
    return { updated: result.count };
  }
}
