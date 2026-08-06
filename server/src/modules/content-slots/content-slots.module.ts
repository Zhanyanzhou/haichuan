import { Module } from '@nestjs/common';
import { ContentSlotsController } from './content-slots.controller';
import { ContentSlotsService } from './content-slots.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ContentSlotsController],
  providers: [ContentSlotsService],
  exports: [ContentSlotsService],
})
export class ContentSlotsModule {}
