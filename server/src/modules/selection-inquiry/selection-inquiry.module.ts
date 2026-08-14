import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { CustomersModule } from '../customers/customers.module';
import { AuthModule } from '../auth/auth.module';
import { ProductsModule } from '../products/products.module';
import { SelectionInquiryService } from './selection-inquiry.service';
import { SelectionInquiryController } from './selection-inquiry.controller';

@Module({
  // ProductsModule 导出 ProductsService，供选款咨询提交前复核商品可见性
  imports: [PrismaModule, AuthModule, CustomersModule, ProductsModule],
  controllers: [SelectionInquiryController],
  providers: [SelectionInquiryService],
  exports: [SelectionInquiryService],
})
export class SelectionInquiryModule {}
