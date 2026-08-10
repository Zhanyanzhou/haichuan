import { PartialType, OmitType } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

/**
 * 更新商品 DTO
 * 所有字段可选，不允许修改系统字段
 */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['code'] as const),
) {
  /** 发布时间：由 /status 端点发布时注入，允许显式写入或清空 */
  @IsOptional()
  publishedAt?: Date | string | null;
}
