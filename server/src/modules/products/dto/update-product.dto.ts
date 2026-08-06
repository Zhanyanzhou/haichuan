import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

/**
 * 更新商品 DTO
 * 所有字段可选，不允许修改系统字段
 */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['code'] as const),
) {}
