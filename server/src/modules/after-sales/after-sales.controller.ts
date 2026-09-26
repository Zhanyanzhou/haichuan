import { Body, Controller, Get, Header, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../../common/idempotency/idempotency-key';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import { AfterSalesService } from './after-sales.service';
import { AfterSalesQueryDto, CreateAfterSalesDto, ReviewAfterSalesDto, UpdateAfterSalesStatusDto } from './dto/after-sales.dto';

// 售后角色边界（任务优先问题 #5）：
// - 查看/审核/处理：SUPER_ADMIN、ADMIN、CUSTOMER_SERVICE（售后是客服核心职责）；
// - EDITOR、WAREHOUSE 无售后权限。
@ApiTags('售后管理')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
@Controller('after-sales-cases')
export class AfterSalesController {
  constructor(private readonly afterSalesService: AfterSalesService) {}

  @ApiBearerAuth()
  @Get()
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  findAll(
    @Query() query: AfterSalesQueryDto,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.afterSalesService.findAll(query, user);
  }

  @ApiBearerAuth()
  @Get(':id')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.afterSalesService.findById(id, user);
  }

  @ApiBearerAuth()
  @Post()
  create(
    @Body() dto: CreateAfterSalesDto,
    @CurrentUser() user: StaffPrincipal,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.afterSalesService.create({
      ...dto,
      operator: user,
    }, idempotencyKey);
  }

  @ApiBearerAuth()
  @Put(':id/review')
  review(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewAfterSalesDto, @CurrentUser() user: StaffPrincipal) {
    return this.afterSalesService.review(
      id,
      dto.action as 'APPROVED' | 'REJECTED',
      dto.adminNote,
      dto.approvedRefundAmount,
      user,
    );
  }

  @ApiBearerAuth()
  @Put(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAfterSalesStatusDto, @CurrentUser() user: StaffPrincipal) {
    return this.afterSalesService.updateStatus(id, dto.status, dto.adminNote, user);
  }
}
