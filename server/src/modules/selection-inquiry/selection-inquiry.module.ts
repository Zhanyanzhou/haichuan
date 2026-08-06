import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SelectionInquiryService } from './selection-inquiry.service';
import { SelectionInquiryController } from './selection-inquiry.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SelectionInquiryController],
  providers: [SelectionInquiryService],
  exports: [SelectionInquiryService],
})
export class SelectionInquiryModule {}
