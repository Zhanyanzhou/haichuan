import {
  Equals,
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// 全局隐式转换会把字符串 "false" 转成 true；布尔写入口必须保留原值严格校验。
const preserveBooleanInput = ({
  obj,
  key,
  value,
}: {
  obj: Record<string, unknown>;
  key: string;
  value: unknown;
}) => (Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : value);

/**
 * 合作申请提交 DTO
 * 安全要点：客户不得在请求体中赋予自己 APPROVED 或 PARTNER 身份；
 * status / accountType 由服务端审核流程控制，不接受客户端传入。
 */
export class CreatePartnerApplicationDto {
  @Transform(trimString)
  @IsString({ message: '申请人姓名必须是字符串' })
  @IsNotEmpty({ message: '请填写申请人姓名' })
  @MaxLength(50, { message: '申请人姓名不能超过50个字符' })
  applicantName!: string;

  @Transform(trimString)
  @IsString({ message: '联系电话必须是字符串' })
  @IsNotEmpty({ message: '请填写联系电话' })
  @Matches(/^1\d{10}$/, { message: '请填写有效的手机号' })
  @MaxLength(20)
  applicantPhone!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200, { message: '公司名称过长' })
  companyName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  businessType?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  channelType?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(2000, { message: '业务说明不能超过2000个字符' })
  businessDescription?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  expectedPurchaseRange?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  contactWechat?: string;

  // 合作协议必须勾选；服务端记录 agreementAcceptedAt 作为合规凭证
  @Transform(preserveBooleanInput)
  @IsBoolean({ message: '请确认合作协议' })
  @Equals(true, { message: '请先阅读并同意合作协议' })
  agreementAccepted!: boolean;
}
