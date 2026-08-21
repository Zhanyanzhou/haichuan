import { PartialType } from "@nestjs/swagger";
import { ShippingFeeMode } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateShippingTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  carrier?: string;

  @IsOptional()
  @IsEnum(ShippingFeeMode)
  feeMode?: ShippingFeeMode;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  remoteSurcharge?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  freeShippingThreshold?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  excludedRegions?: string[];

  @IsOptional()
  @IsBoolean()
  insured?: boolean;

  @IsOptional()
  @IsBoolean()
  signatureRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateShippingTemplateDto extends PartialType(CreateShippingTemplateDto) {}
