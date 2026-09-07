import { Type } from "class-transformer";
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateDynamicTemplateDto {
  @IsObject()
  definition!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  versionNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  sourceReference?: string;
}

export class UpdateDynamicTemplateDraftDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsObject()
  definition!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  versionNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  restoreFromVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  restoreFromChecksum?: string;
}

export class SaveDynamicTemplateAsDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  versionNote?: string;
}

export class PublishDynamicTemplateDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  versionNote?: string;
}
