import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@Controller('analytics')
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}

  @Public()
  @Post('track')
  async track(@Body() body: any) {
    await this.service.track(body);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('events')
  async getEvents(@Query() q: any) {
    return this.service.getEvents(q);
  }
}
