import { Body, Controller, Get, Header, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
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
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  findAll(
    @Query() query: RefundQueryDto,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.refundsService.findAll(query, user);
  }

  /** 退款创建前核对权威原付款、分期门禁和每笔剩余可退额度。 */
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('orders/:orderId/eligible-payments')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  getCreateEligibility(
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.refundsService.getCreateEligibility(orderId, user);
  }

  @ApiBearerAuth()
  @Get(':id')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.refundsService.findById(id, user);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateRefundDto, @CurrentUser() user: StaffPrincipal) {
    return this.refundsService.create({ ...dto, operator: user });
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id/review')
  review(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewRefundDto, @CurrentUser() user: StaffPrincipal) {
    return this.refundsService.review(
      id,
      dto.action as 'APPROVED' | 'REJECTED',
      dto.reviewNote,
      user,
    );
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id/execute')
  execute(@Param('id', ParseIntPipe) id: number, @Body() dto: ExecuteRefundDto, @CurrentUser() user: StaffPrincipal) {
    return this.refundsService.execute(
      id,
      dto.action as 'COMPLETED' | 'FAILED',
      dto.gatewayRefundNo,
      user,
      dto.reviewNote,
    );
  }

  /** 发起或按同一商户退款单号重试微信原路退款；不会人工标记成功。 */
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Put(':id/channel')
  startChannel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: StaffPrincipal) {
    return this.refundsService.startOnlineRefund(id, user);
  }

  /** 主动查询原渠道退款状态；查询到成功时会走与通知相同的核销管线。 */
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get(':id/channel')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  queryChannel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: StaffPrincipal) {
    return this.refundsService.queryOnlineRefund(id, user);
  }
}
