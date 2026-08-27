import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentStatus } from '@prisma/client';

export class PaymentQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize = 20;

  @IsOptional() @IsIn(['all', ...Object.values(PaymentStatus)])
  status?: string;

  @IsOptional() @IsIn(['all', 'DEPOSIT', 'BALANCE', 'FULL', 'SUPPLEMENT'])
  type?: string;

  @IsOptional() @IsIn(['all', 'wechat', 'alipay', 'bank_transfer', 'store'])
  method?: string;

  @IsOptional() @IsString() @MaxLength(100)
  keyword?: string;

  @IsOptional() @IsDateString()
  startDate?: string;

  @IsOptional() @IsDateString()
  endDate?: string;
}

export class ReviewPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

export class CreateChannelPaymentDto {
  @IsIn(['alipay', 'wechat'])
  method!: 'alipay' | 'wechat';
}

/** 异常线下实收登记；在线渠道到账只能由验签回调确认。 */
export class CreateManualReceiptDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  amount!: number;

  @IsIn(['bank_transfer', 'store'])
  method!: 'bank_transfer' | 'store';

  @IsIn(['DEPOSIT', 'BALANCE', 'FULL', 'SUPPLEMENT'])
  type!: 'DEPOSIT' | 'BALANCE' | 'FULL' | 'SUPPLEMENT';

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  /** 银行或门店收款参考号，不代表第三方支付网关交易号。 */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  gatewayTradeNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
