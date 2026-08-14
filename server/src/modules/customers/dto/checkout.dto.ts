import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

/** 客户结算商品行 */
export class CheckoutItemDto {
  @IsInt()
  @Min(1)
  skuId!: number;

  @IsInt()
  @Min(1)
  quantity!: number;
}

/**
 * 客户结算 DTO（POST /customers/checkout）。
 *
 * 契约对齐（P0 修复）：
 * - 客户身份（姓名/手机号）由后端从登录态 Customer 记录取，不由前端传入；
 * - 支付方式当前固定线下转账（bank_transfer），不由前端选择；
 * - 前端仅提交收货地址、商品行与可选邮箱。
 */
export class CheckoutDto {
  @IsString()
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerEmail?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];
}
