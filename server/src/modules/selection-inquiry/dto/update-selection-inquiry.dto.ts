import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { LEAD_STATUSES } from "../../leads/lead.constants";

export class UpdateSelectionInquiryDto {
  @IsOptional()
  @IsIn(LEAD_STATUSES, { message: "线索状态不合法" })
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "负责人 ID 必须是整数" })
  @Min(1, { message: "负责人 ID 必须大于 0" })
  handlerId?: number;

  @IsOptional()
  @IsDateString({}, { message: "下次跟进时间必须是 ISO 8601 时间" })
  nextFollowUpAt?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: "完成或无效时必须填写原因" })
  @MaxLength(1000)
  closureReason?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: "重新打开时必须填写原因" })
  @MaxLength(1000)
  reopenReason?: string;
}
