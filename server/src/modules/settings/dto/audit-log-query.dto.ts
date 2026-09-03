import { IsOptional, IsString, MaxLength } from 'class-validator';
import { BoundedListQueryDto } from '../../../common/dto/bounded-list-query.dto';

/** 操作日志列表边界：沿用统一分页，并允许按审计动作精确筛选。 */
export class AuditLogQueryDto extends BoundedListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;
}
