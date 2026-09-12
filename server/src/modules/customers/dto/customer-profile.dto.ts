import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MESSAGE,
  ACCOUNT_PASSWORD_MIN_LENGTH,
} from '../../users/staff-password-policy';

const PROFILE_NAME_PATTERN = /^[\p{L}\p{N}_·.\- ]+$/u;

export class UpdateCustomerNameDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value)
  @IsString()
  @Length(1, 50, { message: '称呼长度必须为 1-50 个字符' })
  @Matches(PROFILE_NAME_PATTERN, { message: '称呼只能包含文字、数字、空格、下划线、中点和短横线' })
  name!: string;
}

export class ChangeCustomerPasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(128, { message: '当前密码输入过长' })
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: '短信验证码格式不正确' })
  currentSmsCode?: string;

  @IsString()
  @Length(ACCOUNT_PASSWORD_MIN_LENGTH, ACCOUNT_PASSWORD_MAX_LENGTH, {
    message: ACCOUNT_PASSWORD_MESSAGE,
  })
  newPassword!: string;
}

export class StartCustomerContactChangeDto {
  @IsIn(['PHONE', 'EMAIL'], { message: '换绑类型无效' })
  type!: 'PHONE' | 'EMAIL';

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(100, { message: '新的绑定信息过长' })
  newValue!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128, { message: '当前密码输入过长' })
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: '短信验证码格式不正确' })
  currentSmsCode?: string;
}

export class ConfirmCustomerContactChangeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: '验证码格式不正确' })
  verificationCode!: string;
}
