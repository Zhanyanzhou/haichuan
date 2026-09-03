import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsObject,
  IsIn,
  MaxLength,
  IsBoolean,
  Equals,
  Matches,
} from 'class-validator';

export const PUBLIC_ANALYTICS_EVENT_NAMES = [
  'page_view',
  'view_item_list',
  'view_item',
  'product_view',
  'search',
  'filter',
  'add_to_selection',
  'remove_from_selection',
  'submit_selection',
  'submit_inquiry',
  'cta_click',
  'add_to_cart',
  'remove_from_cart',
  'view_cart',
  'begin_checkout',
  'add_payment_info',
  'order_created',
  'purchase',
  'refund',
] as const;
export const PUBLIC_ANALYTICS_CONSENT_VERSION = 'analytics-v1';

/** 公开埋点上报：限制字段长度，防止超长字符串撑爆 DB 列或 metadata */
export class TrackEventDto {
  @IsBoolean()
  @Equals(true)
  consentGranted!: true;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Equals(PUBLIC_ANALYTICS_CONSENT_VERSION)
  consentVersion!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @IsIn(PUBLIC_ANALYTICS_EVENT_NAMES)
  eventName!: (typeof PUBLIC_ANALYTICS_EVENT_NAMES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  pagePath?: string;

  @IsOptional()
  @IsInt()
  productId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  searchTerm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsIn(['mobile', 'tablet', 'desktop'])
  deviceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^s_[A-Za-z0-9-]{12,96}$/)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^v_[A-Za-z0-9-]{12,96}$/)
  visitorId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
