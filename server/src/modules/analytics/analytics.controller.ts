import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import {
  AnalyticsService,
  extractTrustedAnalyticsGeo,
} from './analytics.service';
import { TrackEventDto } from './dto/track-event.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Throttle } from '@nestjs/throttler';
import { BoundedListQueryDto } from '../../common/dto/bounded-list-query.dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}

  private reportDays(value?: string): number {
    const parsed = value === undefined ? 30 : Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 90) {
      throw new BadRequestException('统计周期必须是 1 至 90 天的整数');
    }
    return parsed;
  }

  // 公开端点仅接受前台事件白名单；15/min 覆盖正常浏览与筛选，同时压低灌入成本。
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Public()
  @Post('track')
  async track(
    @Body() body: TrackEventDto,
    @Req() request: { headers: IncomingHttpHeaders },
  ) {
    const accepted = await this.service.track(
      body,
      extractTrustedAnalyticsGeo(request.headers),
    );
    return { accepted };
  }

  @Get('overview')
  async getOverview(@Query('days') days?: string) {
    return this.service.getOverview(this.reportDays(days));
  }

  @Get('visitors')
  async getVisitors(@Query('days') days?: string) {
    return this.service.getVisitors(this.reportDays(days));
  }

  @Get('events')
  async getEvents(@Query() q: BoundedListQueryDto) {
    return this.service.getEvents(q);
  }
}
