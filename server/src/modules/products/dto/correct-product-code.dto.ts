import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CorrectProductCodeDto {
  @IsString()
  @IsNotEmpty({ message: "请填写商品款号" })
  @MaxLength(50, { message: "款号不能超过50个字符" })
  code!: string;
}
