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
 * - 支付渠道不由结算 DTO 指定；订单创建后由认证客户在独立支付入口发起已开放渠道；
 * - 前端仅提交收货地址、商品行、可选邮箱与可选优惠券 ID；
 * - couponId 只引用现有优惠券，资格、额度与金额仍由订单事务校验。
 */
export class CheckoutDto {
  @IsString()
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerEmail?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  couponId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];
}
