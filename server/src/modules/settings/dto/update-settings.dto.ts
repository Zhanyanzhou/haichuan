import { IsString, IsOptional, MaxLength, IsEmail, IsArray, ArrayMaxSize } from 'class-validator';

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
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: '支付方式不能超过 50 项' })
  @IsString({ each: true, message: '支付方式必须为字符串数组' })
  paymentMethods?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: '物流公司不能超过 50 项' })
  @IsString({ each: true, message: '物流公司必须为字符串数组' })
  logisticsCompanies?: string[];
}
