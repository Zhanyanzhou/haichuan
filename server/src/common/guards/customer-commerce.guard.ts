import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isCustomerCommerceEnabled } from '../release/release-profile';

/**
 * 客户线上交易总开关。
 * 仅当发布档位为 commerce 且显式设置 CUSTOMER_COMMERCE_ENABLED=true 时开放；
 * 缺失、写错或 lead-generation 档位都按关闭处理。
 */
@Injectable()
export class CustomerCommerceGuard implements CanActivate {
  canActivate(): boolean {
    const enabled = isCustomerCommerceEnabled();

    if (!enabled) {
      throw new ServiceUnavailableException(
        '线上购物与支付暂未开放，请通过咨询或预约联系珠宝顾问',
      );
    }

    return true;
  }
}
