import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { WarehouseController } from './warehouse.controller';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [InventoryController, WarehouseController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
