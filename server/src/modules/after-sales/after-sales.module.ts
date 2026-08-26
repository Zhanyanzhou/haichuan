import { Module } from '@nestjs/common';
import { AfterSalesController } from './after-sales.controller';
import { CustomerAfterSalesController } from './customer-after-sales.controller';
import { AfterSalesService } from './after-sales.service';
import { CustomersModule } from '../customers/customers.module';
import { AuthModule } from '../auth/auth.module';
import { TradeEventsModule } from '../trade-events/trade-events.module';

@Module({
  // 客户控制器在本模块上下文实例化 CustomerAuthGuard；AuthModule 提供 JwtService。
  imports: [AuthModule, CustomersModule, TradeEventsModule],
  controllers: [AfterSalesController, CustomerAfterSalesController],
  providers: [AfterSalesService],
})
export class AfterSalesModule {}
