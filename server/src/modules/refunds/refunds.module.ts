import { Module } from '@nestjs/common';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { TradeEventsModule } from '../trade-events/trade-events.module';

@Module({
  imports: [TradeEventsModule],
  controllers: [RefundsController],
  providers: [RefundsService],
})
export class RefundsModule {}
