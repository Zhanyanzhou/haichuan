import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { MarketingModule } from '../marketing/marketing.module';
import { CustomerAuthGuard } from './customer-auth.guard';
import { OptionalCustomerAuthGuard } from './optional-customer-auth.guard';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerNotificationsService } from './customer-notifications.service';
import { CustomerAvatarService } from './customer-avatar.service';
import { CustomerProfileService } from './customer-profile.service';
import { PasswordResetDeliveryWorker } from './password-reset-delivery.worker';
import { ObservabilityModule } from '../../common/observability/observability.module';

@Module({
  imports: [AuthModule, OrdersModule, MarketingModule, ObservabilityModule],
  controllers: [CustomersController],
  providers: [
    CustomersService,
    CustomerNotificationsService,
    CustomerProfileService,
    CustomerAvatarService,
    PasswordResetDeliveryWorker,
    CustomerAuthGuard,
    OptionalCustomerAuthGuard,
  ],
  exports: [CustomerAuthGuard, OptionalCustomerAuthGuard],
})
export class CustomersModule {}
