import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FulfillmentService } from './fulfillment.service';
import { DispatchFulfillmentDto, FulfillmentQueryDto, UpdateFulfillmentStatusDto } from './dto/fulfillment.dto';

// 履约角色边界（任务优先问题 #5）：
// - 查看/发货/状态更新：SUPER_ADMIN、ADMIN、WAREHOUSE（仓储负责发货）；
// - 客服只读不在此接口授予（客服通过订单中心查看）。
@ApiTags('履约管理')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE')
@Controller('fulfillments')
export class FulfillmentController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @ApiBearerAuth()
  @Get()
  findAll(@Query() query: FulfillmentQueryDto) {
    return this.fulfillmentService.findAll(query);
  }

  @ApiBearerAuth()
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.fulfillmentService.findById(+id);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE')
  @Put(':id/dispatch')
  dispatch(@Param('id') id: string, @Body() dto: DispatchFulfillmentDto, @CurrentUser() user: any) {
    return this.fulfillmentService.dispatch(+id, dto, {
      type: 'ADMIN', id: user?.id, name: user?.realName || user?.username,
    });
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE')
  @Put(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateFulfillmentStatusDto, @CurrentUser() user: any) {
    return this.fulfillmentService.updateStatus(+id, dto, {
      type: 'ADMIN', id: user?.id, name: user?.realName || user?.username,
    });
  }
}
