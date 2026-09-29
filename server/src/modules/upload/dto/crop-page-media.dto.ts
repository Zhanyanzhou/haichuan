import { Type } from "class-transformer";
import { IsNumber, IsPositive, IsString, Max, MaxLength, Min } from "class-validator";

export class CropPageMediaDto {
  @IsString()
  @MaxLength(500)
  sourceUrl!: string;

  @Type(() => Number)
  @IsNumber({}, { message: "裁切横坐标必须是数字" })
  @Min(0, { message: "裁切横坐标不能小于 0" })
  @Max(1, { message: "裁切横坐标不能超过 1" })
  x!: number;

  @Type(() => Number)
  @IsNumber({}, { message: "裁切纵坐标必须是数字" })
  @Min(0, { message: "裁切纵坐标不能小于 0" })
  @Max(1, { message: "裁切纵坐标不能超过 1" })
  y!: number;

  @Type(() => Number)
  @IsNumber({}, { message: "裁切宽度必须是数字" })
  @IsPositive({ message: "裁切宽度必须大于 0" })
  @Max(1, { message: "裁切宽度不能超过 1" })
  width!: number;

  @Type(() => Number)
  @IsNumber({}, { message: "裁切高度必须是数字" })
  @IsPositive({ message: "裁切高度必须大于 0" })
  @Max(1, { message: "裁切高度不能超过 1" })
  height!: number;
}
