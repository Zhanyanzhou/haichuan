import {
  IsString,
  IsOptional,
  MaxLength,
  IsEmail,
  IsArray,
  ArrayMaxSize,
  Matches,
} from "class-validator";

/** 站点设置更新：仅允许 DEFAULT_SETTINGS 内的已知键，防止任意键污染统一设置。 */
export class UpdateSettingsDto {
  @IsOptional() @IsString() @MaxLength(100) siteName?: string;
  @IsOptional() @IsString() @MaxLength(500) siteDescription?: string;
  @IsOptional() @IsString() @MaxLength(500) logo?: string;
  @IsOptional() @IsString() @MaxLength(200) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(500) seoDescription?: string;
  @IsOptional() @IsString() @MaxLength(500) seoKeywords?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
  @IsOptional() @IsEmail() @MaxLength(100) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(300) contactAddress?: string;
  @IsOptional() @IsString() @MaxLength(100) storeName?: string;
  @IsOptional() @IsString() @MaxLength(100) businessHours?: string;
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^$|^https?:\/\//i, { message: "门店地图链接必须以 http:// 或 https:// 开头" })
  storeMapUrl?: string;
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
