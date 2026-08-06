import { Module } from '@nestjs/common';
import { AiClassifyService } from './ai-classify.service';
import { AiClassifyController } from './ai-classify.controller';

@Module({
  controllers: [AiClassifyController],
  providers: [AiClassifyService],
  exports: [AiClassifyService],
})
export class AiClassifyModule {}
