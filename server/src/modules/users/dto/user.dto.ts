import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  IsEmail,
  Matches,
  IsEnum,
} from 'class-validator';
import { Role, Status } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: '请输入用户名' })
  @MaxLength(50)
  username!: string;

  @IsString()
  @MinLength(8, { message: '密码至少8位' })
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  realName?: string;

  @IsOptional()
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsEnum(Role, { message: '角色不正确' })
  role?: Role;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  realName?: string;

  @IsOptional()
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsEnum(Role, { message: '角色不正确' })
  role?: Role;

  @IsOptional()
  @IsEnum(Status, { message: '状态不正确' })
  status?: Status;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: '密码至少8位' })
  @MaxLength(128)
  password?: string;
}
