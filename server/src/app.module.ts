import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "./common/prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { AttributesModule } from "./modules/attributes/attributes.module";
import { ProductsModule } from "./modules/products/products.module";
import { UploadModule } from "./modules/upload/upload.module";
import { GoldPriceModule } from "./modules/gold-price/gold-price.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { WechatAuthModule } from "./modules/wechat-auth/wechat-auth.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { TradeEventsModule } from "./modules/trade-events/trade-events.module";
import { FulfillmentModule } from "./modules/fulfillment/fulfillment.module";
import { RefundsModule } from "./modules/refunds/refunds.module";
import { AfterSalesModule } from "./modules/after-sales/after-sales.module";
import { QuotationsModule } from "./modules/quotations/quotations.module";
import { CartModule } from "./modules/cart/cart.module";
import { InquiriesModule } from "./modules/inquiries/inquiries.module";
import { AiClassifyModule } from "./modules/ai-classify/ai-classify.module";
import { MarketingModule } from "./modules/marketing/marketing.module";
import { StatisticsModule } from "./modules/statistics/statistics.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { SelectionInquiryModule } from "./modules/selection-inquiry/selection-inquiry.module";
import { LeadsModule } from "./modules/leads/leads.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { PartnerApplicationsModule } from "./modules/partner-applications/partner-applications.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { RecommendationsModule } from "./modules/recommendations/recommendations.module";
import { PageModulesModule } from "./modules/page-modules/page-modules.module";
import { KimiModule } from "./common/kimi/kimi.module";
import { MailerModule } from "./common/mailer/mailer.module";
import { PaymentGatewayModule } from "./common/payment-gateway/payment-gateway.module";
import { LogisticsTrackingModule } from "./common/logistics-tracking/logistics-tracking.module";
import { SmsModule } from "./common/sms/sms.module";
import { JwtAuthGuard } from "./modules/auth/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { AuditLogInterceptor } from "./common/interceptors/audit-log.interceptor";
import { HealthController } from "./common/health/health.controller";
import { LoggerModule } from "nestjs-pino";
import { ShippingTemplatesModule } from "./modules/shipping-templates/shipping-templates.module";

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 结构化日志（nestjs-pino）：生产环境 JSON 单行、开发环境彩色可读。
    // 健康探针不计入访问日志；请求序列化只保留 method/url/remoteAddress，
    // 避免打印 Authorization / Cookie 等敏感请求头。
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== "production"
            ? {
                target: "pino-pretty",
                options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
              }
            : undefined,
        autoLogging: {
          ignore: (req) => {
            const url = (req as { url?: string }).url ?? "";
            return (
              url.startsWith("/api/health") || url.startsWith("/api/ready")
            );
          },
        },
        serializers: {
          req: (req: {
            method: string;
            url: string;
            remoteAddress?: string;
          }) => ({
            method: req.method,
            url: req.url,
            remoteAddress: req.remoteAddress,
          }),
          res: () => undefined,
        },
      },
    }),
    // 全局速率限制：默认 60次/分钟
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    PrismaModule,
    KimiModule,
    MailerModule,
    PaymentGatewayModule,
    LogisticsTrackingModule,
    SmsModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    AttributesModule,
    ProductsModule,
    UploadModule,
    GoldPriceModule,
    InventoryModule,
    OrdersModule,
    CustomersModule,
    WechatAuthModule,
    PaymentsModule,
    // 交易域扩展模块：事件时间线、履约、退款、售后
    TradeEventsModule,
    FulfillmentModule,
    RefundsModule,
    AfterSalesModule,
    QuotationsModule,
    CartModule,
    InquiriesModule,
    AiClassifyModule,
    MarketingModule,
    StatisticsModule,
    PageModulesModule,
    SettingsModule,
    SelectionInquiryModule,
    LeadsModule,
    AnalyticsModule,
    PartnerApplicationsModule,
    RecommendationsModule,
    ReviewsModule,
    ShippingTemplatesModule,
  ],
  providers: [
    // 默认认证、默认角色判定：新增接口必须显式标注 @Public() 才允许匿名访问。
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // 全局启用 ThrottlerGuard
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
