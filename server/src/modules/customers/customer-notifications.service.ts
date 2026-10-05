import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CustomerNotificationQueryDto } from "./dto/customer-notification-query.dto";
import { Prisma } from "@prisma/client";
import {
  defaultNotificationPreference,
  EXTERNAL_NOTIFICATION_CHANNELS,
  isMarketingNotificationTopic,
  NOTIFICATION_TOPICS,
} from "../../common/notifications/notification-delivery.constants";
import { UpdateCustomerNotificationPreferenceDto } from "./dto/customer-notification-preference.dto";
import type { CustomerPrincipal } from "../../common/security/authenticated-principal";
import {
  lockActiveCustomerForRead,
  lockActiveCustomerForWrite,
} from "./customer-write-gate";

type NotificationCustomer = Pick<CustomerPrincipal, "id" | "authVersion">;

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

  async list(customer: NotificationCustomer, query: CustomerNotificationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const now = new Date();
    const where: Prisma.NotificationWhereInput = {
      customerId: customer.id,
      availableAt: { lte: now },
      status: query.unreadOnly === "true"
        ? "AVAILABLE" as const
        : { in: ["AVAILABLE", "READ"] },
    };
    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerForRead(tx, customer);
      const [list, total, unreadCount] = await Promise.all([
        tx.notification.findMany({
          where,
          select: CUSTOMER_NOTIFICATION_SELECT,
          orderBy: [{ availableAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.notification.count({ where }),
        tx.notification.count({
          where: { customerId: customer.id, status: "AVAILABLE", availableAt: { lte: now } },
        }),
      ]);
      return { list, total, unreadCount, page, pageSize };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async markRead(customer: NotificationCustomer, notificationId: number) {
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      throw new BadRequestException("无效的通知编号");
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerForWrite(tx, customer);
      await tx.notification.updateMany({
        where: {
          id: notificationId,
          customerId: customer.id,
          status: "AVAILABLE",
          availableAt: { lte: now },
        },
        data: { status: "READ", readAt: now },
      });
      const notification = await tx.notification.findFirst({
        where: {
          id: notificationId,
          customerId: customer.id,
          status: { in: ["AVAILABLE", "READ"] },
          availableAt: { lte: now },
        },
        select: CUSTOMER_NOTIFICATION_SELECT,
      });
      if (!notification) throw new NotFoundException("通知不存在");
      return notification;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async markAllRead(customer: NotificationCustomer) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerForWrite(tx, customer);
      const result = await tx.notification.updateMany({
        where: { customerId: customer.id, status: "AVAILABLE", availableAt: { lte: now } },
        data: { status: "READ", readAt: now },
      });
      return { updated: result.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listPreferences(customer: NotificationCustomer) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await lockActiveCustomerForRead(tx, customer);
      const [records, latestMarketingConsent] = await Promise.all([
        tx.notificationPreference.findMany({
          where: {
            customerId: customer.id,
            channel: { in: [...EXTERNAL_NOTIFICATION_CHANNELS] },
            topic: { in: [...NOTIFICATION_TOPICS] },
          },
          select: {
            channel: true,
            topic: true,
            enabled: true,
            updatedAt: true,
          },
        }),
        tx.consentRecord.findFirst({
          where: { customerId: customer.id, purpose: "MARKETING", decidedAt: { lte: now } },
          orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
          select: { decision: true, expiresAt: true },
        }),
      ]);
      const recordByKey = new Map(
        records.map((record) => [`${record.channel}:${record.topic}`, record]),
      );
      const marketingConsentGranted = latestMarketingConsent?.decision === "GRANTED"
        && (!latestMarketingConsent.expiresAt || latestMarketingConsent.expiresAt > now);
      return {
        list: EXTERNAL_NOTIFICATION_CHANNELS.flatMap((channel) =>
          NOTIFICATION_TOPICS.map((topic) => {
            const record = recordByKey.get(`${channel}:${topic}`);
            return {
              channel,
              topic,
              enabled: record?.enabled ?? defaultNotificationPreference(topic),
              defaulted: !record,
              updatedAt: record?.updatedAt ?? null,
              requiresMarketingConsent: isMarketingNotificationTopic(topic),
            };
          }),
        ),
        marketingConsentGranted,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updatePreference(
    customer: NotificationCustomer,
    dto: UpdateCustomerNotificationPreferenceDto,
  ) {
    const expectedUpdatedAt = dto.expectedUpdatedAt
      ? new Date(dto.expectedUpdatedAt)
      : null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockActiveCustomerForWrite(tx, customer);
        const current = await tx.notificationPreference.findUnique({
          where: {
            customerId_channel_topic: {
              customerId: customer.id,
              channel: dto.channel,
              topic: dto.topic,
            },
          },
          select: { id: true, updatedAt: true },
        });
        let preference;
        if (current) {
          if (
            !expectedUpdatedAt
            || current.updatedAt.getTime() !== expectedUpdatedAt.getTime()
          ) {
            throw new ConflictException("通知偏好已发生变化，请刷新后重试");
          }
          const changed = await tx.notificationPreference.updateMany({
            where: { id: current.id, updatedAt: expectedUpdatedAt },
            data: { enabled: dto.enabled },
          });
          if (changed.count !== 1) {
            throw new ConflictException("通知偏好已发生变化，请刷新后重试");
          }
          preference = await tx.notificationPreference.findUniqueOrThrow({
            where: { id: current.id },
            select: { channel: true, topic: true, enabled: true, updatedAt: true },
          });
        } else {
          if (expectedUpdatedAt) {
            throw new ConflictException("通知偏好已发生变化，请刷新后重试");
          }
          preference = await tx.notificationPreference.create({
            data: {
              customerId: customer.id,
              channel: dto.channel,
              topic: dto.topic,
              enabled: dto.enabled,
            },
            select: { channel: true, topic: true, enabled: true, updatedAt: true },
          });
        }
        await tx.customerSecurityEvent.create({
          data: {
            customerId: customer.id,
            eventType: `NOTIFY_PREF_${dto.channel}_${dto.topic}_${dto.enabled ? "ON" : "OFF"}`,
          },
        });
        return {
          ...preference,
          defaulted: false,
          requiresMarketingConsent: isMarketingNotificationTopic(dto.topic),
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && (error.code === "P2002" || error.code === "P2034")
      ) {
        throw new ConflictException("通知偏好已发生变化，请刷新后重试");
      }
      throw error;
    }
  }
}
