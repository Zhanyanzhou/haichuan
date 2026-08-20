import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { TrackEventDto } from './dto/track-event.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}

  // 公开端点仅接受前台事件白名单；15/min 覆盖正常浏览与筛选，同时压低灌入成本。
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Public()
  @Post('track')
  async track(@Body() body: TrackEventDto) {
    await this.service.track(body);
    return { ok: true };
  }

  @Get('events')
  async getEvents(@Query() q: any) {
    return this.service.getEvents(q);
  }
}
