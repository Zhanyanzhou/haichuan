import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** 履约状态（与 Prisma FulfillmentStatus 一致） */
export const FulfillmentStatusValues = [
  'PENDING_PICK', 'PENDING_CHECK', 'PENDING_SHIP', 'SHIPPED', 'DELIVERED', 'ABNORMAL',
] as const;

/** 发货登记 DTO（从履约中心直接发货） */
export class DispatchFulfillmentDto {
  @IsString()
  @MaxLength(50)
  carrier!: string;

  @IsString()
  @MaxLength(100)
  trackingNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNote?: string;
}

/** 更新履约状态 DTO（送达 / 物流异常） */
export class UpdateFulfillmentStatusDto {
  @IsEnum(FulfillmentStatusValues)
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  abnormalReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNote?: string;
}

/** 履约列表查询 DTO */
export class FulfillmentQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize = 20;

  @IsOptional() @IsEnum(FulfillmentStatusValues)
  status?: string;

  @IsOptional() @IsString() @MaxLength(100)
  keyword?: string;
}
