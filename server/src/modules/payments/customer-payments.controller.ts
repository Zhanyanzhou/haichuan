import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { PaymentsService } from './payments.service';

type CustomerRequest = Request & { customer: { id: number } };

function clientIp(request: Request) {
  return request.ip?.replace(/^::ffff:/, '');
}

export function resolveCustomerPaymentContext(
  userAgent: string,
  mobileHint: string | undefined,
  ip: string | undefined,
) {
  if (/MicroMessenger/i.test(userAgent)) {
    throw new ServiceUnavailableException(
      '微信内网页支付尚未开放：需要已认证公众号、商户号绑定及该公众号 AppID 下的 openid。请先在手机系统浏览器中打开本页完成支付。',
    );
  }
  const mobile =
    mobileHint === '?1' ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  if (!mobile) return { scene: 'native' as const };
  return {
    scene: 'h5' as const,
    clientIp: ip,
    h5Type: /Android/i.test(userAgent)
      ? ('Android' as const)
      : /iPhone|iPad|iPod/i.test(userAgent)
        ? ('iOS' as const)
        : ('Wap' as const),
  };
}

/** 客户本人支付入口；与后台付款审核控制器隔离，避免员工 JWT 与客户 JWT 混用。 */
@Public()
@UseGuards(CustomerAuthGuard)
@Controller('customers/me')
export class CustomerPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('payment-channels')
  @UseGuards(CustomerCommerceGuard)
  channels() {
    return this.paymentsService.availableCustomerChannels();
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(CustomerCommerceGuard)
  @Post('orders/:orderId/payment')
  create(@Req() request: CustomerRequest, @Param('orderId') orderId: string) {
    return this.paymentsService.createCustomerPayment(
      request.customer.id,
      +orderId,
      resolveCustomerPaymentContext(
        request.get('user-agent') || '',
        request.get('sec-ch-ua-mobile'),
        clientIp(request),
      ),
    );
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('orders/:orderId/payment')
  query(@Req() request: CustomerRequest, @Param('orderId') orderId: string) {
    return this.paymentsService.queryCustomerPayment(
      request.customer.id,
      +orderId,
    );
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(CustomerCommerceGuard)
  @Post('orders/:orderId/payment/close')
  close(@Req() request: CustomerRequest, @Param('orderId') orderId: string) {
    return this.paymentsService.closeCustomerPayment(
      request.customer.id,
      +orderId,
    );
  }
}
