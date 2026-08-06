import { Controller, Get, Put, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('系统设置')
@ApiBearerAuth()
@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @ApiOperation({ summary: '获取系统设置' })
  @Get() getSettings() { return this.settingsService.getSettings(); }

  @ApiOperation({ summary: '更新系统设置' })
  @Put() updateSettings(@Body() body: any) { return this.settingsService.updateSettings(body); }

  @ApiOperation({ summary: '获取备份状态' })
  @Get('backup') getBackupStatus() { return this.settingsService.getBackupStatus(); }

  @ApiOperation({ summary: '获取系统日志' })
  @Get('logs') getLogs(@Query() query: any) { return this.settingsService.getLogs(query); }
}
