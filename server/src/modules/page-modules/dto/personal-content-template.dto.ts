import { IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreatePersonalContentTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  moduleType!: string;

  @IsObject()
  layoutData!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  contentDefaults?: Record<string, unknown> | null;
}

export class UpdatePersonalContentTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsObject()
  layoutData?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  contentDefaults?: Record<string, unknown> | null;
}
