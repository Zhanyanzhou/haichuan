import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

/**
 * 更新商品 DTO
 * 所有字段可选，不允许修改系统字段（code 不可改；publishedAt 由 /status 端点发布时内部注入，不对前端开放，P1-24）
 */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['code', 'status'] as const),
) {}
