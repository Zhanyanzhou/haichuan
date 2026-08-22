import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 手动录入金价 DTO
 * 仅记录金价事实，不会改写已发布商品的固定 SKU 售价。
 * 入口仍校验合理范围，避免无效行情污染金价记录。
 */
export class ManualGoldPriceDto {
  @ApiProperty({ description: '金价（元/克）', example: 485.6 })
  @Type(() => Number)
  @IsNumber({}, { message: '金价必须是数字' })
  @Min(1, { message: '金价必须大于 0' })
  @Max(10000, { message: '金价超出合理范围（≤ 10000 元/克）' })
  price!: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '备注不能超过 200 字' })
  remark?: string;
}
