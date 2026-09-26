import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import {
  CreateLeadFollowUpDto,
  CreateLeadReplyDto,
  ReleaseLeadLegalHoldDto,
  SetLeadLegalHoldDto,
  UpdateLeadDto,
} from './dto/lead.dto';
import { IDEMPOTENCY_HEADER } from './lead-submission';
import type {
  LeadListQuery,
  LeadNotificationFailureQuery,
  LeadRetentionDispositionQuery,
} from './leads.service';

type LeadStaffPrincipal = Pick<StaffPrincipal, 'id' | 'sessionFamilyId'>;

function setStaffPrivateNoStore(response: Response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Vary', 'Cookie, Authorization');
}

@ApiTags('统一线索管理')
@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
@ApiBearerAuth()
export class LeadsController {
  constructor(private service: LeadsService) {}

  @Get()
  @ApiOperation({ summary: '获取统一线索列表' })
  findAll(
    @Query() q: LeadListQuery,
    @CurrentUser() user: LeadStaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.service.findAll(q, user);
  }

  @Get('notification-failures')
  @ApiOperation({ summary: '获取咨询回复通知失败列表' })
  getNotificationFailures(
    @Query() q: LeadNotificationFailureQuery,
    @CurrentUser() user: LeadStaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.service.getNotificationFailures(q, user);
  }

  @Post('notification-failures/:eventId/retry')
  @ApiOperation({ summary: '人工重试可安全重投的咨询回复通知' })
  retryNotificationFailure(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @CurrentUser() user: LeadStaffPrincipal,
  ) {
    return this.service.retryNotificationFailure(eventId, idempotencyKey, user);
  }

  @Get('retention-disposition/preview')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '预览到期且未受法律保留的线索（零写入）' })
  previewRetentionDisposition(
    @Query() q: LeadRetentionDispositionQuery,
    @CurrentUser() user: LeadStaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.service.previewRetentionDispositionForActor(q, user);
  }

  @Get(':type/:id')
  @ApiOperation({ summary: '获取线索详情' })
  getDetail(
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser() user: LeadStaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.service.getLeadDetail(type, +id, user);
  }

  @Put(':type/:id')
  @ApiOperation({ summary: '更新线索（状态/备注/负责人/下次跟进）' })
  updateLead(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateLeadDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @CurrentUser() user: LeadStaffPrincipal,
  ) {
    return this.service.updateLead(type, id, body, idempotencyKey, user);
  }

  @Post(':type/:id/claim')
  @ApiOperation({ summary: '领取当前未分配线索' })
  claimLead(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: LeadStaffPrincipal,
  ) {
    return this.service.claimLead(type, id, user);
  }

  @Post(':type/:id/legal-hold')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '为线索设置法律保留' })
  setLegalHold(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetLeadLegalHoldDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @CurrentUser() user: LeadStaffPrincipal,
  ) {
    return this.service.setLegalHold(type, id, body.reason, idempotencyKey, user);
  }

  @Post(':type/:id/legal-hold/release')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '解除线索法律保留' })
  releaseLegalHold(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReleaseLeadLegalHoldDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @CurrentUser() user: LeadStaffPrincipal,
  ) {
    return this.service.releaseLegalHold(type, id, body.reason, idempotencyKey, user);
  }

  @Post(':type/:id/follow-up')
  @ApiOperation({ summary: '添加跟进记录' })
  addFollowUp(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateLeadFollowUpDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @CurrentUser() user: LeadStaffPrincipal,
  ) {
    return this.service.addFollowUp({
      leadType: type,
      leadId: id,
      ...body,
      idempotencyKey,
      actor: user,
    });
  }

  @Post(':type/:id/reply')
  @ApiOperation({ summary: '幂等回复已登录客户的咨询线索' })
  replyToLead(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateLeadReplyDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @CurrentUser() user: LeadStaffPrincipal,
  ) {
    return this.service.replyToLead(
      type,
      id,
      body,
      idempotencyKey,
      user,
    );
  }

  @Get(':type/:id/follow-ups')
  @ApiOperation({ summary: '获取跟进记录列表' })
  getFollowUps(
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser() user: LeadStaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.service.getFollowUps(type, +id, user);
  }
}
