import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const MATERIAL_TYPES = [
  "GOLD_999",
  "GOLD_9999",
  "AU750",
  "PT950",
  "S925",
  "DIAMOND",
  "JADE",
  "PEARL",
  "COLOR_GEM",
  "OTHER",
] as const;

const SALES_MODES = [
  "DISPLAY_ONLY",
  "SELECTION",
  "APPOINTMENT",
  "DIRECT_PURCHASE",
  "CUSTOM_INQUIRY",
] as const;

const SORT_OPTIONS = [
  "sortOrder",
  "price_asc",
  "price_desc",
  "updated_desc",
  "code_asc",
] as const;

const POSITIVE_ID_CSV = /^[1-9]\d*(?:,[1-9]\d*)*$/;
const NON_EMPTY_CSV = /^[^,]+(?:,[^,]+)*$/;
const MATERIAL_TYPE_CSV = new RegExp(
  `^(?:${MATERIAL_TYPES.join("|")})(?:,(?:${MATERIAL_TYPES.join("|")}))*$`,
);
const WEIGHT_RANGE_CSV =
  /^\d+(?:\.\d+)?:\d*(?:\.\d+)?(?:,\d+(?:\.\d+)?:\d*(?:\.\d+)?)*$/;

/** 游客与客户商品目录共用的只读查询参数。 */
export class PublicProductQueryDto {
  @IsOptional()
  @IsIn(["zh-CN", "en"])
  locale?: "zh-CN" | "en";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  /** 分类 ID 集合；与商品 ID 集合 ids 明确分离。 */
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  @Matches(POSITIVE_ID_CSV, { message: "categoryIds 必须是正整数逗号列表" })
  categoryIds?: string;

  /** 商品 ID 集合，仅用于按已知商品定向取数。 */
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  @Matches(POSITIVE_ID_CSV, { message: "ids 必须是正整数逗号列表" })
  ids?: string;

  /** 新 PageDocument 使用的稳定商品 code 集合。 */
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  @Matches(NON_EMPTY_CSV, { message: "codes 必须是非空逗号列表" })
  codes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  exactCode?: string;

  @IsOptional()
  @IsIn(MATERIAL_TYPES)
  materialType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(MATERIAL_TYPE_CSV, { message: "materialTypes 包含不支持的材质" })
  materialTypes?: string;

  @IsOptional()
  @IsIn(SALES_MODES)
  salesMode?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  isHot?: string;

  @IsOptional()
  @IsIn(["true", "false"])
  isRecommended?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  @Matches(POSITIVE_ID_CSV, {
    message: "attributeValueIds 必须是正整数逗号列表",
  })
  attributeValueIds?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(NON_EMPTY_CSV, { message: "craftTechniques 格式不正确" })
  craftTechniques?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(NON_EMPTY_CSV, { message: "sizes 格式不正确" })
  sizes?: string;

  /** 半开重量区间 min:max，多区间逗号分隔；max 为空表示无上限。 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(WEIGHT_RANGE_CSV, { message: "weightRanges 格式不正确" })
  weightRanges?: string;

  @IsOptional()
  @IsIn(SORT_OPTIONS)
  sortBy?: (typeof SORT_OPTIONS)[number];

  @IsOptional()
  @IsIn(["true", "false"])
  includeFacets?: string;
}
