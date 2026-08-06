import {
  IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsNumber,
  Min, MaxLength, IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MaterialType, ProductStatus, SalesMode } from '@prisma/client';

/**
 * 创建商品 DTO
 * 字段映射 Prisma Product 模型的标量字段
 */
export class CreateProductDto {
  @IsString({ message: '商品名称必须是字符串' })
  @IsNotEmpty({ message: '请填写商品名称' })
  @MaxLength(200, { message: '商品名称不能超过200个字符' })
  name!: string;

  @IsString({ message: '货号必须是字符串' })
  @IsNotEmpty({ message: '请填写商品货号' })
  @MaxLength(50, { message: '货号不能超过50个字符' })
  code!: string;

  @IsOptional()
  @IsString({ message: '简介必须是字符串' })
  @MaxLength(500, { message: '简介不能超过500个字符' })
  shortDescription?: string;

  @IsOptional()
  @IsString({ message: '描述必须是字符串' })
  description?: string;

  @Type(() => Number)
  @IsInt({ message: '请选择商品分类' })
  categoryId!: number;

  @IsOptional()
  @IsEnum(MaterialType, { message: '材质类型不正确' })
  materialType?: MaterialType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '金重必须是数字' })
  @Min(0, { message: '金重不能为负数' })
  goldWeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '工费必须是数字' })
  @Min(0, { message: '工费不能为负数' })
  craftFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '价格必须是数字' })
  @Min(0, { message: '价格不能为负数' })
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '最低价必须是数字' })
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '最高价必须是数字' })
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '重量必须是数字' })
  @Min(0, { message: '重量不能为负数' })
  weight?: number;

  @IsOptional()
  @IsString({ message: '尺寸必须是字符串' })
  @MaxLength(100)
  size?: string;

  @IsOptional()
  gemInfo?: any;

  @IsOptional()
  craftTechnique?: any;

  @IsOptional()
  @IsEnum(ProductStatus, { message: '商品状态不正确，请重新选择' })
  status?: ProductStatus;

  @IsOptional()
  @IsEnum(SalesMode, { message: '销售模式不正确，请重新选择' })
  salesMode?: SalesMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '排序必须是整数' })
  sortOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: '热卖标记必须是布尔值' })
  isHot?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: '新品标记必须是布尔值' })
  isNew?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: '推荐标记必须是布尔值' })
  isRecommended?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: '限量标记必须是布尔值' })
  isLimited?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: '定制标记必须是布尔值' })
  isCustom?: boolean;
}
