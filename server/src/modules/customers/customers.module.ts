import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { CustomerAuthGuard } from './customer-auth.guard';
import { OptionalCustomerAuthGuard } from './optional-customer-auth.guard';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerAuthGuard, OptionalCustomerAuthGuard],
  exports: [CustomerAuthGuard, OptionalCustomerAuthGuard],
})
export class CustomersModule {}
