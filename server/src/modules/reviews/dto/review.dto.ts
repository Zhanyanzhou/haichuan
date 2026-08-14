import { IsInt, IsString, Max, Min, MinLength, MaxLength, IsOptional, IsIn, IsArray, ArrayMaxSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ description: '来源订单 ID（必须为当前客户已完成的订单且包含该商品）' })
  @IsInt()
  orderId!: number;

  @ApiProperty({ description: '商品 ID' })
  @IsInt()
  productId!: number;

  @ApiProperty({ description: '星级 1-5', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({ description: '评价内容（5-500 字）' })
  @IsString()
  @MinLength(5, { message: '评价内容至少 5 个字' })
  @MaxLength(500, { message: '评价内容不能超过 500 字' })
  content!: string;

  @ApiPropertyOptional({ description: '晒单图 URL 列表（最多 6 张，走公开上传管线）', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6, { message: '晒单图最多 6 张' })
  @IsString({ each: true })
  @MaxLength(500, { each: true, message: '图片 URL 过长' })
  imageUrls?: string[];
}

export class ModerateReviewDto {
  @ApiProperty({ description: '审核结果', enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ description: '商家回复（随评价一并展示，可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '回复不能超过 500 字' })
  reply?: string;
}
