import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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

class TagWritableFieldsDto {
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: '标签分组必须是字符串' })
  @MaxLength(50, { message: '标签分组不能超过 50 个字符' })
  group?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '排序必须是整数' })
  @Min(0, { message: '排序不能为负数' })
  sortOrder?: number;
}

export class CreateTagDto extends TagWritableFieldsDto {
  @Transform(trimString)
  @IsString({ message: '标签名称必须是字符串' })
  @IsNotEmpty({ message: '标签名称不能为空' })
  @MaxLength(50, { message: '标签名称不能超过 50 个字符' })
  name!: string;
}

export class UpdateTagDto extends TagWritableFieldsDto {
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: '标签名称必须是字符串' })
  @IsNotEmpty({ message: '标签名称不能为空' })
  @MaxLength(50, { message: '标签名称不能超过 50 个字符' })
  name?: string;

  @IsOptional()
  @Transform(preserveBooleanInput)
  @IsBoolean({ message: '启用状态必须是布尔值' })
  isActive?: boolean;
}
