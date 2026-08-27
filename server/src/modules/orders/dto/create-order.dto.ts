import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, Validate, ValidateNested, ArrayMinSize, ArrayMaxSize, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import { CustomStage, OrderStatus } from '@prisma/client';

/** 单品数量上限，与 OrdersService.normalizeItems 保持一致 */
const MAX_ITEM_QUANTITY = 99;
/** 单订单商品行上限，与 OrdersService.normalizeItems 保持一致 */
const MAX_ITEMS = 20;

/** 校验中国大陆手机号格式（登录客户结算链路与后台人工建单共用） */
@ValidatorConstraint({ name: 'isChinaMobile', async: false })
class IsChinaMobile implements ValidatorConstraintInterface {
  validate(value: string, _args: ValidationArguments): boolean {
    return typeof value === 'string' && /^1\d{10}$/.test(value);
  }
  defaultMessage(): string {
    return '请提供有效的手机号码';
  }
}

/** 订单商品行（后台人工建单使用；客户结算链路复用同结构） */
export class OrderItemInputDto {
  @IsInt()
  @Min(1)
  skuId!: number;

  @IsInt()
  @Min(1)
  quantity!: number;
}

/**
 * 后台人工建单 DTO。
 *
 * 职责说明（P0 修复，DECISIONS D.7）：
 * - 客户下单必须走 POST /customers/checkout（登录客户结算链路）；
 * - POST /orders 仅为后台员工人工建单入口，需 admin 角色与审计。
 */
export class CreateOrderDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  /** 关联已有客户记录（可选；不传则按下面的散客信息建单） */
  customerId?: number;

  @IsString()
  @MaxLength(50)
  customerName!: string;

  @Validate(IsChinaMobile)
  customerPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerEmail?: string;

  @IsString()
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  /** 付款方式，线下转账场景固定 bank_transfer；不传默认 bank_transfer */
  paymentMethod?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  /** 优惠券（可选，营销生效：服务端校验门槛/有效期并试算折扣，原子核销） */
  couponId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];
}

/** 发货登记 DTO */
export class ShipOrderDto {
  @IsString()
  @MaxLength(50)
  logisticsCompany!: string;

  @IsString()
  @MaxLength(100)
  logisticsNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNote?: string;
}

/** 订单状态变更 DTO（仅允许 COMPLETED / CANCELLED 等非交易关键转换；
 *  PENDING_SHIP 由付款审核进入，SHIPPED 由专用发货接口进入） */
export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNote?: string;
}

/** 修改订单金额 DTO（优惠/调整/应收/定金/尾款，至少传一个；记录 before/after 审计） */
export class UpdateOrderAmountDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  discountAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-99_999_999.99)
  @Max(99_999_999.99)
  adjustmentAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999.99)
  finalAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  depositAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  balanceAmount?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/** 修改收货地址 DTO（已发货/已完成订单不可改） */
export class UpdateOrderAddressDto {
  @IsString()
  @MaxLength(500)
  address!: string;
}

/** 修改内部备注 DTO（后台备注，不展示给客户） */
export class UpdateOrderNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNote?: string;
}

/** 修改销售顾问 DTO（salesConsultantId 传 null 表示取消顾问） */
export class UpdateOrderConsultantDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  salesConsultantId?: number | null;
}

/** 推进定制订单阶段 DTO（仅 orderType=CUSTOM 可用） */
export class AdvanceCustomStageDto {
  @IsEnum(CustomStage)
  stage!: CustomStage;
}
