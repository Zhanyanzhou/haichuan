import { Controller, Get, Post, Put, Param, Query, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InquiriesService } from './inquiries.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalCustomerAuthGuard } from '../customers/optional-customer-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('咨询管理')
@Controller('inquiries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
export class InquiriesController {
  constructor(private inquiriesService: InquiriesService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: '查询咨询列表' })
  @Get() findAll(@Query() q: any) { return this.inquiriesService.findAll(q); }

  @ApiOperation({ summary: '提交咨询（公开接口）' })
  @Public() @UseGuards(OptionalCustomerAuthGuard) @Post() create(@Req() request: any, @Body() b: any) { return this.inquiriesService.create({ ...b, customer: request.customer }); }

  @ApiBearerAuth()
  @ApiOperation({ summary: '分配咨询处理人' })
  @Put(':id/assign') assign(@Param('id') id: string, @Body('assignedTo') uid: number) { return this.inquiriesService.assign(+id, uid); }

  @ApiBearerAuth()
  @ApiOperation({ summary: '回复咨询' })
  @Put(':id/reply') reply(@Param('id') id: string, @Body('reply') r: string) { return this.inquiriesService.reply(+id, r); }
}
