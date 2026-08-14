import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { UploadModule } from '../upload/upload.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [OrdersModule, UploadModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
