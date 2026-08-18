import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

class SelectionInquiryItemDto {
  @IsInt()
  @Min(1)
  productId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  productSkuSnapshot?: string;
}

/** 公开选款咨询：所有个人信息写入前均须在服务端完成校验。 */
export class CreateSelectionInquiryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "请填写称呼" })
  @MaxLength(50, { message: "称呼不能超过50个字符" })
  customerName?: string;

  @IsOptional()
  @Matches(/^1[3-9]\d{9}$/, { message: "请填写正确的手机号码" })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: "邮箱格式不正确" })
  @MaxLength(100, { message: "邮箱不能超过100个字符" })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  wechat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "需求描述不能超过2000个字符" })
  message?: string;

  @IsArray({ message: "请选择作品" })
  @ArrayMinSize(1, { message: "请至少选择一款作品" })
  @ArrayMaxSize(20, { message: "一次最多选择20款作品" })
  @ValidateNested({ each: true })
  @Type(() => SelectionInquiryItemDto)
  items!: SelectionInquiryItemDto[];

  // 保持 unknown，避免全局 enableImplicitConversion 将字符串 "false" 转为 true。
  @IsDefined({ message: "请阅读并同意隐私说明" })
  @IsBoolean({ message: "请阅读并同意隐私说明" })
  @Equals(true, { message: "请阅读并同意隐私说明" })
  privacyConsent!: unknown;
}
