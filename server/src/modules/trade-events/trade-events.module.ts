import { Module } from '@nestjs/common';
import { TradeEventsService } from './trade-events.service';

/**
 * 交易事件模块：全局共享。
 * 订单、付款、履约、退款、售后模块均 import 本模块以记录审计事件。
 */
@Module({
  providers: [TradeEventsService],
  exports: [TradeEventsService],
})
export class TradeEventsModule {}
