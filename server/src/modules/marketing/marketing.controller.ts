import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MarketingService } from './marketing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('营销管理')
@ApiBearerAuth()
@Controller('marketing')
@UseGuards(JwtAuthGuard)
export class MarketingController {
  constructor(private marketingService: MarketingService) {}

  @ApiOperation({ summary: '获取促销活动列表' })
  @Get('promotions') getPromotions() { return this.marketingService.getPromotions(); }

  @ApiOperation({ summary: '创建促销活动' })
  @Post('promotions') createPromotion(@Body() b: any) { return this.marketingService.createPromotion(b); }

  @ApiOperation({ summary: '更新促销活动' })
  @Put('promotions/:id') updatePromotion(@Param('id') id: string, @Body() b: any) { return this.marketingService.updatePromotion(+id, b); }

  @ApiOperation({ summary: '删除促销活动' })
  @Delete('promotions/:id') deletePromotion(@Param('id') id: string) { return this.marketingService.deletePromotion(+id); }

  @ApiOperation({ summary: '获取优惠券列表' })
  @Get('coupons') getCoupons() { return this.marketingService.getCoupons(); }

  @ApiOperation({ summary: '获取优惠券统计' })
  @Get('coupons/stats') getCouponStats() { return this.marketingService.getCouponStats(); }

  @ApiOperation({ summary: '创建优惠券' })
  @Post('coupons') createCoupon(@Body() b: any) { return this.marketingService.createCoupon(b); }

  @ApiOperation({ summary: '更新优惠券' })
  @Put('coupons/:id') updateCoupon(@Param('id') id: string, @Body() b: any) { return this.marketingService.updateCoupon(+id, b); }
}
