import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  LEAD_CONTACT_METHODS,
  LEAD_LEGAL_HOLD_REASONS,
  LEAD_LEGAL_HOLD_RELEASE_REASONS,
  LEAD_STATUSES,
} from '../lead.constants';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateLeadDto {
  @IsOptional()
  @IsIn(LEAD_STATUSES, { message: '线索状态不合法' })
  status?: string;

  @IsOptional()
  @IsString({ message: '内部备注必须是字符串' })
  internalNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '负责人 ID 必须是整数' })
  @Min(1, { message: '负责人 ID 必须大于 0' })
  assignedTo?: number;

  @IsOptional()
  @IsDateString({}, { message: '下次跟进时间必须是 ISO 8601 时间' })
  nextFollowUpAt?: string | null;

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: '关闭原因必须是字符串' })
  @Matches(/\S/, { message: '完成或无效时必须填写原因' })
  @MaxLength(1000, { message: '关闭原因不能超过1000个字符' })
  closureReason?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString({ message: '重开原因必须是字符串' })
  @Matches(/\S/, { message: '重新打开时必须填写原因' })
  @MaxLength(1000, { message: '重开原因不能超过1000个字符' })
  reopenReason?: string;
}

export class CreateLeadFollowUpDto {
  @Transform(trimString)
  @IsString({ message: '跟进内容必须是字符串' })
  @IsNotEmpty({ message: '跟进内容不能为空' })
  @Matches(/\S/, { message: '跟进内容不能为空' })
  content!: string;

  @IsOptional()
  @IsIn(LEAD_CONTACT_METHODS, { message: '跟进方式不合法' })
  contactMethod?: string;

  @IsOptional()
  @IsDateString({}, { message: '下次跟进时间必须是 ISO 8601 时间' })
  nextFollowUpAt?: string | null;
}

export class SetLeadLegalHoldDto {
  @IsIn(LEAD_LEGAL_HOLD_REASONS, { message: '法律保留原因不合法' })
  reason!: string;
}

export class ReleaseLeadLegalHoldDto {
  @IsIn(LEAD_LEGAL_HOLD_RELEASE_REASONS, { message: '解除法律保留原因不合法' })
  reason!: string;
}
