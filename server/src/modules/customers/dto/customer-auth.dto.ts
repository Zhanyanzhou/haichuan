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

export const CUSTOMER_PHONE_REGEX = /^1[3-9]\d{9}$/;

class CustomerPhoneDto {
  @IsString()
  @Matches(CUSTOMER_PHONE_REGEX, { message: '请提供有效的手机号码' })
  phone!: string;
}

class StrongPasswordDto {
  @IsString()
  @MinLength(8, { message: '密码至少需要 8 位，并包含字母和数字' })
  @MaxLength(128, { message: '密码不能超过 128 位' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: '密码至少需要 8 位，并包含字母和数字',
  })
  password!: string;
}

export class CustomerRegisterDto extends StrongPasswordDto {
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

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: '短信验证码格式不正确' })
  smsCode?: string;
}

export class CustomerLoginDto extends CustomerPhoneDto {
  @IsString()
  @MinLength(8, { message: '密码至少需要 8 位，并包含字母和数字' })
  @MaxLength(128, { message: '密码不能超过 128 位' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: '密码至少需要 8 位，并包含字母和数字',
  })
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: '请填写正确的邮箱地址' })
  @MaxLength(100)
  email!: string;
}

export class ResetPasswordDto extends StrongPasswordDto {
  @IsString()
  @Length(64, 64, { message: '重置链接无效' })
  @Matches(/^[0-9a-f]+$/, { message: '重置链接无效' })
  token!: string;
}

export class RequestSmsCodeDto extends CustomerPhoneDto {}

export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '姓名格式不正确' })
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== '')
  @IsEmail({}, { message: '请填写正确的邮箱地址' })
  @MaxLength(100)
  email?: string;
}

export class CloseCustomerAccountDto {
  @IsString()
  @IsNotEmpty({ message: '请输入登录密码确认' })
  @MaxLength(128)
  password!: string;
}
