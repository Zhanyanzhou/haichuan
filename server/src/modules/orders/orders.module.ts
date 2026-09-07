import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TradeEventsModule } from '../trade-events/trade-events.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';

// 说明：ScheduleModule.forRoot() 已在 GoldPriceModule 全局注册，
// OrdersService 的 @Cron 装饰器可正常工作，此处无需重复注册。
@Module({
  // TradeEventsModule 提供交易事件记录能力。
  imports: [TradeEventsModule, FulfillmentModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
