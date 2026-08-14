import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PartnerApplicationsService } from './partner-applications.service';
import { CreatePartnerApplicationDto } from './dto/create-partner-application.dto';
import { ReviewPartnerApplicationDto } from './dto/review-partner-application.dto';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

// 鉴权说明：全局 JwtAuthGuard 拒绝客户令牌。
// - 客户侧接口用 @Public() 旁通全局守卫，再由方法级 CustomerAuthGuard 完成客户鉴权；
// - 后台接口不标 @Public，全局 JwtAuthGuard + RolesGuard 生效（要求员工 token + 角色）。
@ApiTags('合作商家申请')
@Controller('partner-applications')
export class PartnerApplicationsController {
  constructor(private readonly service: PartnerApplicationsService) {}

  /* ═══ 客户侧 ═══ */
  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me')
  @ApiOperation({ summary: '获取我的最近申请与当前合作状态' })
  getMyApplication(@Req() request: any) {
    return this.service.findMyLatest(request.customer.id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post()
  @ApiOperation({ summary: '提交合作申请' })
  submit(@Req() request: any, @Body() dto: CreatePartnerApplicationDto) {
    return this.service.submit(request.customer.id, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Put('me')
  @ApiOperation({ summary: '补充资料 / 被驳回后重新提交（新建历史版本）' })
  resubmit(@Req() request: any, @Body() dto: CreatePartnerApplicationDto) {
    // 与 submit 同逻辑：新增一条历史记录，保留旧版本
    return this.service.submit(request.customer.id, dto);
  }

  /* ═══ 后台（员工）═══ */
  // 以下方法不标 @Public：全局 JwtAuthGuard + RolesGuard 生效。
  // 静态路由 me 必须在 :id 之前定义，否则 /me 会被 :id 捕获。
  @ApiBearerAuth()
  @Roles('CUSTOMER_SERVICE', 'ADMIN', 'SUPER_ADMIN')
  @Get()
  @ApiOperation({ summary: '合作申请列表（按状态筛选、分页）' })
  list(
    @Query() query: { page?: string; pageSize?: string; status?: string; keyword?: string },
  ) {
    return this.service.findAll(query);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER_SERVICE', 'ADMIN', 'SUPER_ADMIN')
  @Get(':id')
  @ApiOperation({ summary: '合作申请详情' })
  detail(@Param('id') id: string) {
    return this.service.findById(+id);
  }

  @ApiBearerAuth()
  @Roles('CUSTOMER_SERVICE', 'ADMIN', 'SUPER_ADMIN')
  @Put(':id/review')
  @ApiOperation({ summary: '审核合作申请（通过/补充/驳回/暂停）' })
  review(
    @Req() request: any,
    @Param('id') id: string,
    @Body() dto: ReviewPartnerApplicationDto,
  ) {
    // request.user 由全局 JwtAuthGuard 注入（员工身份）
    return this.service.review(+id, dto.action, dto.reviewNote, request.user);
  }
}
