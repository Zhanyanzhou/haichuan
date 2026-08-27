import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GoldPriceService } from './gold-price.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ManualGoldPriceDto } from './dto/manual-gold-price.dto';
import { GoldPriceHistoryQueryDto } from './dto/gold-price-history-query.dto';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';

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
  getHistory(@Query() query: GoldPriceHistoryQueryDto) {
    return this.goldPriceService.getHistory(query);
  }

  @Get('automation-status')
  @ApiOperation({ summary: '获取自动金价采集配置状态' })
  getAutomationStatus() {
    return this.goldPriceService.getAutomationStatus();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('manual')
  @ApiOperation({ summary: '手动录入金价' })
  async updateManually(
    @Body() dto: ManualGoldPriceDto,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.goldPriceService.updateManually({
      price: dto.price,
      operatorId: user.id,
      remark: dto.remark,
    });
  }
}
