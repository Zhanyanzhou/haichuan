import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { StatisticsService } from "./statistics.service";
import { StorefrontTrafficDto } from "./dto/storefront-traffic.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";

@ApiTags("数据统计")
@ApiBearerAuth()
@Controller("statistics")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN")
export class StatisticsController {
  constructor(private statisticsService: StatisticsService) {}

  @ApiOperation({ summary: "获取仪表盘统计数据" })
  @Get("dashboard")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  getDashboard(@CurrentUser() actor: StaffPrincipal) {
    return this.statisticsService.getDashboard(actor);
  }

  @ApiOperation({ summary: "计入一次正式页面访问，不保存访客身份" })
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(200)
  @Post("traffic")
  recordTraffic(
    @Body() body: StorefrontTrafficDto,
    @Req() request: { headers: { cookie?: unknown } },
  ) {
    return this.statisticsService.recordStorefrontTraffic(body, request.headers.cookie);
  }

  @ApiOperation({
    summary: "获取经营趋势(按指标按日聚合): orders/revenue/inquiries/pageViews/visitors",
  })
  @Get("trend")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  getTrend(
    @Query("days") days: string | undefined,
    @Query("metric") metric: string | undefined,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    const allowedMetrics = ["orders", "revenue", "inquiries", "pageViews", "visitors"];
    const safeMetric = (metric || "orders") as
      | "orders"
      | "revenue"
      | "inquiries"
      | "pageViews"
      | "visitors";
    if (!allowedMetrics.includes(safeMetric)) {
      throw new BadRequestException("不支持的指标类型");
    }
    const parsed = days ? +days : 7;
    const safeDays =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 90
        ? Math.floor(parsed)
        : 7;
    return this.statisticsService.getTrend(safeDays, safeMetric, actor);
  }
}
