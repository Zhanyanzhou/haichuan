import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import {
  STAFF_PASSWORD_MESSAGE,
  STAFF_PASSWORD_PATTERN,
} from '../../users/staff-password-policy';

/**
 * 注册 DTO:不包含 role/status,避免调用方提权
 * (service 固定创建 EDITOR)
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: '请输入用户名' })
  @MinLength(3, { message: '用户名至少 3 位' })
  @MaxLength(50)
  username!: string;

  @IsString()
  @MinLength(12, { message: STAFF_PASSWORD_MESSAGE })
  @MaxLength(128)
  @Matches(STAFF_PASSWORD_PATTERN, {
    message: STAFF_PASSWORD_MESSAGE,
  })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  realName?: string;

  @IsOptional()
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone?: string;
}
