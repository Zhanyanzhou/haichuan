import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

export class AssignInquiryDto {
  @Type(() => Number)
  @IsInt({ message: "负责人 ID 必须是整数" })
  @Min(1, { message: "负责人 ID 必须大于 0" })
  assignedTo!: number;
}

export class ReplyInquiryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString({ message: "回复内容必须是字符串" })
  @IsNotEmpty({ message: "回复内容不能为空" })
  @Matches(/\S/, { message: "回复内容不能为空" })
  @MaxLength(5000, { message: "回复内容不能超过5000个字符" })
  reply!: string;
}
