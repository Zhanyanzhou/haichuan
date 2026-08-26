import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { UploadModule } from '../upload/upload.module';
import { CustomersModule } from '../customers/customers.module';
import { AuthModule } from '../auth/auth.module';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import { CustomerPaymentsController } from './customer-payments.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  // 客户支付控制器在本模块上下文实例化 CustomerAuthGuard；AuthModule 提供 JwtService。
  imports: [AuthModule, OrdersModule, UploadModule, CustomersModule],
  controllers: [PaymentsController, CustomerPaymentsController],
  providers: [PaymentsService, CustomerCommerceGuard],
})
export class PaymentsModule {}
