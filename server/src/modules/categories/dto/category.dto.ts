import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

class CategoryWritableFieldsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '父级分类 ID 必须是整数' })
  @Min(1, { message: '父级分类 ID 必须大于 0' })
  parentId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '排序必须是整数' })
  @Min(0, { message: '排序不能为负数' })
  sortOrder?: number;

  @IsOptional()
  @Transform(preserveBooleanInput)
  @IsBoolean({ message: '启用状态必须是布尔值' })
  isActive?: boolean;

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: '分类图标必须是字符串' })
  @MaxLength(500, { message: '分类图标不能超过 500 个字符' })
  icon?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: '分类图片必须是字符串' })
  @MaxLength(500, { message: '分类图片不能超过 500 个字符' })
  coverImage?: string;
}

export class CreateCategoryDto extends CategoryWritableFieldsDto {
  @Transform(trimString)
  @IsString({ message: '分类名称必须是字符串' })
  @IsNotEmpty({ message: '分类名称不能为空' })
  @MaxLength(100, { message: '分类名称不能超过 100 个字符' })
  name!: string;

  @Transform(trimString)
  @IsString({ message: 'Slug 必须是字符串' })
  @IsNotEmpty({ message: 'Slug 不能为空' })
  @MaxLength(150, { message: 'Slug 不能超过 150 个字符' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug 仅支持小写字母、数字和连字符',
  })
  slug!: string;
}

export class UpdateCategoryDto extends CategoryWritableFieldsDto {
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: '分类名称必须是字符串' })
  @IsNotEmpty({ message: '分类名称不能为空' })
  @MaxLength(100, { message: '分类名称不能超过 100 个字符' })
  name?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'Slug 必须是字符串' })
  @IsNotEmpty({ message: 'Slug 不能为空' })
  @MaxLength(150, { message: 'Slug 不能超过 150 个字符' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug 仅支持小写字母、数字和连字符',
  })
  slug?: string;

  // 保留现有服务层的“不允许调整层级”失败合同，不能由白名单静默剥离。
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '分类层级必须是整数' })
  @Min(1, { message: '分类层级必须大于 0' })
  @Max(3, { message: '分类层级不能超过 3' })
  level?: number;
}
