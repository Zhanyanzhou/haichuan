import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MESSAGE,
  ACCOUNT_PASSWORD_MIN_LENGTH,
} from '../../users/staff-password-policy';

export const CUSTOMER_PHONE_REGEX = /^1[3-9]\d{9}$/;
export const CUSTOMER_USERNAME_REGEX = /^[a-z][a-z0-9_]{3,31}$/;

class CustomerPhoneDto {
  @IsString()
  @Matches(CUSTOMER_PHONE_REGEX, { message: '请提供有效的手机号码' })
  phone!: string;
}

class AccountPasswordDto {
  @IsString()
  @MinLength(ACCOUNT_PASSWORD_MIN_LENGTH, { message: ACCOUNT_PASSWORD_MESSAGE })
  @MaxLength(ACCOUNT_PASSWORD_MAX_LENGTH, { message: ACCOUNT_PASSWORD_MESSAGE })
  password!: string;
}

export class CustomerRegisterDto extends AccountPasswordDto {
  @IsString()
  @Matches(CUSTOMER_PHONE_REGEX, { message: '请提供有效的手机号码' })
  phone!: string;

  @IsString()
  @IsNotEmpty({ message: '请填写有效的称呼' })
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsEmail({}, { message: '请填写正确的邮箱地址' })
  @MaxLength(100)
  email?: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: '短信验证码格式不正确' })
  smsCode!: string;
}

export class CustomerLoginDto {
  @ValidateIf((dto: CustomerLoginDto) => !dto.username?.trim())
  @IsString({ message: '请提供有效的手机号码' })
  @Matches(CUSTOMER_PHONE_REGEX, { message: '请提供有效的手机号码' })
  phone?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @ValidateIf((dto: CustomerLoginDto) => !dto.phone?.trim())
  @IsString({ message: '请填写有效的用户名' })
  @Matches(CUSTOMER_USERNAME_REGEX, { message: '用户名需为 4–32 位小写字母、数字或下划线，并以字母开头' })
  username?: string;

  @IsString()
  @IsNotEmpty({ message: '请输入登录密码' })
  // 登录只核对既有哈希并保留历史密码兼容；长度合同用于新建/重置。
  @MaxLength(128, { message: '密码输入过长' })
  password!: string;

  // 分级挑战（服务端按失败次数强制；缺失或错误由服务端返回明确提示）
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '图形验证码编号无效' })
  captchaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8, { message: '图形验证码格式不正确' })
  captchaCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: '短信验证码格式不正确' })
  smsCode?: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: '请填写正确的邮箱地址' })
  @MaxLength(100)
  email!: string;
}

export class ResetPasswordDto extends AccountPasswordDto {
  @IsString()
  @Length(64, 64, { message: '重置链接无效' })
  @Matches(/^[0-9a-f]+$/, { message: '重置链接无效' })
  token!: string;
}

export class RequestSmsCodeDto extends CustomerPhoneDto {}

export class CloseCustomerAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: '短信验证码格式不正确' })
  currentSmsCode?: string;
}
