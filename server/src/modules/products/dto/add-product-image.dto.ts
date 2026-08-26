import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

const PRODUCT_IMAGE_TYPES = ["FRONT", "SIDE", "TOP", "DETAIL", "WEARING"];

export class AddProductImageDto {
  @IsOptional()
  @IsString({ message: "图片地址必须是字符串" })
  @MaxLength(500, { message: "图片地址不能超过500个字符" })
  url?: string;

  @IsOptional()
  @IsString({ message: "存储键必须是字符串" })
  @MaxLength(300, { message: "存储键不能超过300个字符" })
  storageKey?: string;

  @IsOptional()
  @IsIn(PRODUCT_IMAGE_TYPES, {
    message: "图片类型不正确",
  })
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "图片排序必须是整数" })
  @Min(0, { message: "图片排序不能小于0" })
  sortOrder?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "来源图片ID必须是整数" })
  @Min(1, { message: "来源图片ID必须大于0" })
  sourceImageId?: number;

  @IsOptional()
  @IsObject({ message: "裁切数据必须是对象" })
  cropData?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "图片宽度必须是整数" })
  @Min(1, { message: "图片宽度必须大于0" })
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "图片高度必须是整数" })
  @Min(1, { message: "图片高度必须大于0" })
  height?: number;

  @IsOptional()
  @IsString({ message: "媒体类型必须是字符串" })
  @MaxLength(50, { message: "媒体类型不能超过50个字符" })
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "文件大小必须是整数" })
  @Min(1, { message: "文件大小必须大于0" })
  fileSize?: number;

  @IsOptional()
  @Transform(({ obj, key, value }) => obj?.[key] ?? value, { toClassOnly: true })
  @IsBoolean({ message: "视频标记必须是布尔值" })
  isVideo?: boolean;
}

export class UpdateProductImageDto {
  @IsOptional()
  @IsIn(PRODUCT_IMAGE_TYPES, { message: "图片类型不正确" })
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "图片排序必须是整数" })
  @Min(0, { message: "图片排序不能小于0" })
  sortOrder?: number;
}
