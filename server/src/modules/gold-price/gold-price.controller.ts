import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GoldPriceService } from './gold-price.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('金价管理')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('gold-price')
export class GoldPriceController {
  constructor(private goldPriceService: GoldPriceService) {}

  @Public()
  @Get('latest')
  @ApiOperation({ summary: '获取最新金价' })
  getLatest() {
    return this.goldPriceService.getLatest();
  }

  @Public()
  @Get('history')
  @ApiOperation({ summary: '获取金价历史' })
  getHistory(@Query() query: any) {
    return this.goldPriceService.getHistory(query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('manual')
  @ApiOperation({ summary: '手动录入金价' })
  async updateManually(
    @Body() body: { price: number; remark?: string },
    @CurrentUser() user: any,
  ) {
    return this.goldPriceService.updateManually({
      price: body.price,
      operatorId: user.id,
      remark: body.remark,
    });
  }
}
