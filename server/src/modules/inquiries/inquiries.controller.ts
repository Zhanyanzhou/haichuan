import { Controller, Get, Post, Put, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InquiriesService } from './inquiries.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('咨询管理')
@Controller('inquiries')
export class InquiriesController {
  constructor(private inquiriesService: InquiriesService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: '查询咨询列表' })
  @UseGuards(JwtAuthGuard) @Get() findAll(@Query() q: any) { return this.inquiriesService.findAll(q); }

  @ApiOperation({ summary: '提交咨询（公开接口）' })
  @Public() @Post() create(@Body() b: any) { return this.inquiriesService.create(b); }

  @ApiBearerAuth()
  @ApiOperation({ summary: '分配咨询处理人' })
  @UseGuards(JwtAuthGuard) @Put(':id/assign') assign(@Param('id') id: string, @Body('assignedTo') uid: number) { return this.inquiriesService.assign(+id, uid); }

  @ApiBearerAuth()
  @ApiOperation({ summary: '回复咨询' })
  @UseGuards(JwtAuthGuard) @Put(':id/reply') reply(@Param('id') id: string, @Body('reply') r: string) { return this.inquiriesService.reply(+id, r); }
}
