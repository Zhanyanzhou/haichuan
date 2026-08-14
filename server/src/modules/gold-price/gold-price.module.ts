import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GoldPriceService } from './gold-price.service';
import { GoldPriceController } from './gold-price.controller';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ScheduleModule.forRoot(), ProductsModule],
  controllers: [GoldPriceController],
  providers: [GoldPriceService],
  exports: [GoldPriceService],
})
export class GoldPriceModule {}
