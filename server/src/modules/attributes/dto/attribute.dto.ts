import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const normalizeAttributeKey = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

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

class AttributeOrderDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "排序值必须是整数" })
  @Min(0, { message: "排序值不能为负数" })
  sortOrder?: number;
}

export class CreateAttributeDto extends AttributeOrderDto {
  @Transform(trimString)
  @IsString({ message: "属性名称必须是字符串" })
  @IsNotEmpty({ message: "属性名称不能为空" })
  @MaxLength(50, { message: "属性名称不能超过 50 个字符" })
  name!: string;

  @Transform(normalizeAttributeKey)
  @IsString({ message: "属性键必须是字符串" })
  @IsNotEmpty({ message: "属性键不能为空" })
  @MaxLength(50, { message: "属性键不能超过 50 个字符" })
  @Matches(/^[a-z][a-z0-9_-]*$/, {
    message: "属性键仅支持小写字母、数字、下划线与连字符",
  })
  key!: string;

  @IsOptional()
  @Transform(preserveBooleanInput)
  @IsBoolean({ message: "可筛选状态必须是布尔值" })
  isFilterable?: boolean;
}

export class UpdateAttributeDto extends AttributeOrderDto {
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: "属性名称必须是字符串" })
  @IsNotEmpty({ message: "属性名称不能为空" })
  @MaxLength(50, { message: "属性名称不能超过 50 个字符" })
  name?: string;

  @IsOptional()
  @Transform(preserveBooleanInput)
  @IsBoolean({ message: "可筛选状态必须是布尔值" })
  isFilterable?: boolean;

  @IsOptional()
  @Transform(preserveBooleanInput)
  @IsBoolean({ message: "启用状态必须是布尔值" })
  isActive?: boolean;
}

export class CreateAttributeValueDto extends AttributeOrderDto {
  @Transform(trimString)
  @IsString({ message: "属性值必须是字符串" })
  @IsNotEmpty({ message: "属性值不能为空" })
  @MaxLength(100, { message: "属性值不能超过 100 个字符" })
  value!: string;
}

export class UpdateAttributeValueDto extends AttributeOrderDto {
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: "属性值必须是字符串" })
  @IsNotEmpty({ message: "属性值不能为空" })
  @MaxLength(100, { message: "属性值不能超过 100 个字符" })
  value?: string;

  @IsOptional()
  @Transform(preserveBooleanInput)
  @IsBoolean({ message: "启用状态必须是布尔值" })
  isActive?: boolean;
}
