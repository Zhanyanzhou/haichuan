import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('数据统计')
@ApiBearerAuth()
@Controller('statistics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class StatisticsController {
  constructor(private statisticsService: StatisticsService) {}

  @ApiOperation({ summary: '获取仪表盘统计数据' })
  @Get('dashboard') getDashboard() { return this.statisticsService.getDashboard(); }

  @ApiOperation({ summary: '获取热门商品排行' })
  @Get('hot-products') getHotProducts(@Query('limit') limit?: string) { return this.statisticsService.getHotProducts(limit ? +limit : 10); }

  @ApiOperation({ summary: '获取订单趋势数据' })
  @Get('order-trend') getOrderTrend(@Query('days') days?: string) { return this.statisticsService.getOrderTrend(days ? +days : 7); }

  @ApiOperation({ summary: '获取经营趋势(按指标按日聚合): orders/revenue/inquiries/pageViews' })
  @Get('trend')
  getTrend(
    @Query('days') days?: string,
    @Query('metric') metric?: string,
  ) {
    const allowedMetrics = ['orders', 'revenue', 'inquiries', 'pageViews'];
    const safeMetric = (metric || 'orders') as 'orders' | 'revenue' | 'inquiries' | 'pageViews';
    if (!allowedMetrics.includes(safeMetric)) {
      throw new BadRequestException('不支持的指标类型');
    }
    const parsed = days ? +days : 7;
    const safeDays = Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? Math.floor(parsed) : 7;
    return this.statisticsService.getTrend(safeDays, safeMetric);
  }
}
