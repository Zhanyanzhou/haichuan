import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FeeCalculationMethod, QuoteChannel, TradeResourceKind, WaxType } from '@prisma/client';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ResourceRequirementInputDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  resourceBucketId!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999_999_999.999)
  requiredQuantity!: number;
}

export class IssueQuotationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  designFileVersionId?: number;

  @IsOptional()
  @IsEnum(WaxType)
  waxType?: WaxType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  feeRuleIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ResourceRequirementInputDto)
  resourceRequirements?: ResourceRequirementInputDto[];
}

export class ConfirmQuotationOrderDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quotationVersion!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  addressId?: number;

  @ValidateIf((dto: ConfirmQuotationOrderDto) => dto.addressId == null)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address?: string;
}

export class CreatePartnerPriceAgreementDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  redWaxRate!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  purpleWaxRate!: number;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

export class CreateQuotationFeeRuleDto {
  @Transform(trimString)
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,49}$/)
  code!: string;

  @IsEnum(QuoteChannel)
  channel!: QuoteChannel;

  @IsOptional()
  @IsEnum(WaxType)
  waxType?: WaxType;

  @IsEnum(FeeCalculationMethod)
  calculationMethod!: FeeCalculationMethod;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitAmount!: number;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  displayText!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class CreateTradeResourceBucketDto {
  @IsEnum(QuoteChannel)
  channel!: QuoteChannel;

  @IsEnum(TradeResourceKind)
  kind!: TradeResourceKind;

  @Transform(trimString)
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,49}$/)
  code!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bucketKey!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  displayName!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  unit!: string;

  @IsOptional()
  @IsDateString()
  bucketStart?: string;

  @IsOptional()
  @IsDateString()
  bucketEnd?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  availableQuantity!: number;
}

export class UpdateTradeResourceBucketDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  availableQuantity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateCooperationDesignFileDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  referenceNo!: string;
}

export class CreateCooperationDesignFileVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  mediaAssetId!: number;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  checksumSha256?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  targetGoldWeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  redWaxWeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  purpleWaxWeight?: number;
}

/** multipart 上传端点使用；mediaAssetId 只能由服务端在字节落盘后生成。 */
export class UploadCooperationDesignFileVersionDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  targetGoldWeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  redWaxWeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  purpleWaxWeight?: number;
}
