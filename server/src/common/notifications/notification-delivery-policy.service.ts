import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  defaultNotificationPreference,
  ExternalNotificationChannel,
  isMarketingNotificationTopic,
  isNotificationTopic,
  NotificationTopic,
} from "./notification-delivery.constants";

type NotificationPolicyClient = Pick<
  Prisma.TransactionClient,
  "notificationPreference" | "consentRecord"
>;

export type NotificationDeliveryPolicyDecision =
  | { allowed: true; topic: NotificationTopic }
  | {
      allowed: false;
      topic: NotificationTopic | null;
      reason:
        | "INVALID_NOTIFICATION_TOPIC"
        | "NOTIFICATION_PREFERENCE_DISABLED"
        | "MARKETING_PREFERENCE_REQUIRED"
        | "MARKETING_CONSENT_REQUIRED";
    };

@Injectable()
export class NotificationDeliveryPolicyService {
  async evaluate(
    client: NotificationPolicyClient,
    input: {
      customerId: number;
      channel: ExternalNotificationChannel;
      topic: string;
      at?: Date;
    },
  ): Promise<NotificationDeliveryPolicyDecision> {
    if (!isNotificationTopic(input.topic)) {
      return { allowed: false, topic: null, reason: "INVALID_NOTIFICATION_TOPIC" };
    }
    const topic = input.topic;
    const preference = await client.notificationPreference.findUnique({
      where: {
        customerId_channel_topic: {
          customerId: input.customerId,
          channel: input.channel,
          topic,
        },
      },
      select: { enabled: true },
    });
    const enabled = preference?.enabled ?? defaultNotificationPreference(topic);
    if (!enabled) {
      return {
        allowed: false,
        topic,
        reason: isMarketingNotificationTopic(topic)
          ? "MARKETING_PREFERENCE_REQUIRED"
          : "NOTIFICATION_PREFERENCE_DISABLED",
      };
    }
    if (!isMarketingNotificationTopic(topic)) {
      return { allowed: true, topic };
    }

    const at = input.at ?? new Date();
    const consent = await client.consentRecord.findFirst({
      where: {
        customerId: input.customerId,
        purpose: "MARKETING",
        decidedAt: { lte: at },
      },
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
      select: { decision: true, expiresAt: true },
    });
    if (
      consent?.decision !== "GRANTED"
      || (consent.expiresAt && consent.expiresAt <= at)
    ) {
      return { allowed: false, topic, reason: "MARKETING_CONSENT_REQUIRED" };
    }
    return { allowed: true, topic };
  }
}
