import { IsString, Matches, MaxLength } from "class-validator";

export class AdoptDatedUploadDto {
  @IsString()
  @MaxLength(500)
  @Matches(
    /^\/uploads\/\d{4}\/\d{2}\/\d{2}\/[^/?#]+$/,
    { message: "只能登记 YYYY/MM/DD 路径上的本站旧图片" },
  )
  sourceUrl!: string;
}
