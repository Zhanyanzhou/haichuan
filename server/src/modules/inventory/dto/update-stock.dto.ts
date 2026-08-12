import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 库存增减类型 */
export type StockMoveType = 'in' | 'out' | 'adjust';

export class UpdateStockDto {
  @ApiProperty({ description: '操作类型:入库 in / 出库 out / 直接调整 adjust', enum: ['in', 'out', 'adjust'] })
  @IsEnum(['in', 'out', 'adjust'], { message: '操作类型必须是 in、out 或 adjust' })
  type!: StockMoveType;

  @ApiProperty({ description: '数量(非负整数)', example: 10 })
  @Type(() => Number)
  @IsInt({ message: '数量必须是整数' })
  @Min(0, { message: '数量必须为非负整数' })
  quantity!: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}
