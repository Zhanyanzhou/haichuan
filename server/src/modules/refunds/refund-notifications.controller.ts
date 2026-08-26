import { Controller, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import type { OnlinePayProvider } from '../../common/payment-gateway/payment-gateway.service';
import { RefundsService } from './refunds.service';

/** 独立公网退款通知入口；不继承后台员工 JWT 守卫，安全边界是渠道验签。 */
@Public()
@Controller('refunds/notify')
export class RefundNotificationsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @HttpCode(200)
  @Post(':provider')
  async notify(
    @Param('provider') provider: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (provider !== 'wechat') {
      response.status(404).json({ code: 'FAIL', message: '未知退款渠道' });
      return;
    }
    let rawBody: string;
    if (Buffer.isBuffer((request as Request & { rawBody?: Buffer }).rawBody)) {
      rawBody = (request as Request & { rawBody: Buffer }).rawBody.toString('utf8');
    } else if (typeof request.body === 'string') {
      rawBody = request.body;
    } else {
      rawBody = JSON.stringify(request.body ?? {});
    }
    const result = await this.refundsService.settleOnlineRefundNotification(
      provider as OnlinePayProvider,
      request.headers as Record<string, string>,
      rawBody,
    );
    response.status(result.ok ? 200 : 500).json(
      result.ok
        ? { code: 'SUCCESS', message: 'OK' }
        : { code: 'FAIL', message: '退款通知未处理完成' },
    );
  }
}
