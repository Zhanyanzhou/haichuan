import { Module } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { OrdersModule } from '../orders/orders.module';
import { CustomersModule } from '../customers/customers.module';
import { QuotationTransactionService } from './quotation-transaction.service';
import { QuotationOrderingGuard } from './quotation-ordering.guard';
import { CustomerQuotationsController } from './customer-quotations.controller';
import { CooperationDesignFilesController } from './cooperation-design-files.controller';
import { QuotationConfigurationController } from './quotation-configuration.controller';
import { QuotationConfigurationService } from './quotation-configuration.service';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [AuthModule, OrdersModule, CustomersModule, UploadModule],
  controllers: [
    QuotationsController,
    CustomerQuotationsController,
    QuotationConfigurationController,
    CooperationDesignFilesController,
  ],
  providers: [
    QuotationsService,
    QuotationTransactionService,
    QuotationConfigurationService,
    QuotationOrderingGuard,
  ],
  exports: [QuotationsService],
})
export class QuotationsModule {}
