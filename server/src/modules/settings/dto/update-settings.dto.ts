import {
  IsString,
  IsOptional,
  MaxLength,
  IsEmail,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  Matches,
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";
import {
  DEFAULT_PUBLIC_CONTENT_LOCALE,
} from "../../../common/content-locale";

/** 站点设置更新：仅允许 DEFAULT_SETTINGS 内的已知键，防止任意键污染统一设置。 */
export class UpdateSettingsDto {
  @IsOptional() @IsString() @MaxLength(100) siteName?: string;
  @IsOptional() @IsString() @MaxLength(500) siteDescription?: string;
  @IsOptional() @IsString() @MaxLength(500) logo?: string;
  @IsOptional() @IsIn(["logo", "text-only"]) brandPresentationMode?: string;
  @IsOptional() @IsString() @MaxLength(200) brandReviewReference?: string;
  @IsOptional() @IsString() @MaxLength(200) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(500) seoDescription?: string;
  @IsOptional() @IsString() @MaxLength(500) seoKeywords?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  @ValidateIf((_object: UpdateSettingsDto, value: unknown) => value !== "")
  @IsEmail()
  @MaxLength(100)
  contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(300) contactAddress?: string;
  @IsOptional() @IsString() @MaxLength(100) storeName?: string;
  @IsOptional() @IsString() @MaxLength(100) businessHours?: string;
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^$|^https?:\/\//i, { message: "门店地图链接必须以 http:// 或 https:// 开头" })
  storeMapUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^$|^https:\/\//i, { message: "正式站点地址必须以 https:// 开头" })
  canonicalBaseUrl?: string;

  @IsOptional() @IsString() @MaxLength(200) legalEntityReviewReference?: string;
  @IsOptional() @IsString() @MaxLength(200) privacyPolicyReviewReference?: string;
  @IsOptional() @IsString() @MaxLength(200) seoReviewReference?: string;

  @IsOptional()
  @IsIn([DEFAULT_PUBLIC_CONTENT_LOCALE])
  defaultLocale?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @IsIn([DEFAULT_PUBLIC_CONTENT_LOCALE], { each: true })
  publishedLocales?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: "支付方式不能超过 50 项" })
  @IsString({ each: true, message: "支付方式必须为字符串数组" })
  paymentMethods?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: "物流公司不能超过 50 项" })
  @IsString({ each: true, message: "物流公司必须为字符串数组" })
  logisticsCompanies?: string[];
}
