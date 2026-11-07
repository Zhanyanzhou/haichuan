import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CheckProductImportCodesDto {
  @Transform(({ value }) => Array.isArray(value)
    ? value.map((code) => typeof code === "string" ? code.trim() : code)
    : value)
  @IsArray({ message: "请提交待检查的款号列表" })
  @ArrayMaxSize(50, { message: "每次最多检查 50 个款号" })
  @IsString({ each: true, message: "款号必须是字符串" })
  @IsNotEmpty({ each: true, message: "请填写商品款号" })
  @MaxLength(50, { each: true, message: "款号不能超过 50 个字符" })
  codes!: string[];
}
