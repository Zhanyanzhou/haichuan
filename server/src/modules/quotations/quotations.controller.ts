import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { QuotationsService, type QuotationActor } from './quotations.service';
import { CreateQuotationDto, UpdateQuotationDto, ConvertQuotationDto, QuotationListQueryDto } from './dto/quotation.dto';

// 报价管理角色边界：
// - 查看/创建/编辑/转单/取消/删除：SUPER_ADMIN、ADMIN、SALES_CONSULTANT（销售顾问管理自己报价）
// - FINANCE/CUSTOMER_SERVICE/WAREHOUSE/EDITOR 暂无报价权限（非其职责）
@ApiTags('报价管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'SALES_CONSULTANT')
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Get()
  @ApiOperation({ summary: '报价单列表（服务端分页与筛选）' })
  findAll(@Query() query: QuotationListQueryDto, @CurrentUser() user: QuotationActor) {
    return this.quotationsService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: '报价单详情' })
  findById(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: QuotationActor) {
    return this.quotationsService.findById(id, user);
  }

  @Post()
  @ApiOperation({ summary: '创建报价单（草稿）' })
  create(@Body() dto: CreateQuotationDto, @CurrentUser() user: QuotationActor) {
    return this.quotationsService.create(dto, user);
  }

  @Put(':id')
  @ApiOperation({ summary: '编辑报价单（仅草稿可改）' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuotationDto, @CurrentUser() user: QuotationActor) {
    return this.quotationsService.update(id, dto, user);
  }

  @Put(':id/submit')
  @ApiOperation({ summary: '提交报价（草稿→待客户确认）' })
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: QuotationActor) {
    return this.quotationsService.changeStatus(id, 'PENDING_CONFIRM', user);
  }

  @Put(':id/confirm')
  @ApiOperation({ summary: '员工确认报价（安全暂停：员工不得代客户确认）' })
  confirm(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: QuotationActor) {
    return this.quotationsService.changeStatus(id, 'CONFIRMED', user);
  }

  @Put(':id/cancel')
  @ApiOperation({ summary: '取消报价' })
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: QuotationActor) {
    return this.quotationsService.changeStatus(id, 'CANCELLED', user);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: '报价转订单（安全暂停：等待客户确认状态机）' })
  convertToOrder(@Param('id', ParseIntPipe) id: number, @Body() dto: ConvertQuotationDto) {
    return this.quotationsService.convertToOrder(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除报价单（仅从未提交的草稿）' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: QuotationActor) {
    return this.quotationsService.remove(id, user);
  }
}
