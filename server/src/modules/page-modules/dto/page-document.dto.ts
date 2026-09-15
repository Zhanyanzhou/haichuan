import { Type } from "class-transformer";
import {
  IsBoolean,
  IsISO8601,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

const PAGE_CONTENT_LOCALES = ["zh-CN", "en"] as const;

class LocalizedPageDocumentDto {
  @IsOptional()
  @IsIn(PAGE_CONTENT_LOCALES)
  locale?: "zh-CN" | "en";
}

export class SavePageDocumentDto extends LocalizedPageDocumentDto {
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

export class PublishPageDocumentDto extends LocalizedPageDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  pageKey?: string;

  @IsISO8601()
  expectedUpdatedAt!: string;

  @Matches(/^[a-f0-9]{64}$/)
  expectedContentHash!: string;
}

export class ValidatePageDocumentDto extends LocalizedPageDocumentDto {
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

export class RestorePageDocumentRevisionDto extends LocalizedPageDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  pageKey?: string;

  @IsISO8601()
  expectedUpdatedAt!: string;
}

export class RollbackPagePublicationDto extends LocalizedPageDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  pageKey?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPublishedRevisionId!: number;
}

export class SubmitPageDocumentReviewDto extends LocalizedPageDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  pageKey?: string;

  @IsISO8601()
  expectedUpdatedAt!: string;

  @Matches(/^[a-f0-9]{64}$/)
  expectedContentHash!: string;
}

export class ReviewPageDocumentDto extends SubmitPageDocumentReviewDto {
  @IsIn(["APPROVE", "REQUEST_CHANGES"])
  action!: "APPROVE" | "REQUEST_CHANGES";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNote?: string;

  @IsOptional()
  @IsBoolean()
  selfReviewAcknowledged?: boolean;
}
