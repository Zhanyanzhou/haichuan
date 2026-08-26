import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum WarehouseTypeInput {
  SHOWROOM = 'SHOWROOM',
  FACTORY = 'FACTORY',
  STORE = 'STORE',
}

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// 全局 enableImplicitConversion 会把字符串 "false" 转成 true；
// 布尔写入口必须保留原值交给 IsBoolean 严格拒绝。
const preserveBooleanInput = ({
  obj,
  key,
  value,
}: {
  obj: Record<string, unknown>;
  key: string;
  value: unknown;
}) => (Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : value);

class WarehouseWritableFieldsDto {
  @IsOptional()
  @IsEnum(WarehouseTypeInput, { message: '仓库类型不合法' })
  type?: WarehouseTypeInput;

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: '仓库地址必须是字符串' })
  @MaxLength(300, { message: '仓库地址不能超过 300 个字符' })
  address?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: '联系人必须是字符串' })
  @MaxLength(50, { message: '联系人不能超过 50 个字符' })
  contact?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: '联系电话必须是字符串' })
  @MaxLength(20, { message: '联系电话不能超过 20 个字符' })
  phone?: string;
}

export class CreateWarehouseDto extends WarehouseWritableFieldsDto {
  @Transform(trimString)
  @IsString({ message: '仓库名称必须是字符串' })
  @IsNotEmpty({ message: '仓库名称不能为空' })
  @MaxLength(100, { message: '仓库名称不能超过 100 个字符' })
  name!: string;
}

export class UpdateWarehouseDto extends WarehouseWritableFieldsDto {
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: '仓库名称必须是字符串' })
  @IsNotEmpty({ message: '仓库名称不能为空' })
  @MaxLength(100, { message: '仓库名称不能超过 100 个字符' })
  name?: string;

  @IsOptional()
  @Transform(preserveBooleanInput)
  @IsBoolean({ message: '启用状态必须是布尔值' })
  isActive?: boolean;
}
