import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { OutboxService } from "../outbox/outbox.service";
import { NotificationDeliveryPolicyService } from "./notification-delivery-policy.service";
import type { NotificationTopic } from "./notification-delivery.constants";

type NotificationTransaction = Prisma.TransactionClient;

type OrderNotificationSnapshot = {
  id: number;
  orderNo: string;
  customerId: number | null;
  customerEmail: string | null;
  finalAmount: Prisma.Decimal | number | string;
};

type PaymentNotificationSnapshot = OrderNotificationSnapshot & {
  paymentId: number;
  paymentAmount: Prisma.Decimal | number | string;
  cumulativePaidCents: number;
};

function normalizedEmail(value: string | null): string | null {
  const email = value?.trim().toLowerCase();
  return email || null;
}

function destinationHash(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

function moneyToCents(value: Prisma.Decimal | number | string): number {
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents)) {
    throw new Error("Notification amount is invalid");
  }
  return cents;
}

function moneyText(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

@Injectable()
export class ReliableNotificationIntentService {
  constructor(
    private readonly outbox: OutboxService,
    private readonly deliveryPolicy: NotificationDeliveryPolicyService,
  ) {}

  async enqueueOrderCreated(
    tx: NotificationTransaction,
    order: OrderNotificationSnapshot,
  ) {
    if (!order.customerId) return null;
    const now = new Date();
    const finalCents = moneyToCents(order.finalAmount);
    return this.createServiceIntent(tx, {
      customerId: order.customerId,
      type: "SERVICE_ORDER_CREATED",
      title: "订单已创建",
      body: `订单 ${order.orderNo} 已创建，应付金额 ${moneyText(finalCents)}。`,
      actionUrl: "/customer?section=orders",
      destinationEmail: order.customerEmail,
      payload: { orderId: order.id },
      outboxPayload: { orderId: order.id },
      deduplicationKey: `order.created:${order.id}`,
      occurredAt: now,
    });
  }

  async enqueuePaymentConfirmed(
    tx: NotificationTransaction,
    payment: PaymentNotificationSnapshot,
  ) {
    if (!payment.customerId) return null;
    const now = new Date();
    const paymentCents = moneyToCents(payment.paymentAmount);
    const finalCents = moneyToCents(payment.finalAmount);
    const remainingCents = Math.max(0, finalCents - payment.cumulativePaidCents);
    return this.createServiceIntent(tx, {
      customerId: payment.customerId,
      type: "SERVICE_PAYMENT_CONFIRMED",
      title: "付款已确认",
      body: `订单 ${payment.orderNo} 本次确认收款 ${moneyText(paymentCents)}，累计已收 ${moneyText(payment.cumulativePaidCents)}，剩余应收 ${moneyText(remainingCents)}。`,
      actionUrl: "/customer?section=orders",
      destinationEmail: payment.customerEmail,
      payload: {
        orderId: payment.id,
        paymentId: payment.paymentId,
        paymentCents,
        cumulativePaidCents: payment.cumulativePaidCents,
        remainingCents,
      },
      outboxPayload: {
        orderId: payment.id,
        paymentId: payment.paymentId,
      },
      deduplicationKey: `payment.confirmed:${payment.paymentId}`,
      occurredAt: now,
    });
  }

  async enqueueOrderLifecycle(
    tx: NotificationTransaction,
    order: OrderNotificationSnapshot,
    input: {
      event: "SHIPPED" | "CANCELLED" | "COMPLETED";
      fulfillmentId?: number;
      carrier?: string;
      trackingNo?: string;
    },
  ) {
    if (!order.customerId) return null;
    const content = input.event === "SHIPPED"
      ? {
          title: "包裹已发货",
          body: `订单 ${order.orderNo} 的包裹已发货${input.carrier ? `，承运商 ${input.carrier}` : ""}${input.trackingNo ? `，运单号 ${input.trackingNo}` : ""}。`,
        }
      : input.event === "CANCELLED"
        ? { title: "订单已取消", body: `订单 ${order.orderNo} 已取消。` }
        : { title: "订单已完成", body: `订单 ${order.orderNo} 已完成。` };
    const entityKey = input.fulfillmentId ?? order.id;
    return this.createServiceIntent(tx, {
      customerId: order.customerId,
      type: `SERVICE_ORDER_${input.event}`,
      title: content.title,
      body: content.body,
      actionUrl: "/customer?section=orders",
      destinationEmail: order.customerEmail,
      payload: {
        orderId: order.id,
        ...(input.fulfillmentId ? { fulfillmentId: input.fulfillmentId } : {}),
      },
      outboxPayload: { orderId: order.id },
      deduplicationKey: `order.${input.event.toLowerCase()}:${entityKey}`,
      occurredAt: new Date(),
    });
  }

  async enqueueRefundCompleted(
    tx: NotificationTransaction,
    order: OrderNotificationSnapshot,
    refund: { id: number; refundNo: string; amount: Prisma.Decimal | number | string },
  ) {
    if (!order.customerId) return null;
    const amountCents = moneyToCents(refund.amount);
    return this.createServiceIntent(tx, {
      customerId: order.customerId,
      type: "SERVICE_REFUND_COMPLETED",
      title: "退款已完成",
      body: `订单 ${order.orderNo} 的退款 ${refund.refundNo} 已完成，金额 ${moneyText(amountCents)}。`,
      actionUrl: "/customer?section=orders",
      destinationEmail: order.customerEmail,
      payload: { orderId: order.id, refundId: refund.id },
      outboxPayload: { orderId: order.id },
      deduplicationKey: `refund.completed:${refund.id}`,
      occurredAt: new Date(),
    });
  }

  async enqueueLeadReply(
    tx: NotificationTransaction,
    input: {
      leadId: number;
      activityId: number;
      customerId: number;
      occurredAt: Date;
    },
  ) {
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
      select: { email: true, status: true },
    });
    return this.createServiceIntent(tx, {
      customerId: input.customerId,
      type: "SERVICE_CONSULTATION_REPLIED",
      title: "顾问已回复您的咨询",
      body: "您的咨询已有新的顾问回复，请登录客户中心查看。",
      actionUrl: `/customer?section=consultations&leadId=${input.leadId}`,
      destinationEmail: customer?.status === "ACTIVE" ? customer.email : null,
      payload: {
        leadId: input.leadId,
        activityId: input.activityId,
      },
      outboxPayload: {
        leadId: input.leadId,
        activityId: input.activityId,
      },
      deduplicationKey: `lead.reply.in-app:${input.activityId}`,
      occurredAt: input.occurredAt,
    });
  }

  private async createServiceIntent(
    tx: NotificationTransaction,
    input: {
      customerId: number;
      type: NotificationTopic;
      title: string;
      body: string;
      actionUrl: string;
      destinationEmail: string | null;
      payload: Prisma.InputJsonValue;
      outboxPayload: Record<string, number>;
      deduplicationKey: string;
      occurredAt: Date;
    },
  ) {
    const notification = await tx.notification.create({
      data: {
        customerId: input.customerId,
        type: input.type,
        locale: "ZH_CN",
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl,
        payload: input.payload,
        status: "AVAILABLE",
        availableAt: input.occurredAt,
      },
    });

    await tx.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel: "IN_APP",
        status: "DELIVERED",
        provider: "internal",
        sentAt: input.occurredAt,
        deliveredAt: input.occurredAt,
      },
    });

    const email = normalizedEmail(input.destinationEmail);
    if (email) {
      const policy = await this.deliveryPolicy.evaluate(tx, {
        customerId: input.customerId,
        channel: "EMAIL",
        topic: input.type,
        at: input.occurredAt,
      });
      await tx.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel: "EMAIL",
          status: policy.allowed ? "PENDING" : "SUPPRESSED",
          destinationHash: policy.allowed ? destinationHash(email) : null,
          ...(!policy.allowed
            ? {
                failedAt: input.occurredAt,
                lastErrorCode: policy.reason,
              }
            : {}),
        },
      });
    }

    await this.outbox.enqueue(tx, {
      aggregateType: "Notification",
      aggregateId: String(notification.id),
      eventType: "notification.delivery.requested",
      payload: {
        notificationId: notification.id,
        ...input.outboxPayload,
      },
      deduplicationKey: input.deduplicationKey,
      occurredAt: input.occurredAt,
      availableAt: input.occurredAt,
    });

    return notification;
  }
}
