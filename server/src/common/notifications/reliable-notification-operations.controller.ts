import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../decorators/current-user.decorator";
import { Roles } from "../decorators/roles.decorator";
import { RolesGuard } from "../guards/roles.guard";
import { JwtAuthGuard } from "../../modules/auth/jwt-auth.guard";
import {
  NotificationFailureQuery,
  ReliableNotificationOperationsService,
} from "./reliable-notification-operations.service";

@ApiTags("通知投递运维")
@ApiBearerAuth()
@Controller("notification-operations")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN")
export class ReliableNotificationOperationsController {
  constructor(private readonly service: ReliableNotificationOperationsService) {}

  @Get("failures")
  @ApiOperation({ summary: "获取可审计的通知投递失败列表" })
  listFailures(@Query() query: NotificationFailureQuery) {
    return this.service.listFailures(query);
  }

  @Post("failures/:eventId/retry")
  @ApiOperation({ summary: "人工重试可安全重投的通知" })
  retryFailure(
    @Param("eventId", ParseIntPipe) eventId: number,
    @CurrentUser() user: { id?: number },
  ) {
    return this.service.retryFailure(eventId, user?.id);
  }
}
