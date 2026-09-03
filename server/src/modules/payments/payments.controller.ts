import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { UploadService } from '../upload/upload.service';
import type { OnlinePayProvider } from '../../common/payment-gateway/payment-gateway.service';
import { CreateChannelPaymentDto, CreateManualReceiptDto, PaymentQueryDto, ReviewPaymentDto } from './dto/payment.dto';
import type { RawBodyRequest, StaffPrincipal } from '../../common/security/authenticated-principal';

function normalizedRequestHeaders(
  headers: Request['headers'],
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) => {
      if (value === undefined) return [];
      return [[name, Array.isArray(value) ? value.join(',') : String(value)]];
    }),
  );
}

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
  findAll(@Query() query: PaymentQueryDto) {
    return this.paymentsService.findAll(query);
  }

  // ===== 在线支付（交易解冻筹备：具体字面量路由须置于 @Get(':id') 之前）=====

  /** 可用在线通道查询（后台收款按钮渲染依据；未配置的通道不显示） */
  @Get('channels')
  channels() {
    return this.paymentsService.availableChannels();
  }

  /**
   * 网关异步回调（公网开放+验签保护）。
   * 应答格式：支付宝纯文本 success/fail；微信 JSON {code}（成功 200 / 失败 500 触发网关重试）。
   * 限流放宽到 120/min：网关对未确认通知会高频重试，过紧会拖慢订单推进。
   */
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @HttpCode(200)
  @Post('notify/:provider')
  async notify(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest,
    @Res() response: Response,
  ) {
    if (provider !== 'alipay' && provider !== 'wechat') {
      response.status(404).send('unknown provider');
      return;
    }
    // 微信 APIv3 验签必须用原始报文（main.ts 已启用 rawBody）
    let rawBody: string;
    if (Buffer.isBuffer(request.rawBody)) {
      rawBody = request.rawBody.toString('utf8');
    } else if (typeof request.body === 'string') {
      rawBody = request.body;
    } else {
      rawBody = JSON.stringify(request.body ?? {});
    }
    const result = await this.paymentsService.settleFromGateway(
      provider as OnlinePayProvider,
      normalizedRequestHeaders(request.headers),
      rawBody,
    );
    if (provider === 'alipay') {
      response.type('text').send(result.ok ? 'success' : 'fail');
    } else {
      response.status(result.ok ? 200 : 500).json(
        result.ok ? { code: 'SUCCESS', message: 'OK' } : { code: 'FAIL', message: '通知未处理完成' },
      );
    }
  }

  /**
   * 后台代客户发起在线收款（顾问转化模式）：生成扫码二维码发送客户。
   */
  @Post(':orderId/channel')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createChannel(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: CreateChannelPaymentDto,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.paymentsService.createChannelPayment(orderId, dto.method, {
      type: 'ADMIN' as const,
      id: user?.id,
      name: user?.realName || user?.username,
    });
  }

  // 客服/管理员的掉单与对账工具：主动查渠道状态并按回调同源管线核销。
  @Post(':id/query-channel')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
  queryChannel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.paymentsService.queryChannelPayment(id, {
      type: 'ADMIN' as const,
      id: user?.id,
      name: user?.realName || user?.username,
    });
  }

  @Get(':id/proof')
  async getProof(@Param('id', ParseIntPipe) id: number, @Res() response: Response) {
    const proof = await this.uploadService.getPaymentProofForStaff(id);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.type(proof.mimeType).send(proof.buffer);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.findById(id);
  }

  @Put(':id/approve')
  @Roles('SUPER_ADMIN', 'ADMIN')
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewPaymentDto, @CurrentUser() user: StaffPrincipal) {
    return this.paymentsService.approve(id, user.id, dto.reviewNote, {
      type: 'ADMIN' as const,
      id: user?.id,
      name: user?.realName || user?.username,
    });
  }

  @Put(':id/reject')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewPaymentDto, @CurrentUser() user: StaffPrincipal) {
    return this.paymentsService.reject(id, user.id, dto.reviewNote, {
      type: 'ADMIN' as const,
      id: user?.id,
      name: user?.realName || user?.username,
    });
  }

  // 异常线下实收登记；不得用此入口伪造微信/支付宝网关到账。
  @Post('receipt')
  @Roles('SUPER_ADMIN', 'ADMIN', 'FINANCE')
  createReceipt(@Body() body: CreateManualReceiptDto, @CurrentUser() user: StaffPrincipal) {
    return this.paymentsService.createReceipt(body, {
      type: 'ADMIN' as const,
      id: user?.id,
      name: user?.realName || user?.username,
    });
  }
}
