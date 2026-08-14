import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  MaxLength,
  Matches,
} from 'class-validator';

/**
 * 合作申请提交 DTO
 * 安全要点：客户不得在请求体中赋予自己 APPROVED 或 PARTNER 身份；
 * status / accountType 由服务端审核流程控制，不接受客户端传入。
 */
export class CreatePartnerApplicationDto {
  @IsString({ message: '申请人姓名必须是字符串' })
  @IsNotEmpty({ message: '请填写申请人姓名' })
  @MaxLength(50, { message: '申请人姓名不能超过50个字符' })
  applicantName!: string;

  @IsString({ message: '联系电话必须是字符串' })
  @IsNotEmpty({ message: '请填写联系电话' })
  @Matches(/^1\d{10}$/, { message: '请填写有效的手机号' })
  @MaxLength(20)
  applicantPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '公司名称过长' })
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  businessType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  channelType?: string;

  @IsOptional()
  @IsString()
  businessDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  expectedPurchaseRange?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactWechat?: string;

  // 合作协议必须勾选；服务端记录 agreementAcceptedAt 作为合规凭证
  @IsBoolean({ message: '请确认合作协议' })
  agreementAccepted!: boolean;
}
