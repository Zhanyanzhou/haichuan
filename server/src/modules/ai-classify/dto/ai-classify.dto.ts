import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BoundedListQueryDto } from '../../../common/dto/bounded-list-query.dto';

export class AiClassifyListQueryDto extends BoundedListQueryDto {
  @IsOptional()
  @IsIn([
    'all',
    'auto_confirmed',
    'pending_confirm',
    'pending_review',
    'confirmed',
    'rejected',
  ])
  declare status?:
    | 'all'
    | 'auto_confirmed'
    | 'pending_confirm'
    | 'pending_review'
    | 'confirmed'
    | 'rejected';
}

export class ClassifyImageDto {
  @ApiProperty({ description: '待分类图片 URL' })
  @IsString()
  @IsNotEmpty({ message: 'imageUrl 不能为空' })
  @MaxLength(500)
  imageUrl!: string;
}

export class ClassifyBatchDto {
  @ApiProperty({ description: '图片 URL 列表(最多 10 条)', type: [String] })
  @IsArray({ message: 'imageUrls 必须是数组' })
  @ArrayMaxSize(10, { message: '批量分类最多 10 张图片' })
  @IsString({ each: true, message: 'imageUrls 元素必须为字符串' })
  imageUrls!: string[];
}

export class ChatDto {
  @ApiProperty({ description: '用户消息' })
  @IsString()
  @IsNotEmpty({ message: '消息不能为空' })
  @MaxLength(2000, { message: '消息不能超过 2000 字' })
  message!: string;

  @ApiPropertyOptional({ description: '系统提示词' })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: '系统提示词不能超过 1000 字' })
  systemPrompt?: string;
}

export class GenerateDescriptionDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) productName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(50) category!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(50) material!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) style?: string;
}

export class ConfirmClassifyDto {
  @ApiProperty({
    description: '处理结果：确认或驳回',
    enum: ['confirmed', 'rejected'],
  })
  @IsIn(['confirmed', 'rejected'], {
    message: 'status 必须是 confirmed 或 rejected',
  })
  status!: 'confirmed' | 'rejected';

  @ApiPropertyOptional({
    description: '人工确认的分类 ID（确认时可省略，缺省沿用预测分类）',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  confirmedCategoryId?: number;
}
