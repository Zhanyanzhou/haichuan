import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MarketingService } from './marketing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

@ApiTags('营销管理')
@ApiBearerAuth()
@Controller('marketing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class MarketingController {
  constructor(private marketingService: MarketingService) {}

  @ApiOperation({ summary: '获取促销活动列表' })
  @Get('promotions') getPromotions() { return this.marketingService.getPromotions(); }

  @ApiOperation({ summary: '创建促销活动' })
  @Post('promotions') createPromotion(@Body() dto: CreatePromotionDto) { return this.marketingService.createPromotion(dto); }

  @ApiOperation({ summary: '更新促销活动' })
  @Put('promotions/:id') updatePromotion(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePromotionDto) { return this.marketingService.updatePromotion(id, dto); }

  @ApiOperation({ summary: '删除促销活动' })
  @Delete('promotions/:id') deletePromotion(@Param('id') id: string) { return this.marketingService.deletePromotion(+id); }

  @ApiOperation({ summary: '获取优惠券列表' })
  @Get('coupons') getCoupons() { return this.marketingService.getCoupons(); }

  // 注意：usable 必须置于 @Get('coupons/:id') 之类参数路由之前（当前无参数路由，保持防御性顺序）
  @ApiOperation({ summary: '建单可用券查询（按订单金额试算折扣）' })
  @Get('coupons/usable')
  listUsableCoupons(@Query('amountCents') amountCents: string) {
    return this.marketingService.listUsableCoupons(Number(amountCents) || 0);
  }

  @ApiOperation({ summary: '获取优惠券统计' })
  @Get('coupons/stats') getCouponStats() { return this.marketingService.getCouponStats(); }

  @ApiOperation({ summary: '创建优惠券' })
  @Post('coupons') createCoupon(@Body() dto: CreateCouponDto) { return this.marketingService.createCoupon(dto); }

  @ApiOperation({ summary: '更新优惠券' })
  @Put('coupons/:id') updateCoupon(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCouponDto) { return this.marketingService.updateCoupon(id, dto); }
}
