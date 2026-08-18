import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { WarehouseController } from './warehouse.controller';

@Module({
  controllers: [InventoryController, WarehouseController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
