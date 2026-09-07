import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { SettingsModule } from "../../modules/settings/settings.module";
import { ObservabilityInterceptor } from "./observability.interceptor";
import { OperationalMetricsService } from "./operational-metrics.service";

@Module({
  imports: [SettingsModule],
  providers: [
    OperationalMetricsService,
    { provide: APP_INTERCEPTOR, useClass: ObservabilityInterceptor },
  ],
  exports: [OperationalMetricsService],
})
export class ObservabilityModule {}

