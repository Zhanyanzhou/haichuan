import { Body, Controller, Get, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { UploadService } from '../upload/upload.service';

// 付款审核角色边界（P0 修复，对应任务优先问题 #5）：
// - 查看（列表/详情）：SUPER_ADMIN、ADMIN、CUSTOMER_SERVICE（客服需跟进客户付款状态）；
// - 审核通过/驳回：仅 SUPER_ADMIN、ADMIN；
// - EDITOR、WAREHOUSE 无付款审核权限。
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly uploadService: UploadService,
  ) {}

  @Get()
  findAll(@Query() query: any) {
    return this.paymentsService.findAll(query);
  }

  @Get(':id/proof')
  async getProof(@Param('id') id: string, @Res() response: Response) {
    const proof = await this.uploadService.getPaymentProofForStaff(+id);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.type(proof.mimeType).send(proof.buffer);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.paymentsService.findById(+id);
  }

  @Put(':id/approve')
  @Roles('SUPER_ADMIN', 'ADMIN')
  approve(@Param('id') id: string, @Body('reviewNote') reviewNote: string, @CurrentUser() user: any) {
    return this.paymentsService.approve(+id, user.id, reviewNote, {
      type: 'ADMIN' as const,
      id: user?.id,
      name: user?.realName || user?.username,
    });
  }

  @Put(':id/reject')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reject(@Param('id') id: string, @Body('reviewNote') reviewNote: string, @CurrentUser() user: any) {
    return this.paymentsService.reject(+id, user.id, reviewNote, {
      type: 'ADMIN' as const,
      id: user?.id,
      name: user?.realName || user?.username,
    });
  }

  // 后台手动登记收款（财务/管理员直接录入已到账收款：定金/尾款/全款/补款）
  @Post('receipt')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  createReceipt(@Body() body: {
    orderId: number;
    amount: number;
    method: string;
    type: 'DEPOSIT' | 'BALANCE' | 'FULL' | 'SUPPLEMENT';
    paidAt?: string;
    gatewayTradeNo?: string;
    reviewNote?: string;
  }, @CurrentUser() user: any) {
    return this.paymentsService.createReceipt(body, {
      type: 'ADMIN' as const,
      id: user?.id,
      name: user?.realName || user?.username,
    });
  }
}
