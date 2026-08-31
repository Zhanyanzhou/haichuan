import { Type } from "class-transformer";
import { IsISO8601, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class SavePageDocumentDto {
  @IsString()
  @MaxLength(80)
  pageKey!: string;

  @IsObject()
  puckData!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  editorVersion?: string;

  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class PublishPageDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  pageKey?: string;

  @IsISO8601()
  expectedUpdatedAt!: string;
}

export class ValidatePageDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  pageKey?: string;

  @IsOptional()
  @IsObject()
  puckData?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RestorePageDocumentRevisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  pageKey?: string;

  @IsISO8601()
  expectedUpdatedAt!: string;
}

export class RollbackPagePublicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  pageKey?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPublishedRevisionId!: number;
}
