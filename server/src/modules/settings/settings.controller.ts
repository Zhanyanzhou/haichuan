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
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import {
  isCustomerCommerceEnabled,
  isCustomerQuotationOrderingEnabled,
  isPartnerApplicationsWriteReady,
  isPaymentGatewayTransactionsEnabled,
  resolvePartnerAgreementContract,
} from "../../common/release/release-profile";

@ApiTags("系统设置")
@ApiBearerAuth()
@Controller("settings")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN")
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Public()
  @ApiOperation({ summary: "获取联系页可公开的联系方式" })
  @Get("public-contact")
  @Header("Cache-Control", "no-store")
  getPublicContact() {
    return this.settingsService.getPublicContactSettings();
  }

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
      contactWechat: settings.contactWechat,
      contactWechatQrCode: settings.contactWechatQrCode,
      contactEmail: settings.contactEmail,
      contactAddress: settings.contactAddress,
      storeName: settings.storeName,
      businessHours: settings.businessHours,
      storeMapUrl: settings.storeMapUrl,
    };
  }

  @ApiOperation({ summary: "获取系统设置" })
  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  getSettings(@CurrentUser() actor: StaffPrincipal) {
    return this.settingsService.getSettings(actor);
  }

  @ApiOperation({ summary: "更新系统设置" })
  @Put()
  updateSettings(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.settingsService.updateSettings(dto, actor);
  }

  @ApiOperation({ summary: "获取公开站点机器可读发布准备度" })
  @Get("publication-readiness")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  getPublicationReadiness(@CurrentUser() actor: StaffPrincipal) {
    return this.settingsService.getPublicationReadiness(actor);
  }

  @ApiOperation({ summary: "获取备份状态" })
  @Get("backup")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  getBackupStatus(@CurrentUser() actor: StaffPrincipal) {
    return this.settingsService.getBackupStatus(actor);
  }

  @ApiOperation({ summary: "获取系统日志" })
  @Get("logs")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  getLogs(
    @Query() query: AuditLogQueryDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.settingsService.getLogs(query, actor);
  }

  @Public()
  @ApiOperation({ summary: "获取功能开关" })
  @Get("flags")
  getFlags() {
    // 创建订单与 CustomerCommerceGuard 共用发布档位和交易开关；支付单独读取网关开关。
    // 购物车准备与成交分离：功能开关读取成功时 cartEnabled 为 true，不再跟随交易开关。
    // 功能开关读取失败时，前台回退 SAFE_FLAGS，购物车准备一并关闭。
    const commerceEnabled = isCustomerCommerceEnabled();
    // 行为分析后台：默认开启；显式设置 ANALYTICS_DASHBOARD_ENABLED=false 才关闭。
    const analyticsDashboardEnabled =
      process.env.ANALYTICS_DASHBOARD_ENABLED?.trim().toLowerCase() !== "false";
    const partnerApplicationsWriteEnabled = isPartnerApplicationsWriteReady();
    const partnerAgreementContract = partnerApplicationsWriteEnabled
      ? resolvePartnerAgreementContract()
      : null;
    return {
      commerceEnabled,
      cartEnabled: true,
      paymentEnabled: isPaymentGatewayTransactionsEnabled(),
      quotationOrderingEnabled: isCustomerQuotationOrderingEnabled(),
      partnerApplicationsWriteEnabled,
      partnerAgreementVersion: partnerAgreementContract?.version ?? null,
      analyticsDashboardEnabled,
    };
  }
}
