import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  Header,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { InventoryService } from "./inventory.service";
import { UpdateStockDto } from "./dto/update-stock.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { BoundedListQueryDto } from "../../common/dto/bounded-list-query.dto";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import { SkipGenericAudit } from "../../common/decorators/skip-generic-audit.decorator";

@ApiTags("库存管理")
@ApiBearerAuth()
@Controller("inventory")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN", "WAREHOUSE")
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  @ApiOperation({ summary: "获取库存列表" })
  findAll(
    @Query() query: BoundedListQueryDto,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.inventoryService.findAll(query, user);
  }

  @Get(":id")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  @ApiOperation({ summary: "获取库存详情" })
  findById(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.inventoryService.findById(id, user);
  }

  @Put(":id")
  @SkipGenericAudit()
  updateStock(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateStockDto,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.inventoryService.updateStock(id, dto, user);
  }
}
