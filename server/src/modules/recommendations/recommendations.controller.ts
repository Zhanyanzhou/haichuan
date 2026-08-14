import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

// 全局 JwtAuthGuard 拒绝客户令牌；此处用 @Public() 旁通，再由 CustomerAuthGuard 强制客户登录。
// 未登录直接 401，无法获得任何推荐结果（任务书第六节）。
@ApiTags('商品推荐')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly service: RecommendationsService) {}

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('hot')
  @ApiOperation({ summary: '热门商品（登录后访问，按可见范围过滤）' })
  getHot(@Req() request: any, @Query('limit') limit?: string) {
    return this.service.getHot(request.customer, this.parseLimit(limit));
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('for-you')
  @ApiOperation({ summary: '猜你喜欢（基于浏览历史，登录后访问）' })
  getForYou(@Req() request: any, @Query('limit') limit?: string) {
    return this.service.getForYou(request.customer, this.parseLimit(limit));
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('similar/:productId')
  @ApiOperation({ summary: '相似商品（同分类/材质，登录后访问）' })
  getSimilar(
    @Req() request: any,
    @Param('productId') productId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getSimilar(+productId, request.customer, this.parseLimit(limit));
  }

  private parseLimit(limit?: string): number {
    const n = Number(limit);
    if (!Number.isInteger(n) || n <= 0) return 12;
    return Math.min(24, n);
  }
}
