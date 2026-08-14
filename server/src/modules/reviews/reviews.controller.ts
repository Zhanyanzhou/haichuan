import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, ModerateReviewDto } from './dto/review.dto';

@ApiTags('商品评价')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * 客户提交评价。@Public 旁通全局 JwtAuthGuard/RolesGuard（客户令牌会被 JwtStrategy 拒绝），
   * 再由方法级 CustomerAuthGuard 强制客户登录——与 customers 模块同模式。
   */
  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  @ApiOperation({ summary: '提交评价（订单完成后，先审后展）' })
  submit(@Req() request: any, @Body() dto: CreateReviewDto) {
    return this.reviewsService.submit(request.customer.id, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me')
  @ApiOperation({ summary: '我的评价（含审核状态）' })
  mine(@Req() request: any) {
    return this.reviewsService.listMine(request.customer.id);
  }

  // 注意：product/:productId 为公开读（仅 APPROVED + 昵称脱敏），
  // 必须置于需要 admin 鉴权的 @Get(':id') 之前避免路径捕获冲突（当前无 :id GET，防御性声明）
  @Public()
  @Get('product/:productId')
  @ApiOperation({ summary: '作品评价（公开，仅审核通过）' })
  listForProduct(
    @Param('productId') productId: string,
    @Query() query: { page?: string; pageSize?: string },
  ) {
    return this.reviewsService.listForProduct(+productId, {
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 10,
    });
  }

  // ===== 后台管理 =====

  @Get()
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: '评价管理列表（按状态筛选）' })
  listAll(@Query() query: any) {
    return this.reviewsService.listAll(query);
  }

  @Put(':id/moderate')
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: '审核评价（通过/驳回）+ 商家回复' })
  moderate(
    @Param('id') id: string,
    @Body() dto: ModerateReviewDto,
    @CurrentUser() user: any,
  ) {
    return this.reviewsService.moderate(+id, dto);
  }
}
