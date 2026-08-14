import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  MaxLength,
  IsNotEmpty,
} from "class-validator";
import { Type } from "class-transformer";
import { MaterialType } from "@prisma/client";

export class CreateSkuDto {
  @IsString({ message: "SKU编码必须是字符串" })
  @IsNotEmpty({ message: "请输入SKU编码" })
  @MaxLength(100, { message: "SKU编码不能超过100个字符" })
  skuCode!: string;

  @IsOptional()
  @IsEnum(MaterialType, { message: "材质类型不正确" })
  material?: MaterialType;

  @IsOptional()
  @IsString({ message: "规格必须是字符串" })
  @MaxLength(50, { message: "规格不能超过50个字符" })
  size?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "金重必须是数字" })
  @Min(0, { message: "金重不能为负数" })
  goldWeight?: number;

  @Type(() => Number)
  @IsNumber({}, { message: "价格必须是数字" })
  @Min(0, { message: "价格不能为负数" })
  price!: number;

  // 注：库存(stock)与安全库存(safetyStock)已统一到 Inventory 模块管理，
  // SKU 表不再承载库存，DTO 不再接收这两个字段（whitelist 会剥离历史调用方传入的值）。
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: "启用状态必须是布尔值" })
  isActive?: boolean;
}

export class UpdateSkuDto {
  @IsOptional()
  @IsString({ message: "SKU编码必须是字符串" })
  @MaxLength(100)
  skuCode?: string;

  @IsOptional()
  @IsEnum(MaterialType, { message: "材质类型不正确" })
  material?: MaterialType;

  @IsOptional()
  @IsString({ message: "规格必须是字符串" })
  @MaxLength(50)
  size?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "金重必须是数字" })
  @Min(0)
  goldWeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "价格必须是数字" })
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: "启用状态必须是布尔值" })
  isActive?: boolean;
}
