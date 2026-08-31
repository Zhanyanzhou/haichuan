import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class BindWechatDto {
  @IsString()
  @Matches(/^[a-f0-9]{48}$/i, { message: "微信登录凭证格式错误" })
  bindToken!: string;

  @IsString()
  @Matches(/^1\d{10}$/, { message: "请提供有效的手机号码" })
  phone!: string;

  @IsString()
  @IsNotEmpty({ message: "请输入登录密码" })
  // 既有手机号需要原密码，新手机号的 6-18 位规则由 service 在确认不存在后执行。
  @MaxLength(128, { message: "密码输入过长" })
  password!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "称呼不能为空" })
  @MaxLength(50, { message: "称呼不能超过 50 个字符" })
  name?: string;
}
