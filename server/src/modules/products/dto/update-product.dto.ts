import { ApiPropertyOptional, PartialType, OmitType, PickType } from '@nestjs/swagger';
import { MaterialType, SalesMode } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsInt, IsObject, IsString,
  Max, MaxLength, Min, ValidateBy, ValidateIf, ValidateNested,
} from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { CreateSkuDto } from './sku.dto';

function IsSkuDecimal(label: string) {
  return ValidateBy({
    name: 'isSkuDecimal',
    validator: {
      validate: (value: unknown) => typeof value === 'number' && Number.isFinite(value) && Number(value.toFixed(2)) === value,
      defaultMessage: () => `${label}须为最多两位小数的数字`,
    },
  });
}

class EditorSkuUpdateDto {
  @Transform(({ obj }) => obj.id)
  @IsInt({ message: 'SKU 标识必须是整数' })
  @Min(1)
  @Max(2147483647)
  id!: number;

  @Transform(({ obj }) => obj.expectedPrice)
  @ValidateIf((_dto, value) => value !== undefined)
  @IsSkuDecimal('原 SKU 价格')
  @Min(0)
  @Max(99999999.99)
  expectedPrice?: number;

  @Transform(({ obj }) => obj.price)
  @ValidateIf((_dto, value) => value !== undefined)
  @IsSkuDecimal('SKU 价格')
  @Min(0)
  @Max(99999999.99)
  price?: number;

  @ValidateIf((_dto, value) => value !== undefined)
  @IsEnum(MaterialType)
  material?: MaterialType;

  @Transform(({ obj }) => obj.size)
  @ValidateIf((_dto, value) => value !== undefined)
  @IsString()
  @MaxLength(50)
  size?: string;

  @Transform(({ obj }) => obj.goldWeight)
  @ValidateIf((_dto, value) => value !== undefined)
  @IsSkuDecimal('SKU 金重')
  @Min(0)
  @Max(999999.99)
  goldWeight?: number;
}

class EditorDefaultSkuDto extends PickType(CreateSkuDto, ['skuCode', 'price', 'material', 'size', 'goldWeight'] as const) {
  @Transform(({ obj }) => typeof obj.skuCode === 'string' ? obj.skuCode.trim() : obj.skuCode)
  skuCode!: string;

  @Transform(({ obj }) => obj.price)
  @IsSkuDecimal('默认 SKU 价格')
  @Min(0.01)
  @Max(99999999.99)
  price!: number;

  @Transform(({ obj }) => obj.goldWeight)
  @IsSkuDecimal('默认 SKU 金重')
  @Max(999999.99)
  goldWeight?: number;
}

/**
 * 更新商品 DTO
 * 所有字段可选，不允许修改系统字段（code 不可改，写错的款号走 POST :id/correct-code；publishedAt 由 /status 端点发布时内部注入，不对前端开放，P1-24）
 */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['code', 'status', 'requireNewCode'] as const),
) {
  @ApiPropertyOptional({ description: '改分类时客户端已确认的原分类 ID', minimum: 1 })
  @Transform(({ obj }) => obj.expectedCategoryId)
  @ValidateIf((_dto, value) => value !== undefined)
  @IsInt({ message: '原商品分类 ID 必须是整数' })
  @Min(1, { message: '原商品分类 ID 必须为正整数' })
  @Max(2147483647, { message: '原商品分类 ID 超出有效范围' })
  expectedCategoryId?: number;

  @ApiPropertyOptional({ description: '批量修改时已确认的原销售方式', enum: SalesMode })
  @Transform(({ obj }) => obj.expectedSalesMode)
  @ValidateIf((_dto, value) => value !== undefined)
  @IsEnum(SalesMode, { message: '原销售方式不正确，请刷新商品列表' })
  expectedSalesMode?: SalesMode;

  @ValidateIf((_dto, value) => value !== undefined)
  @IsArray({ message: 'SKU 修改必须是列表' })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((sku?: EditorSkuUpdateDto) => sku?.id, { message: '同一个 SKU 只能修改一次' })
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => EditorSkuUpdateDto)
  editorSkuUpdates?: EditorSkuUpdateDto[];

  @ValidateIf((_dto, value) => value !== undefined)
  @IsObject({ message: '请提供有效的默认 SKU' })
  @ValidateNested()
  @Type(() => EditorDefaultSkuDto)
  editorDefaultSku?: EditorDefaultSkuDto;
}
