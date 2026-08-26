import { Module } from '@nestjs/common';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { TradeEventsModule } from '../trade-events/trade-events.module';
import { RefundNotificationsController } from './refund-notifications.controller';

@Module({
  imports: [TradeEventsModule],
  controllers: [RefundsController, RefundNotificationsController],
  providers: [RefundsService],
})
export class RefundsModule {}
