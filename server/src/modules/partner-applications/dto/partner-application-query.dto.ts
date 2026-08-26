import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const PartnerApplicationStatusValues = [
  'PENDING',
  'NEEDS_SUPPLEMENT',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** 后台合作申请列表查询白名单。 */
export class PartnerApplicationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '页码必须是整数' })
  @Min(1, { message: '页码必须大于 0' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '每页数量必须是整数' })
  @Min(1, { message: '每页数量必须大于 0' })
  @Max(100, { message: '每页数量不能超过 100' })
  pageSize?: number;

  @IsOptional()
  @IsIn(PartnerApplicationStatusValues, { message: '申请状态不正确' })
  status?: (typeof PartnerApplicationStatusValues)[number];

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: '搜索关键词必须是字符串' })
  @MaxLength(100, { message: '搜索关键词不能超过 100 个字符' })
  keyword?: string;
}
