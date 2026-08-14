import { Module } from '@nestjs/common';
import { AfterSalesController } from './after-sales.controller';
import { AfterSalesService } from './after-sales.service';
import { TradeEventsModule } from '../trade-events/trade-events.module';

@Module({
  imports: [TradeEventsModule],
  controllers: [AfterSalesController],
  providers: [AfterSalesService],
})
export class AfterSalesModule {}
