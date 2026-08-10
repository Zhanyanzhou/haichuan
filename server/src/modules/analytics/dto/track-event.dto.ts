import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsObject,
  MaxLength,
} from 'class-validator';

/** 公开埋点上报：限制字段长度，防止超长字符串撑爆 DB 列或 metadata */
export class TrackEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  eventName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  pagePath?: string;

  @IsOptional()
  @IsInt()
  productId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  searchTerm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  deviceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sessionId?: string;

  @IsOptional()
  @IsInt()
  customerId?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
