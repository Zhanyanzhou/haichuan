import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { OrdersService } from "./orders.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CreateOrderDto, ShipOrderDto, UpdateOrderStatusDto, UpdateOrderAmountDto, UpdateOrderAddressDto, UpdateOrderNoteDto, UpdateOrderConsultantDto, AdvanceCustomStageDto } from "./dto/create-order.dto";

// 交易域角色边界（P0 修复，对应任务优先问题 #5）：
// - 订单查看（列表/详情）：SUPER_ADMIN、ADMIN、CUSTOMER_SERVICE、WAREHOUSE 均可，
//   客服需跟进订单、仓储需发货，都必须能看订单。
// - 交易写操作（人工建单、改状态、强制取消）：仅 SUPER_ADMIN、ADMIN。
// - 发货登记：SUPER_ADMIN、ADMIN、WAREHOUSE。
// - EDITOR 不再拥有任何交易写权限，也不再默认能看交易订单。
@ApiTags("订单管理")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN", "CUSTOMER_SERVICE", "WAREHOUSE")
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: "获取订单列表（服务端分页与筛选）" })
  findAll(@Query() query: any) {
    return this.ordersService.findAll(query);
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN")
  @Get("statistics")
  @ApiOperation({ summary: "获取订单统计数据" })
  getStatistics() {
    return this.ordersService.getStatistics();
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN", "FINANCE")
  @Get("anomalies")
  @ApiOperation({ summary: "异常订单聚合（长时间未付款/超时未发货/定制超期/物流异常/退款中）" })
  findAnomalies() {
    return this.ordersService.findAnomalies();
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN", "FINANCE")
  @Get("trade-overview")
  @ApiOperation({ summary: "交易数据首页统计（今日成交/已收/待收/退款/客单价/分布）" })
  getTradeOverview() {
    return this.ordersService.getTradeOverview();
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN")
  @Get("export")
  @ApiOperation({ summary: "导出订单（与当前筛选一致，仅 ADMIN）" })
  async exportOrders(@Query() query: any) {
    // 导出受 ADMIN 角色控制（类级守卫已限），返回与列表筛选一致的数据。
    // 前端负责拼装 CSV/Excel；此接口只返回结构化数据，避免在服务端引入 CSV 依赖。
    return this.ordersService.findAllForExport(query);
  }

  @ApiBearerAuth()
  @Get(":id")
  @ApiOperation({ summary: "获取订单详情（含快照、收款、库存预占、履约、事件时间线）" })
  findById(@Param("id") id: string) {
    return this.ordersService.findById(+id);
  }

  // 后台人工建单入口（DECISIONS D.7）：
  // 客户下单必须走 POST /customers/checkout；此接口仅供后台员工手工录入订单，
  // 需 SUPER_ADMIN/ADMIN 角色，并记录审计事件。不是公开接口。
  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN")
  @Post()
  @ApiOperation({ summary: "后台人工建单（非公开；客户下单请走 /customers/checkout）" })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: any) {
    return this.ordersService.create({
      ...dto,
      operator: { type: 'ADMIN' as const, id: user?.id, name: user?.realName || user?.username },
    });
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN", "WAREHOUSE")
  @Put(":id/ship")
  @ApiOperation({ summary: "发货并登记物流（由履约流程调用；未付款订单不可发货）" })
  ship(@Param("id") id: string, @Body() dto: ShipOrderDto, @CurrentUser() user: any) {
    return this.ordersService.ship(+id, dto, {
      type: 'ADMIN' as const,
      id: user?.id,
      name: user?.realName || user?.username,
    });
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN")
  @Put(":id/status")
  @ApiOperation({ summary: "更新订单状态（含状态机校验；仅允许完成/取消等非交易关键转换）" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateOrderStatusDto, @CurrentUser() user: any) {
    return this.ordersService.updateStatus(+id, {
      ...dto,
      operator: { type: 'ADMIN' as const, id: user?.id, name: user?.realName || user?.username },
    });
  }

  // ════════ 交易中心：订单管理中心操作（金额/地址/备注/签收/顾问/定制阶段） ════════
  // 金额、地址、顾问、定制阶段为高敏操作，限 SUPER_ADMIN/ADMIN；备注开放客服；签收开放仓储。

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN")
  @Put(":id/amount")
  @ApiOperation({ summary: "修改订单金额（优惠/调整/应收/定金/尾款，记录审计 before/after）" })
  updateAmount(@Param("id") id: string, @Body() dto: UpdateOrderAmountDto, @CurrentUser() user: any) {
    return this.ordersService.updateAmount(+id, dto, {
      type: 'ADMIN' as const, id: user?.id, name: user?.realName || user?.username,
    });
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN")
  @Put(":id/address")
  @ApiOperation({ summary: "修改收货地址（已发货/已完成不可改）" })
  updateAddress(@Param("id") id: string, @Body() dto: UpdateOrderAddressDto, @CurrentUser() user: any) {
    return this.ordersService.updateAddress(+id, dto.address, {
      type: 'ADMIN' as const, id: user?.id, name: user?.realName || user?.username,
    });
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN", "CUSTOMER_SERVICE")
  @Put(":id/note")
  @ApiOperation({ summary: "修改内部备注（后台备注，不展示给客户）" })
  updateNote(@Param("id") id: string, @Body() dto: UpdateOrderNoteDto, @CurrentUser() user: any) {
    return this.ordersService.updateNote(+id, dto.internalNote ?? '', {
      type: 'ADMIN' as const, id: user?.id, name: user?.realName || user?.username,
    });
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN", "WAREHOUSE")
  @Put(":id/receive")
  @ApiOperation({ summary: "确认签收（发货维度 SHIPPED→RECEIVED）" })
  confirmReceive(@Param("id") id: string, @CurrentUser() user: any) {
    return this.ordersService.confirmReceive(+id, {
      type: 'ADMIN' as const, id: user?.id, name: user?.realName || user?.username,
    });
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN")
  @Put(":id/consultant")
  @ApiOperation({ summary: "修改销售顾问" })
  updateConsultant(@Param("id") id: string, @Body() dto: UpdateOrderConsultantDto, @CurrentUser() user: any) {
    return this.ordersService.updateSalesConsultant(+id, dto.salesConsultantId ?? null, {
      type: 'ADMIN' as const, id: user?.id, name: user?.realName || user?.username,
    });
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN")
  @Put(":id/custom-stage")
  @ApiOperation({ summary: "推进定制订单阶段（仅 orderType=CUSTOM 可用）" })
  advanceCustomStage(@Param("id") id: string, @Body() dto: AdvanceCustomStageDto, @CurrentUser() user: any) {
    return this.ordersService.advanceCustomStage(+id, dto.stage, {
      type: 'ADMIN' as const, id: user?.id, name: user?.realName || user?.username,
    });
  }
}
