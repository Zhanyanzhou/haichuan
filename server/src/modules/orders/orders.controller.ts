import { Controller, Get, Post, Put, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('订单管理')
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: '获取订单列表' })
  findAll(@Query() query: any) {
    return this.ordersService.findAll(query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('statistics')
  @ApiOperation({ summary: '获取订单统计数据' })
  getStatistics() {
    return this.ordersService.getStatistics();
  }

  @Get(':id')
  @ApiOperation({ summary: '获取订单详情' })
  findById(@Param('id') id: string) {
    return this.ordersService.findById(+id);
  }

  @Public()
  @Post()
  @ApiOperation({ summary: '创建订单（公开接口）' })
  create(@Body() body: any) {
    return this.ordersService.create(body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id/status')
  @ApiOperation({ summary: '更新订单状态（含状态机校验）' })
  updateStatus(@Param('id') id: string, @Body() body: any) {
    return this.ordersService.updateStatus(+id, body);
  }
}
