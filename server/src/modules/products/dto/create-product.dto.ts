import {
  IsString, IsOptional, IsInt, IsBoolean, IsEnum, IsNumber,
  Min, MaxLength, IsNotEmpty, ValidateNested, IsArray, ArrayMaxSize,
  IsIn, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MaterialType, ProductStatus, ProductVisibility, SalesMode,
  ProductPurchaseRegion, ProductPublishMode, ProductFulfillmentType,
  ProductDispatchTime, InventoryPolicy,
} from '@prisma/client';
import { CreateSkuDto } from './sku.dto';

export class ProductDetailBlockDto {
  @IsIn(['TEXT', 'IMAGE'], { message: '详情模块类型不正确' })
  type!: 'TEXT' | 'IMAGE';

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '详情图片标识不正确' })
  imageId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string;
}

/**
 * 创建商品 DTO
 * 字段映射 Prisma Product 模型的标量字段
 */
export class CreateProductDto {
  @IsString({ message: '商品名称必须是字符串' })
  @IsNotEmpty({ message: '请填写商品名称' })
  @MaxLength(200, { message: '商品名称不能超过200个字符' })
  name!: string;

  @IsString({ message: '货号必须是字符串' })
  @IsNotEmpty({ message: '请填写商品货号' })
  @MaxLength(50, { message: '货号不能超过50个字符' })
  code!: string;

  @IsOptional()
  @IsString({ message: '简介必须是字符串' })
  @MaxLength(500, { message: '简介不能超过500个字符' })
  shortDescription?: string;

  @IsOptional()
  @IsString({ message: '描述必须是字符串' })
  description?: string;

  @Type(() => Number)
  @IsInt({ message: '请选择商品分类' })
  @Min(1, { message: '请选择有效的商品分类' })
  categoryId!: number;

  @IsOptional()
  @IsEnum(MaterialType, { message: '材质类型不正确' })
  materialType?: MaterialType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '金重必须是数字' })
  @Min(0, { message: '金重不能为负数' })
  goldWeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '工费必须是数字' })
  @Min(0, { message: '工费不能为负数' })
  craftFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '价格必须是数字' })
  @Min(0, { message: '价格不能为负数' })
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: '重量必须是数字' })
  @Min(0, { message: '重量不能为负数' })
  weight?: number;

  @IsOptional()
  @IsString({ message: '尺寸必须是字符串' })
  @MaxLength(100)
  size?: string;

  @IsOptional()
  gemInfo?: any;

  @IsOptional()
  craftTechnique?: any;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: '详情模块不能超过50个' })
  @ValidateNested({ each: true })
  @Type(() => ProductDetailBlockDto)
  detailContent?: ProductDetailBlockDto[];

  @IsOptional()
  @IsEnum(ProductStatus, { message: '商品状态不正确，请重新选择' })
  status?: ProductStatus;

  @IsOptional()
  @IsEnum(ProductVisibility, { message: '商品可见范围不正确' })
  visibility?: ProductVisibility;

  @IsOptional()
  @IsEnum(SalesMode, { message: '销售模式不正确，请重新选择' })
  salesMode?: SalesMode;

  @IsOptional()
  @IsEnum(InventoryPolicy, { message: '库存策略不正确，请重新选择' })
  inventoryPolicy?: InventoryPolicy;

  @IsOptional()
  @IsEnum(ProductPurchaseRegion)
  purchaseRegion?: ProductPurchaseRegion;

  @IsOptional()
  @IsEnum(ProductPublishMode)
  publishMode?: ProductPublishMode;

  @IsOptional()
  @IsDateString({}, { message: '定时上架时间格式不正确' })
  scheduledPublishAt?: string | null;

  @IsOptional()
  @IsEnum(ProductFulfillmentType)
  fulfillmentType?: ProductFulfillmentType;

  @IsOptional()
  @IsEnum(ProductDispatchTime)
  dispatchTime?: ProductDispatchTime;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  shippingTemplateId?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  deliveryMethods?: string[];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requiresInsuredShipping?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requiresSignature?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includesCertificate?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  packageType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customLeadTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '排序必须是整数' })
  sortOrder?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: '热卖标记必须是布尔值' })
  isHot?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: '新品标记必须是布尔值' })
  isNew?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: '推荐标记必须是布尔值' })
  isRecommended?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: '限量标记必须是布尔值' })
  isLimited?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: '定制标记必须是布尔值' })
  isCustom?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: '多件优惠标记必须是布尔值' })
  multiDiscount?: boolean;

  /** 多规格模式：传入 SKU 列表则不再自动创建默认 SKU，商品起价取 SKU 最低价 */
  @IsOptional()
  @IsArray({ message: '商品规格必须是数组' })
  @ValidateNested({ each: true })
  @Type(() => CreateSkuDto)
  skus?: CreateSkuDto[];
}
