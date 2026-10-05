import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const MAX_PRODUCT_METADATA_ITEMS = 50;

export class SetProductImagePointerDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  imageId!: number;
}

export class UpdateProductTagsDto {
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === "string" ? item.trim() : item))
      : value,
  )
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_METADATA_ITEMS)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(50, { each: true })
  tags!: string[];
}

export class UpdateProductAttributesDto {
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_METADATA_ITEMS)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  attributeValueIds!: number[];
}
