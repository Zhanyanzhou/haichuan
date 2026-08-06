import { Controller, Get, Put, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('统一线索管理')
@Controller('leads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeadsController {
  constructor(private service: LeadsService) {}

  @Get()
  @ApiOperation({ summary: '获取统一线索列表' })
  findAll(@Query() q: any) {
    return this.service.findAll(q);
  }

  @Get(':type/:id')
  @ApiOperation({ summary: '获取线索详情' })
  getDetail(@Param('type') type: string, @Param('id') id: string) {
    return this.service.getLeadDetail(type, +id);
  }

  @Put(':type/:id')
  @ApiOperation({ summary: '更新线索（状态/备注/负责人/下次跟进）' })
  updateLead(@Param('type') type: string, @Param('id') id: string, @Body() body: any) {
    return this.service.updateLead(type, +id, body);
  }

  @Post(':type/:id/follow-up')
  @ApiOperation({ summary: '添加跟进记录' })
  addFollowUp(@Param('type') type: string, @Param('id') id: string, @Body() body: any) {
    return this.service.addFollowUp({ leadType: type, leadId: +id, ...body });
  }

  @Get(':type/:id/follow-ups')
  @ApiOperation({ summary: '获取跟进记录列表' })
  getFollowUps(@Param('type') type: string, @Param('id') id: string) {
    return this.service.getFollowUps(type, +id);
  }
}
