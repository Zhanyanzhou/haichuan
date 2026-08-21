import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class AdminProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @IsIn(["DRAFT", "PUBLISHED", "OFFLINE", "ARCHIVED"])
  status?: string;

  @IsOptional()
  @IsIn(["PUBLIC", "MEMBER", "PARTNER", "INTERNAL"])
  visibility?: string;

  @IsOptional()
  @IsIn(["updated_desc", "code_asc", "sortOrder"])
  sortBy?: string;

  @IsOptional()
  @IsString()
  materialType?: string;

  @IsOptional()
  @IsString()
  salesMode?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  isHot?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  isRecommended?: string;

  /** 旧 PageDocument 的定向解析，仅兼容读取。 */
  @IsOptional()
  @IsString()
  ids?: string;

  /** 新 PageDocument 使用的 Product.code 集合。 */
  @IsOptional()
  @IsString()
  codes?: string;
}
