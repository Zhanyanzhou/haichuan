import { Controller, Get, Post, Put, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { UpdateStockDto } from './dto/update-stock.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('库存管理')
@ApiBearerAuth()
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({ summary: '获取库存列表' })
  findAll(@Query() query: any) {
    return this.inventoryService.findAll(query);
  }

  @Get('alerts')
  @ApiOperation({ summary: '获取低库存预警' })
  getAlerts() {
    return this.inventoryService.getLowStockAlerts();
  }

  @Get('summary')
  @ApiOperation({ summary: '获取库存汇总' })
  getSummary() {
    return this.inventoryService.getSummary();
  }

  @Get(':id')
  @ApiOperation({ summary: '获取库存详情' })
  findById(@Param('id') id: string) {
    return this.inventoryService.findById(+id);
  }

  @Put(':id')
  updateStock(@Param('id') id: string, @Body() dto: UpdateStockDto) {
    return this.inventoryService.updateStock(+id, dto);
  }
}
