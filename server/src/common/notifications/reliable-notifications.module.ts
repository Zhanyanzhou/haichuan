import { Global, Module } from "@nestjs/common";
import { OutboxModule } from "../outbox/outbox.module";
import { ReliableNotificationIntentService } from "./reliable-notification-intent.service";
import { ReliableNotificationDeliveryWorker } from "./reliable-notification-delivery.worker";
import { ReliableNotificationOperationsController } from "./reliable-notification-operations.controller";
import { ReliableNotificationOperationsService } from "./reliable-notification-operations.service";
import { NotificationDeliveryPolicyService } from "./notification-delivery-policy.service";

@Global()
@Module({
  imports: [OutboxModule],
  providers: [
    ReliableNotificationIntentService,
    ReliableNotificationDeliveryWorker,
    ReliableNotificationOperationsService,
    NotificationDeliveryPolicyService,
  ],
  controllers: [ReliableNotificationOperationsController],
  exports: [ReliableNotificationIntentService],
})
export class ReliableNotificationsModule {}
