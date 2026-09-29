import {
  BadRequestException,
  Header,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';

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
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  async getOverview(
    @Query('days') days: string | undefined,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.service.getOverview(this.reportDays(days), actor);
  }

  @Get('visitors')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  async getVisitors(
    @Query('days') days: string | undefined,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.service.getVisitors(this.reportDays(days), actor);
  }

  @Get('events')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  async getEvents(
    @Query() q: BoundedListQueryDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.service.getEvents(q, actor);
  }
}
