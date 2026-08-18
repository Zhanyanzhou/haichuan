import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('仓库管理')
@ApiBearerAuth()
@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE')
export class WarehouseController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({ summary: '仓库列表' })
  list() {
    return this.inventoryService.listWarehouses();
  }

  @Post()
  @ApiOperation({ summary: '新增仓库' })
  create(@Body() body: any) {
    return this.inventoryService.createWarehouse(body);
  }

  @Put(':id')
  @ApiOperation({ summary: '编辑仓库（含启停）' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.inventoryService.updateWarehouse(+id, body);
  }
}
