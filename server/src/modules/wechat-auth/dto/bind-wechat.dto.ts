import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class BindWechatDto {
  @IsString()
  // 服务端签发的绑定令牌为 JWT 三段式（header.payload.signature）
  @Matches(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, {
    message: "微信登录凭证格式错误",
  })
  bindToken!: string;

  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: "请提供有效的手机号码" })
  phone!: string;

  @IsString()
  @IsNotEmpty({ message: "请输入登录密码" })
  // 既有手机号需要原密码，新手机号的密码长度规则由 service 在短信验真后执行。
  @MaxLength(128, { message: "密码输入过长" })
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: "短信验证码格式不正确" })
  smsCode?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "称呼不能为空" })
  @MaxLength(50, { message: "称呼不能超过 50 个字符" })
  name?: string;
}
