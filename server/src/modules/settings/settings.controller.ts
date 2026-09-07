import { Controller, Get, Header, Put, Query, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { requirePublishedPublicContentLocale } from "../../common/content-locale";
import { AuditLogQueryDto } from "./dto/audit-log-query.dto";
import {
  isCustomerCommerceEnabled,
  isPartnerApplicationsWriteEnabled,
} from "../../common/release/release-profile";

@ApiTags("系统设置")
@ApiBearerAuth()
@Controller("settings")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN")
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Public()
  @ApiOperation({ summary: "获取前台可见的店铺资料" })
  @Get("public")
  @Header("Cache-Control", "no-store")
  async getPublicSettings(@Query("locale") locale?: string) {
    requirePublishedPublicContentLocale(locale);
    const settings = await this.settingsService.getPublishedSettings();
    return {
      siteName: settings.siteName,
      brandPresentationMode: settings.brandPresentationMode,
      logo: settings.logo,
      seoTitle: settings.seoTitle,
      seoDescription: settings.seoDescription,
      seoKeywords: settings.seoKeywords,
      contactPhone: settings.contactPhone,
      contactEmail: settings.contactEmail,
      contactAddress: settings.contactAddress,
      storeName: settings.storeName,
      businessHours: settings.businessHours,
      storeMapUrl: settings.storeMapUrl,
    };
  }

  @ApiOperation({ summary: "获取系统设置" })
  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @ApiOperation({ summary: "更新系统设置" })
  @Put()
  updateSettings(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.settingsService.updateSettings(dto, user.id);
  }

  @ApiOperation({ summary: "获取公开站点机器可读发布准备度" })
  @Get("publication-readiness")
  getPublicationReadiness() {
    return this.settingsService.getPublicationReadiness();
  }

  @ApiOperation({ summary: "获取备份状态" })
  @Get("backup")
  getBackupStatus() {
    return this.settingsService.getBackupStatus();
  }

  @ApiOperation({ summary: "获取系统日志" })
  @Get("logs")
  getLogs(@Query() query: AuditLogQueryDto) {
    return this.settingsService.getLogs(query);
  }

  @Public()
  @ApiOperation({ summary: "获取功能开关" })
  @Get("flags")
  getFlags() {
    // 单一来源：与 CustomerCommerceGuard 共用发布档位和交易开关判定。
    // 缺失、写错或 lead-generation 档位一律关闭；服务端守卫负责最终拦截。
    const commerceEnabled = isCustomerCommerceEnabled();
    // 行为分析后台：默认开启；显式设置 ANALYTICS_DASHBOARD_ENABLED=false 才关闭。
    const analyticsDashboardEnabled =
      process.env.ANALYTICS_DASHBOARD_ENABLED?.trim().toLowerCase() !== "false";
    return {
      commerceEnabled,
      cartEnabled: commerceEnabled,
      paymentEnabled: commerceEnabled,
      partnerApplicationsWriteEnabled: isPartnerApplicationsWriteEnabled(),
      analyticsDashboardEnabled,
    };
  }
}
