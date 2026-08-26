import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const AfterSalesTypeValues = ['REFUND', 'EXCHANGE', 'REPAIR'] as const;
export const AfterSalesStatusValues = [
  'REQUESTED', 'APPROVED', 'REJECTED', 'RETURNING', 'QC_PASSED', 'QC_FAILED', 'COMPLETED', 'CANCELLED',
] as const;

/** 后台代客创建售后 DTO；客户入口使用更窄的独立 DTO。 */
export class CreateAfterSalesDto {
  @Type(() => Number) @IsInt() @Min(1)
  orderId!: number;

  @Type(() => Number) @IsInt() @Min(1)
  orderItemId!: number;

  @Type(() => Number) @IsInt() @Min(1)
  customerId!: number;

  @IsEnum(AfterSalesTypeValues)
  type!: string;

  @IsString() @MaxLength(500)
  reason!: string;

  @IsOptional() @IsArray()
  @IsString({ each: true })
  evidenceUrls?: string[];

  @IsOptional() @IsString() @MaxLength(2000)
  customerNote?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99)
  requestedRefundAmount?: number;
}

/** 客户本人售后申请：订单、客户和退款金额均由服务端事实决定。 */
export class CreateCustomerAfterSalesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderItemId!: number;

  @IsEnum(AfterSalesTypeValues)
  type!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

/** 售后审核 DTO */
export class ReviewAfterSalesDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  action!: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99)
  /** 审核通过的退款金额（不超过订单可退额，最终以关联退款单为准） */
  approvedRefundAmount?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  adminNote?: string;
}

/** 售后状态更新 DTO（逆向物流/质检/完成） */
export class UpdateAfterSalesStatusDto {
  @IsEnum(AfterSalesStatusValues)
  status!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  adminNote?: string;
}

/** 售后列表查询 DTO */
export class AfterSalesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  pageSize?: number;

  @IsOptional() @IsEnum(AfterSalesStatusValues)
  status?: string;

  @IsOptional() @IsEnum(AfterSalesTypeValues)
  type?: string;

  @IsOptional() @IsString()
  keyword?: string;
}
