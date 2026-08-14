import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto, UpdateQuotationDto, ConvertQuotationDto } from './dto/quotation.dto';

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
  findAll(@Query() query: any) {
    return this.quotationsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '报价单详情' })
  findById(@Param('id') id: string) {
    return this.quotationsService.findById(+id);
  }

  @Post()
  @ApiOperation({ summary: '创建报价单（草稿）' })
  create(@Body() dto: CreateQuotationDto) {
    return this.quotationsService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '编辑报价单（仅草稿可改）' })
  update(@Param('id') id: string, @Body() dto: UpdateQuotationDto) {
    return this.quotationsService.update(+id, dto);
  }

  @Put(':id/submit')
  @ApiOperation({ summary: '提交报价（草稿→待客户确认）' })
  submit(@Param('id') id: string) {
    return this.quotationsService.changeStatus(+id, 'PENDING_CONFIRM');
  }

  @Put(':id/confirm')
  @ApiOperation({ summary: '确认报价（待客户确认→已确认）' })
  confirm(@Param('id') id: string) {
    return this.quotationsService.changeStatus(+id, 'CONFIRMED');
  }

  @Put(':id/cancel')
  @ApiOperation({ summary: '取消报价' })
  cancel(@Param('id') id: string) {
    return this.quotationsService.changeStatus(+id, 'CANCELLED');
  }

  @Post(':id/convert')
  @ApiOperation({ summary: '一键转订单（已确认→生成订单，保留关联）' })
  convertToOrder(@Param('id') id: string, @Body() dto: ConvertQuotationDto) {
    return this.quotationsService.convertToOrder(+id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除报价单（仅草稿/已取消）' })
  remove(@Param('id') id: string) {
    return this.quotationsService.remove(+id);
  }
}
