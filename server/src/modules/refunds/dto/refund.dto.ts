import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, Matches, ValidateIf } from 'class-validator';

export const RefundStatusValues = ['PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED'] as const;

/** 创建退款申请 DTO */
export class CreateRefundDto {
  @IsInt() @Min(1)
  orderId!: number;

  @IsOptional() @IsInt() @Min(1)
  /** 关联的付款记录（PAID 状态）；不传则自动取订单最近一笔 PAID 付款 */
  paymentId?: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(9999999999.99)
  amount!: number;

  @IsString() @MaxLength(500)
  reason!: string;

  @IsString() @MaxLength(64) @Matches(/^[A-Za-z0-9_\-:]{1,64}$/, { message: '幂等键格式不合法' })
  /** 幂等键：同键重复提交只会创建一次，防重复退款 */
  idempotencyKey!: string;

  @IsOptional() @IsInt()
  afterSalesCaseId?: number;
}

/** 退款审核 DTO */
export class ReviewRefundDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  action!: string;

  @IsOptional() @IsString() @MaxLength(500)
  reviewNote?: string;
}

/** 线下退款执行 DTO；在线退款不能通过此入口人工标记完成。 */
export class ExecuteRefundDto {
  @IsEnum(['COMPLETED', 'FAILED'])
  action!: string;

  @ValidateIf((dto: ExecuteRefundDto) => dto.action === 'COMPLETED')
  @IsString() @MinLength(1) @MaxLength(100)
  gatewayRefundNo?: string;

  @ValidateIf((dto: ExecuteRefundDto) => dto.action === 'FAILED')
  @IsString() @MinLength(1) @MaxLength(500)
  reviewNote?: string;
}

/** 退款列表查询 DTO */
export class RefundQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize = 20;

  @IsOptional() @IsEnum(RefundStatusValues)
  status?: string;

  @IsOptional() @IsString() @MaxLength(100)
  keyword?: string;
}
