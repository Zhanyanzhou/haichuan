import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GoldPriceService } from './gold-price.service';
import { GoldPriceController } from './gold-price.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [GoldPriceController],
  providers: [GoldPriceService],
  exports: [GoldPriceService],
})
export class GoldPriceModule {}
