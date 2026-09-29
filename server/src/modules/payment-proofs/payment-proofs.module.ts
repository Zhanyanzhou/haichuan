import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { CustomersModule } from '../customers/customers.module';
import { PaymentProofsController } from './payment-proofs.controller';
import { PaymentProofsService } from './payment-proofs.service';

@Module({
  imports: [AuthModule, OrdersModule, CustomersModule],
  controllers: [PaymentProofsController],
  providers: [PaymentProofsService],
})
export class PaymentProofsModule {}
