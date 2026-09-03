import { IsNumber, IsPositive, Max, Min } from 'class-validator';

// 列表图裁切的归一化坐标（0–1），Controller 换算为像素后交给 sharp。
// 显式 DTO 是为了拦住非数值/越界输入：裸 body 时 NaN 会穿透范围比较直达 sharp 变成 500。
export class CropListingImageDto {
  @IsNumber({}, { message: '裁切横坐标必须是数字' })
  @Min(0, { message: '裁切横坐标不能小于 0' })
  @Max(1, { message: '裁切横坐标不能超过 1' })
  x!: number;

  @IsNumber({}, { message: '裁切纵坐标必须是数字' })
  @Min(0, { message: '裁切纵坐标不能小于 0' })
  @Max(1, { message: '裁切纵坐标不能超过 1' })
  y!: number;

  @IsNumber({}, { message: '裁切宽度必须是数字' })
  @IsPositive({ message: '裁切宽度必须大于 0' })
  @Max(1, { message: '裁切宽度不能超过 1' })
  width!: number;

  @IsNumber({}, { message: '裁切高度必须是数字' })
  @IsPositive({ message: '裁切高度必须大于 0' })
  @Max(1, { message: '裁切高度不能超过 1' })
  height!: number;
}
