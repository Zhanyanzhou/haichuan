import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class BindWechatDto {
  @IsString()
  @Matches(/^[a-f0-9]{48}$/i, { message: "微信登录凭证格式错误" })
  bindToken!: string;

  @IsString()
  @Matches(/^1\d{10}$/, { message: "请提供有效的手机号码" })
  phone!: string;

  @IsString()
  @MinLength(8, { message: "密码至少需要 8 位，并包含字母和数字" })
  @MaxLength(128, { message: "密码不能超过 128 位" })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: "密码至少需要 8 位，并包含字母和数字",
  })
  password!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "称呼不能为空" })
  @MaxLength(50, { message: "称呼不能超过 50 个字符" })
  name?: string;
}
