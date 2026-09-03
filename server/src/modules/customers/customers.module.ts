import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { MarketingModule } from '../marketing/marketing.module';
import { CustomerAuthGuard } from './customer-auth.guard';
import { OptionalCustomerAuthGuard } from './optional-customer-auth.guard';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerNotificationsService } from './customer-notifications.service';

@Module({
  imports: [AuthModule, OrdersModule, MarketingModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerNotificationsService, CustomerAuthGuard, OptionalCustomerAuthGuard],
  exports: [CustomerAuthGuard, OptionalCustomerAuthGuard],
})
export class CustomersModule {}
