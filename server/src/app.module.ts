import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { UploadModule } from './modules/upload/upload.module';
import { GoldPriceModule } from './modules/gold-price/gold-price.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CustomersModule } from './modules/customers/customers.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CartModule } from './modules/cart/cart.module';
import { InquiriesModule } from './modules/inquiries/inquiries.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AiClassifyModule } from './modules/ai-classify/ai-classify.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SelectionInquiryModule } from './modules/selection-inquiry/selection-inquiry.module';
import { LeadsModule } from './modules/leads/leads.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ContentSlotsModule } from './modules/content-slots/content-slots.module';
import { PageModulesModule } from './modules/page-modules/page-modules.module';
import { QueueModule } from './queue/queue.module';
import { KimiModule } from './common/kimi/kimi.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 全局速率限制：默认 60次/分钟
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
    PrismaModule,
    KimiModule,
    QueueModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    UploadModule,
    GoldPriceModule,
    InventoryModule,
    OrdersModule,
    CustomersModule,
    PaymentsModule,
    CartModule,
    InquiriesModule,
    NotificationsModule,
    AiClassifyModule,
    MarketingModule,
    StatisticsModule,
    ContentSlotsModule,
    PageModulesModule,
    SettingsModule,
    SelectionInquiryModule,
    LeadsModule,
    AnalyticsModule,
  ],
  providers: [
    // 全局启用 ThrottlerGuard
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
