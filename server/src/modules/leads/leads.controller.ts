import { Controller, Get, Put, Post, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateLeadFollowUpDto,
  ReleaseLeadLegalHoldDto,
  SetLeadLegalHoldDto,
  UpdateLeadDto,
} from './dto/lead.dto';
import type {
  LeadListQuery,
  LeadNotificationFailureQuery,
  LeadRetentionDispositionQuery,
} from './leads.service';

@ApiTags('统一线索管理')
@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
@ApiBearerAuth()
export class LeadsController {
  constructor(private service: LeadsService) {}

  @Get()
  @ApiOperation({ summary: '获取统一线索列表' })
  findAll(@Query() q: LeadListQuery) {
    return this.service.findAll(q);
  }

  @Get('notification-failures')
  @ApiOperation({ summary: '获取咨询回复通知失败列表' })
  getNotificationFailures(@Query() q: LeadNotificationFailureQuery) {
    return this.service.getNotificationFailures(q);
  }

  @Post('notification-failures/:eventId/retry')
  @ApiOperation({ summary: '人工重试可安全重投的咨询回复通知' })
  retryNotificationFailure(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: { id?: number },
  ) {
    return this.service.retryNotificationFailure(eventId, user?.id);
  }

  @Get('retention-disposition/preview')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '预览到期且未受法律保留的线索（零写入）' })
  previewRetentionDisposition(@Query() q: LeadRetentionDispositionQuery) {
    return this.service.previewRetentionDisposition(q);
  }

  @Get(':type/:id')
  @ApiOperation({ summary: '获取线索详情' })
  getDetail(@Param('type') type: string, @Param('id') id: string) {
    return this.service.getLeadDetail(type, +id);
  }

  @Put(':type/:id')
  @ApiOperation({ summary: '更新线索（状态/备注/负责人/下次跟进）' })
  updateLead(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateLeadDto,
    @CurrentUser() user: { id?: number },
  ) {
    return this.service.updateLead(type, id, body, user?.id);
  }

  @Post(':type/:id/legal-hold')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '为线索设置法律保留' })
  setLegalHold(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetLeadLegalHoldDto,
    @CurrentUser() user: { id?: number },
  ) {
    return this.service.setLegalHold(type, id, body.reason, user?.id);
  }

  @Post(':type/:id/legal-hold/release')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '解除线索法律保留' })
  releaseLegalHold(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReleaseLeadLegalHoldDto,
    @CurrentUser() user: { id?: number },
  ) {
    return this.service.releaseLegalHold(type, id, body.reason, user?.id);
  }

  @Post(':type/:id/follow-up')
  @ApiOperation({ summary: '添加跟进记录' })
  addFollowUp(
    @Param('type') type: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateLeadFollowUpDto,
    @CurrentUser() user: { id?: number },
  ) {
    return this.service.addFollowUp({
      leadType: type,
      leadId: id,
      ...body,
      createdBy: user?.id,
    });
  }

  @Get(':type/:id/follow-ups')
  @ApiOperation({ summary: '获取跟进记录列表' })
  getFollowUps(@Param('type') type: string, @Param('id') id: string) {
    return this.service.getFollowUps(type, +id);
  }
}
