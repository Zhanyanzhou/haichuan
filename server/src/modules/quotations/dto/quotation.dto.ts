import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class QuotationListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(['all', 'DRAFT', 'PENDING_CONFIRM', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'CONVERTED'])
  status?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  salesConsultantId?: number;

  @IsOptional()
  @IsIn(['RETAIL', 'CUSTOM', 'PARTNER_WAX'])
  channel?: 'RETAIL' | 'CUSTOM' | 'PARTNER_WAX';
}

export class QuotationCustomerLookupQueryDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

/** 报价单商品行（关联 SKU 可选；转订单时必须全部带 skuId） */
export class QuotationItemInputDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  skuId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  productId?: number;

  @IsString()
  @MaxLength(200)
  productName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  productImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  spec?: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99, { message: '单价不能超过 99,999,999.99' })
  unitPrice!: number; // 原价

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99, { message: '报价不能超过 99,999,999.99' })
  quotedPrice!: number; // 报价（成交单价）
}

/** 创建报价单 */
export class CreateQuotationDto {
  @IsOptional()
  @IsIn(['RETAIL', 'CUSTOM', 'PARTNER_WAX'])
  channel?: 'RETAIL' | 'CUSTOM' | 'PARTNER_WAX';

  @IsOptional()
  @IsInt()
  @Min(1)
  customerId?: number;

  @IsString()
  @MaxLength(50)
  customerName!: string;

  @IsString()
  @MaxLength(20)
  customerPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerEmail?: string;

  @IsOptional()
  @IsInt()
  salesConsultantId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemInputDto)
  items!: QuotationItemInputDto[];
}

/** 编辑报价单（仅草稿可改；字段全可选） */
export class UpdateQuotationDto {
  @IsOptional()
  @IsIn(['RETAIL', 'CUSTOM', 'PARTNER_WAX'])
  channel?: 'RETAIL' | 'CUSTOM' | 'PARTNER_WAX';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerEmail?: string;

  @IsOptional()
  @IsInt()
  salesConsultantId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemInputDto)
  items?: QuotationItemInputDto[];
}

/** 报价转订单 */
export class ConvertQuotationDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @IsString()
  orderType?: 'SPOT' | 'CUSTOM' | 'RESERVATION' | 'OFFLINE';
}
