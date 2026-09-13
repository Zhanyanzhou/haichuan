import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PageMediaQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;

  @IsOptional()
  @IsIn(['image', 'video'])
  type?: 'image' | 'video';

  @IsOptional()
  @IsIn(['true', 'false'])
  includeArchived?: 'true' | 'false';

  @IsOptional()
  @IsIn(['READY', 'ARCHIVED', 'QUARANTINED'])
  status?: 'READY' | 'ARCHIVED' | 'QUARANTINED';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;
}
