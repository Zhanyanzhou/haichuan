import { IsString, IsOptional, MaxLength, IsEmail, IsArray } from 'class-validator';

/** 站点设置更新：仅允许 DEFAULT_SETTINGS 内的已知键，防止任意键污染 settings.json */
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
  @IsOptional() @IsArray() paymentMethods?: string[];
  @IsOptional() @IsArray() logisticsCompanies?: string[];
}
