import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MarketingService } from './marketing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

function setStaffPrivateNoStore(response: Response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Vary', 'Cookie, Authorization');
}

@ApiTags('营销管理')
@ApiBearerAuth()
@Controller('marketing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class MarketingController {
  constructor(private marketingService: MarketingService) {}

  @ApiOperation({ summary: '获取促销活动列表' })
  @Get('promotions')
  getPromotions(
    @CurrentUser() actor: StaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.marketingService.getPromotions(actor);
  }

  @ApiOperation({ summary: '创建促销活动' })
  @Post('promotions')
  createPromotion(
    @Body() dto: CreatePromotionDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.marketingService.createPromotion(dto, actor);
  }

  @ApiOperation({ summary: '更新促销活动' })
  @Put('promotions/:id')
  updatePromotion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePromotionDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.marketingService.updatePromotion(id, dto, actor);
  }

  @ApiOperation({ summary: '删除促销活动' })
  @Delete('promotions/:id')
  deletePromotion(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.marketingService.deletePromotion(id, actor);
  }

  @ApiOperation({ summary: '获取优惠券列表' })
  @Get('coupons')
  getCoupons(
    @CurrentUser() actor: StaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.marketingService.getCoupons(actor);
  }

  // 注意：usable 必须置于 @Get('coupons/:id') 之类参数路由之前（当前无参数路由，保持防御性顺序）
  @ApiOperation({ summary: '建单可用券查询（按订单金额试算折扣）' })
  @Get('coupons/usable')
  listUsableCoupons(
    @Query('amountCents') amountCents: string,
    @CurrentUser() actor: StaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.marketingService.listUsableCouponsForStaff(
      Number(amountCents) || 0,
      actor,
    );
  }

  @ApiOperation({ summary: '获取优惠券统计' })
  @Get('coupons/stats')
  getCouponStats(
    @CurrentUser() actor: StaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.marketingService.getCouponStats(actor);
  }

  @ApiOperation({ summary: '创建优惠券' })
  @Post('coupons')
  createCoupon(
    @Body() dto: CreateCouponDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.marketingService.createCoupon(dto, actor);
  }

  @ApiOperation({ summary: '更新优惠券' })
  @Put('coupons/:id')
  updateCoupon(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCouponDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.marketingService.updateCoupon(id, dto, actor);
  }
}
