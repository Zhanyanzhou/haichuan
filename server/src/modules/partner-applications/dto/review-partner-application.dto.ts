import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 合作申请审核 DTO（后台员工用）
 * SUSPENDED 仅 ADMIN/SUPER_ADMIN 可设置（服务端校验）。
 */
export class ReviewPartnerApplicationDto {
  @IsEnum(
    ['APPROVED', 'NEEDS_SUPPLEMENT', 'REJECTED', 'SUSPENDED'] as const,
    { message: '审核动作不正确' },
  )
  action!: 'APPROVED' | 'NEEDS_SUPPLEMENT' | 'REJECTED' | 'SUSPENDED';

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: '审核说明不能超过2000个字符' })
  reviewNote?: string;
}
