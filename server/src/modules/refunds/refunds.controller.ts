import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RefundsService } from './refunds.service';
import { CreateRefundDto, ExecuteRefundDto, RefundQueryDto, ReviewRefundDto } from './dto/refund.dto';

// 退款角色边界（任务优先问题 #5）：
// - 查看：SUPER_ADMIN、ADMIN、CUSTOMER_SERVICE（客服需跟进售后退款）；
// - 申请/审核/执行：仅 SUPER_ADMIN、ADMIN；
// - EDITOR、WAREHOUSE 无退款权限。
@ApiTags('退款管理')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @ApiBearerAuth()
  @Get()
  findAll(@Query() query: RefundQueryDto) {
    return this.refundsService.findAll(query);
  }

  @ApiBearerAuth()
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.refundsService.findById(+id);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateRefundDto, @CurrentUser() user: any) {
    return this.refundsService.create({ ...dto, operator: { type: 'ADMIN', id: user?.id, name: user?.realName || user?.username } });
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id/review')
  review(@Param('id') id: string, @Body() dto: ReviewRefundDto, @CurrentUser() user: any) {
    return this.refundsService.review(
      +id,
      dto.action as 'APPROVED' | 'REJECTED',
      dto.reviewNote,
      { type: 'ADMIN', id: user?.id, name: user?.realName || user?.username },
    );
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id/execute')
  execute(@Param('id') id: string, @Body() dto: ExecuteRefundDto, @CurrentUser() user: any) {
    return this.refundsService.execute(
      +id,
      dto.action as 'COMPLETED' | 'FAILED',
      dto.gatewayRefundNo,
      { type: 'ADMIN', id: user?.id, name: user?.realName || user?.username },
    );
  }
}
