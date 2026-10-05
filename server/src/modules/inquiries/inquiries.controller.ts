import { Controller, Get, Post, Put, Param, Query, Body, Req, Res, UseGuards, Headers, ParseIntPipe } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InquiriesService } from './inquiries.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalCustomerAuthGuard } from '../customers/optional-customer-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Throttle } from '@nestjs/throttler';
import { BoundedListQueryDto } from '../../common/dto/bounded-list-query.dto';
import type {
  OptionalCustomerRequest,
  StaffPrincipal,
} from '../../common/security/authenticated-principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AssignInquiryDto, ReplyInquiryDto } from './dto/update-inquiry.dto';
import { IDEMPOTENCY_HEADER } from '../leads/lead-submission';
import { IdempotencyKey } from '../../common/idempotency/idempotency-key';

type InquiryStaffPrincipal = Pick<StaffPrincipal, 'id' | 'sessionFamilyId'>;

function setStaffPrivateNoStore(response: Response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Vary', 'Cookie, Authorization');
}

@ApiTags('咨询管理')
@Controller('inquiries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
export class InquiriesController {
  constructor(private inquiriesService: InquiriesService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: '查询咨询列表' })
  @Get() findAll(
    @Query() q: BoundedListQueryDto,
    @CurrentUser() user: InquiryStaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.inquiriesService.findAll(q, user);
  }

  @ApiOperation({ summary: '提交咨询（公开接口）' })
  // P0-6：公开写端点收紧限流（5/min），依赖 trust proxy 生效后按真实客户端 IP 计数
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public() @UseGuards(OptionalCustomerAuthGuard) @Post() create(
    @Req() request: OptionalCustomerRequest,
    @Body() dto: CreateInquiryDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.inquiriesService.create({
      ...dto,
      customer: request.customer,
      idempotencyKey,
    });
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '分配咨询处理人' })
  @Put(':id/assign') assign(
    @Param('id') id: string,
    @Body() body: AssignInquiryDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @CurrentUser() user: InquiryStaffPrincipal,
  ) {
    return this.inquiriesService.assign(
      +id,
      body.assignedTo,
      idempotencyKey,
      user,
    );
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '回复咨询' })
  @Put(':id/reply') reply(
    @Param('id', ParseIntPipe) sourceId: number,
    @Body() body: ReplyInquiryDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @CurrentUser() user: InquiryStaffPrincipal,
  ) {
    return this.inquiriesService.reply(
      sourceId,
      body,
      idempotencyKey,
      user,
    );
  }
}
