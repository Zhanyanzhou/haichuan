import { CanActivate, HttpStatus, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error';
import { isCustomerQuotationOrderingEnabled } from '../../common/release/release-profile';

/**
 * 报价确认转单与零售结算、外部支付分别启停。默认关闭，避免尚未完成真实数据库
 * 验收时仅因页面接线就形成交易事实。
 */
@Injectable()
export class QuotationOrderingGuard implements CanActivate {
  canActivate(): boolean {
    if (!isCustomerQuotationOrderingEnabled()) {
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'CUSTOMER_QUOTATION_ORDERING_DISABLED',
        '报价确认转单暂未开放',
      );
    }
    return true;
  }
}
