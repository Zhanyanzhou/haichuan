import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { SalesMode } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, Max, Min, ValidateIf } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

/**
 * 更新商品 DTO
 * 所有字段可选，不允许修改系统字段（code 不可改；publishedAt 由 /status 端点发布时内部注入，不对前端开放，P1-24）
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
}
