import { Global, Module } from "@nestjs/common";
import { OutboxModule } from "../outbox/outbox.module";
import { ReliableNotificationIntentService } from "./reliable-notification-intent.service";
import { ReliableNotificationDeliveryWorker } from "./reliable-notification-delivery.worker";

@Global()
@Module({
  imports: [OutboxModule],
  providers: [
    ReliableNotificationIntentService,
    ReliableNotificationDeliveryWorker,
  ],
  exports: [ReliableNotificationIntentService],
})
export class ReliableNotificationsModule {}
