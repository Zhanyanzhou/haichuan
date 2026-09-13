import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const MEDIA_ASSET_SOURCE_TYPES = [
  'BRAND_OWNED',
  'COMMISSIONED',
  'LICENSED_THIRD_PARTY',
  'PUBLIC_DOMAIN',
  'CUSTOMER_SUPPLIED',
  'AI_GENERATED',
  'LEGACY_UNVERIFIED',
  'OTHER',
] as const;

export type MediaAssetSourceTypeInput = typeof MEDIA_ASSET_SOURCE_TYPES[number];

export class ExpectedMediaAuthorizationRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;
}

export class SaveMediaAuthorizationDraftDto {
  /** 0 只用于纯 DDL 升级后的旧素材首次显式建立授权草稿。 */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsIn(MEDIA_ASSET_SOURCE_TYPES)
  sourceType!: MediaAssetSourceTypeInput;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  authorizationBasis?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  evidenceReference?: string | null;

  @IsBoolean()
  publicWebUseAllowed!: boolean;

  @IsOptional()
  @IsISO8601({ strict: true })
  validFrom?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  validUntil?: string | null;
}

export class ReviewMediaAuthorizationDto extends ExpectedMediaAuthorizationRevisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string | null;
}

export class RejectMediaAuthorizationDto extends ExpectedMediaAuthorizationRevisionDto {
  @IsString()
  @MaxLength(1000)
  reviewNote!: string;
}

export class RevokeMediaAuthorizationDto extends ExpectedMediaAuthorizationRevisionDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class RenewMediaAuthorizationDto extends ExpectedMediaAuthorizationRevisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  authorizationBasis?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  evidenceReference?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  validFrom?: string | null;

  @IsISO8601({ strict: true })
  validUntil!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string | null;
}

export class MediaAuthorizationImpactPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  assetIds!: number[];
}
