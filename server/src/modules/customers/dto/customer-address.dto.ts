import { IsBoolean, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

/** 中国大陆手机号校验 */
export const CHINA_PHONE_REGEX = /^1\d{10}$/;

/** 收货地址 DTO（新增/编辑） */
export class CustomerAddressDto {
  @IsString()
  @MaxLength(50)
  recipientName!: string;

  @IsString()
  @Matches(CHINA_PHONE_REGEX, { message: '请提供有效的手机号码' })
  recipientPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  district?: string;

  @IsString()
  @MaxLength(300)
  detail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** 付款凭证提交 DTO */
export class SubmitPaymentProofDto {
  @IsString()
  @MaxLength(500)
  proofKey!: string;
}
