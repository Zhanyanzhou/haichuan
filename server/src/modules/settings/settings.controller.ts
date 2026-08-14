import { Controller, Get, Put, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('系统设置')
@ApiBearerAuth()
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Public()
  @ApiOperation({ summary: '获取前台可见的店铺资料' })
  @Get('public')
  async getPublicSettings() {
    const settings = await this.settingsService.getSettings();
    return {
      siteName: settings.siteName,
      logo: settings.logo,
      seoTitle: settings.seoTitle,
      seoDescription: settings.seoDescription,
      seoKeywords: settings.seoKeywords,
      contactPhone: settings.contactPhone,
      contactEmail: settings.contactEmail,
      contactAddress: settings.contactAddress,
      businessHours: settings.businessHours,
    };
  }

  @ApiOperation({ summary: '获取系统设置' })
  @Get() getSettings() { return this.settingsService.getSettings(); }

  @ApiOperation({ summary: '更新系统设置' })
  @Put() updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() user: { id: number }) {
    return this.settingsService.updateSettings(dto, user.id);
  }

  @ApiOperation({ summary: '获取备份状态' })
  @Get('backup') getBackupStatus() { return this.settingsService.getBackupStatus(); }

  @ApiOperation({ summary: '获取系统日志' })
  @Get('logs') getLogs(@Query() query: any) { return this.settingsService.getLogs(query); }

  @Public()
  @ApiOperation({ summary: '获取功能开关' })
  @Get('flags') getFlags() {
    // 单一来源：与 CustomerCommerceGuard 读取同一环境变量。
    // 缺失或写错一律按关闭处理；前端据此隐藏交易 CTA，服务端守卫负责最终拦截。
    const commerceEnabled =
      process.env.CUSTOMER_COMMERCE_ENABLED?.trim().toLowerCase() === 'true';
    return {
      commerceEnabled,
      cartEnabled: commerceEnabled,
      paymentEnabled: commerceEnabled,
      analyticsDashboardEnabled: false,
    };
  }
}
