import { Type } from "class-transformer";
import {
  IsDefined,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class DynamicTemplateCopySourceDto {
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_-]{0,127}$/)
  templateId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  revision!: number;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  definitionChecksum!: string;
}

export class CreateDynamicTemplateDto {
  @IsObject()
  definition!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DynamicTemplateCopySourceDto)
  copySource?: DynamicTemplateCopySourceDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  versionNote?: string;
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

export class RebuildDynamicTemplateDraftFromPublishedDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  expectedChecksum!: string;
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

  @ValidateIf((input: PublishDynamicTemplateDto) => (
    input.expectedChecksum !== undefined || input.targetVersion !== undefined
  ))
  @IsDefined()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  expectedChecksum?: string;

  @ValidateIf((input: PublishDynamicTemplateDto) => (
    input.expectedChecksum !== undefined || input.targetVersion !== undefined
  ))
  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetVersion?: number;
}

export class ArchiveDynamicTemplateDto {
  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsDefined()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  expectedChecksum!: string;
}
