import { Module } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { OrdersModule } from '../orders/orders.module';

// OrdersModule 提供 OrdersService（createFromQuotation 用于报价转订单）。
@Module({
  imports: [OrdersModule],
  controllers: [QuotationsController],
  providers: [QuotationsService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
