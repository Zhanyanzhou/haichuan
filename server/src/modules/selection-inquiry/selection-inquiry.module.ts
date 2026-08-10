import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { CustomersModule } from '../customers/customers.module';
import { AuthModule } from '../auth/auth.module';
import { SelectionInquiryService } from './selection-inquiry.service';
import { SelectionInquiryController } from './selection-inquiry.controller';

@Module({
  imports: [PrismaModule, AuthModule, CustomersModule],
  controllers: [SelectionInquiryController],
  providers: [SelectionInquiryService],
  exports: [SelectionInquiryService],
})
export class SelectionInquiryModule {}
