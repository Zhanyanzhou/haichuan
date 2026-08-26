import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsBoolean,
  IsDefined,
  Equals,
  Matches,
  MaxLength,
  IsInt,
  IsPositive,
} from 'class-validator';

/** 公开咨询提交：在 service 之前拦截非法/超长输入（原 body:any 零校验） */
export class CreateInquiryDto {
  @IsString()
  @IsNotEmpty({ message: '请填写称呼' })
  @MaxLength(50, { message: '称呼不能超过50个字符' })
  customerName!: string;

  @IsString()
  @Matches(/^1\d{10}$/, { message: '请提供有效的手机号码' })
  customerPhone!: string;

  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(100, { message: '邮箱不能超过100个字符' })
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  consultationType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  preferredContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  preferredTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  budgetRange?: string;

  @IsOptional()
  @IsInt({ message: '作品标识不正确' })
  @IsPositive({ message: '作品标识不正确' })
  productId?: number;

  @IsString()
  @IsNotEmpty({ message: '请填写咨询内容' })
  @MaxLength(2000, { message: '咨询内容不能超过2000个字符' })
  message!: string;

  // 保持 unknown，避免全局 enableImplicitConversion 将字符串 "false" 转为 true。
  @IsDefined({ message: '请阅读并同意隐私说明' })
  @IsBoolean({ message: '请阅读并同意隐私说明' })
  @Equals(true, { message: '请阅读并同意隐私说明' })
  privacyConsent!: unknown;
}
