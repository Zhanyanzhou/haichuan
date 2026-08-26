import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';

export enum PromotionTypeInput {
  FULL_REDUCTION = 'FULL_REDUCTION',
  DISCOUNT = 'DISCOUNT',
  GIFT = 'GIFT',
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

export class CreatePromotionDto {
  @Transform(trimString)
  @IsString({ message: '活动名称必须是字符串' })
  @IsNotEmpty({ message: '活动名称不能为空' })
  @MaxLength(200, { message: '活动名称不能超过 200 个字符' })
  name!: string;

  @IsEnum(PromotionTypeInput, { message: '活动类型不合法' })
  type!: PromotionTypeInput;

  @IsObject({ message: '活动规则必须是 JSON 对象' })
  rule!: Record<string, unknown>;

  @IsDateString({}, { message: '活动开始时间必须是 ISO 8601 时间' })
  startTime!: string;

  @IsDateString({}, { message: '活动结束时间必须是 ISO 8601 时间' })
  endTime!: string;

  @IsOptional()
  @IsString({ message: '活动描述必须是字符串' })
  description?: string;

  @IsOptional()
  @Transform(preserveBooleanInput)
  @IsBoolean({ message: '活动启用状态必须是布尔值' })
  isActive?: boolean;
}

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {}
