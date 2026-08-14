import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * 客户线上交易总开关。
 * 仅当部署环境显式设置 CUSTOMER_COMMERCE_ENABLED=true 时开放；缺失或写错都按关闭处理。
 */
@Injectable()
export class CustomerCommerceGuard implements CanActivate {
  canActivate(): boolean {
    const enabled =
      process.env.CUSTOMER_COMMERCE_ENABLED?.trim().toLowerCase() === 'true';

    if (!enabled) {
      throw new ServiceUnavailableException(
        '线上购物与支付暂未开放，请通过咨询或预约联系珠宝顾问',
      );
    }

    return true;
  }
}
