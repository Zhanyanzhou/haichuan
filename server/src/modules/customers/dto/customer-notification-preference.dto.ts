import { IsBoolean, IsIn, IsISO8601, ValidateIf } from "class-validator";
import {
  EXTERNAL_NOTIFICATION_CHANNELS,
  NOTIFICATION_TOPICS,
  type ExternalNotificationChannel,
  type NotificationTopic,
} from "../../../common/notifications/notification-delivery.constants";

export class UpdateCustomerNotificationPreferenceDto {
  @IsIn(EXTERNAL_NOTIFICATION_CHANNELS)
  channel!: ExternalNotificationChannel;

  @IsIn(NOTIFICATION_TOPICS)
  topic!: NotificationTopic;

  @IsBoolean()
  enabled!: boolean;

  @ValidateIf((_object, value) => value !== null)
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string | null;
}
