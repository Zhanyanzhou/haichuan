import { Transform } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';

export enum CouponTypeInput {
  FIXED = 'fixed',
  PERCENT = 'percent',
}

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const preserveBooleanInput = ({
  obj,
  key,
  value,
}: {
  obj: Record<string, unknown>;
  key: string;
  value: unknown;
}) => (Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : value);

@ValidatorConstraint({ name: 'couponValue', async: false })
class CouponValueConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return false;
    }
    const type = (args.object as { type?: CouponTypeInput }).type;
    if (type === CouponTypeInput.PERCENT) {
      return Number.isInteger(value) && value >= 1 && value <= 99;
    }
    return Math.round(value * 100) === value * 100;
  }

  defaultMessage(args: ValidationArguments) {
    const type = (args.object as { type?: CouponTypeInput }).type;
    return type === CouponTypeInput.PERCENT
      ? '立减比例必须是 1-99 的整数'
      : '固定减免金额必须是最多两位小数的正数';
  }
}

@ValidatorConstraint({ name: 'couponEndAfterStart', async: false })
class CouponEndAfterStartConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    const startTime = (args.object as { startTime?: unknown }).startTime;
    if (typeof startTime !== 'string' || typeof value !== 'string') return true;
    return new Date(value).getTime() > new Date(startTime).getTime();
  }

  defaultMessage() {
    return '优惠券结束时间必须晚于开始时间';
  }
}

export class CreateCouponDto {
  @Transform(trimString)
  @IsString({ message: '优惠券名称必须是字符串' })
  @IsNotEmpty({ message: '优惠券名称不能为空' })
  @MaxLength(200, { message: '优惠券名称不能超过 200 个字符' })
  name!: string;

  @IsEnum(CouponTypeInput, { message: '优惠券类型只允许 fixed 或 percent' })
  type!: CouponTypeInput;

  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 },
    { message: '优惠券面值必须是最多两位小数的数字' },
  )
  @Validate(CouponValueConstraint)
  value!: number;

  @IsOptional()
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 },
    { message: '最低消费金额必须是最多两位小数的数字' },
  )
  @Min(0, { message: '最低消费金额不能小于 0' })
  minAmount?: number;

  @IsOptional()
  @IsInt({ message: '发行量必须是正整数' })
  @Min(1, { message: '发行量必须是正整数' })
  totalCount?: number;

  @IsDateString({}, { message: '优惠券开始时间必须是 ISO 8601 时间' })
  startTime!: string;

  @IsDateString({}, { message: '优惠券结束时间必须是 ISO 8601 时间' })
  @Validate(CouponEndAfterStartConstraint)
  endTime!: string;

  @IsOptional()
  @Transform(preserveBooleanInput)
  @IsBoolean({ message: '优惠券启用状态必须是布尔值' })
  isActive?: boolean;
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}
