import { Controller, Get, Param, ParseIntPipe, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "../decorators/current-user.decorator";
import { Roles } from "../decorators/roles.decorator";
import { RolesGuard } from "../guards/roles.guard";
import { JwtAuthGuard } from "../../modules/auth/jwt-auth.guard";
import type { StaffPrincipal } from "../security/authenticated-principal";
import { IdempotencyKey } from "../idempotency/idempotency-key";
import {
  NotificationFailureQuery,
  ReliableNotificationOperationsService,
} from "./reliable-notification-operations.service";

function setStaffPrivateNoStore(response: Response) {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Vary", "Cookie, Authorization");
}

@ApiTags("通知投递运维")
@ApiBearerAuth()
@Controller("notification-operations")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN")
export class ReliableNotificationOperationsController {
  constructor(private readonly service: ReliableNotificationOperationsService) {}

  @Get("failures")
  @ApiOperation({ summary: "获取可审计的通知投递失败列表" })
  listFailures(
    @Query() query: NotificationFailureQuery,
    @CurrentUser() user: Pick<StaffPrincipal, "id" | "sessionFamilyId">,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.service.listFailures(query, user);
  }

  @Post("failures/:eventId/retry")
  @ApiOperation({ summary: "人工重试可安全重投的通知" })
  retryFailure(
    @Param("eventId", ParseIntPipe) eventId: number,
    @IdempotencyKey() idempotencyKey: string,
    @CurrentUser() user: Pick<StaffPrincipal, "id" | "sessionFamilyId">,
  ) {
    return this.service.retryFailure(eventId, idempotencyKey, user);
  }
}
