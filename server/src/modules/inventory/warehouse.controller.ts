import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';

@ApiTags('仓库管理')
@ApiBearerAuth()
@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE')
export class WarehouseController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  @ApiOperation({ summary: '仓库列表' })
  list(@CurrentUser() user: StaffPrincipal) {
    return this.inventoryService.listWarehouses(user);
  }

  @Post()
  @ApiOperation({ summary: '新增仓库' })
  create(
    @Body() body: CreateWarehouseDto,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.inventoryService.createWarehouse(body, user);
  }

  @Put(':id')
  @ApiOperation({ summary: '编辑仓库（含启停）' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateWarehouseDto,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.inventoryService.updateWarehouse(id, body, user);
  }
}
