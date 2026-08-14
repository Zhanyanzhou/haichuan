/**
 * 统一商品图片选择函数
 *
 * 读取规则（按优先级回退）：
 *   列表/搜索/推荐 → listingImage → primaryImage → 第一张 FRONT → 第一张 → placeholder
 *   商品详情       → primaryImage → 第一张 FRONT → 第一张 → placeholder
 *   后台缩略       → listingImage → primaryImage → 第一张 FRONT → placeholder
 *
 * 受控产品库：catalog 接口返回受保护媒体端点 mediaUrl（不含公开 url）；
 * 此处优先取 mediaUrl，回退 url（兼容 admin 接口与历史数据）。禁止散落在各组件中的 images[0] 写法。
 */

import type { ProductImage } from '@/types';

/** ProductImage 对象判断 */
function isImageObj(img: any): img is ProductImage {
  return typeof img === 'object' && img !== null && ('url' in img || 'mediaUrl' in img);
}

/** 优先 mediaUrl（受控媒体端点），回退 url（admin 接口/历史数据） */
function pickImgUrl(img: any): string {
  if (!img) return '';
  return img.mediaUrl || img.url || '';
}

/**
 * 媒体端点 URL 追加动态缩放参数（服务端白名单 480/800/1200，WebP 输出）。
 * 仅对我们自己的媒体端点（含 /media/ 的路径）生效；静态资源与已带 width 的 URL 不动。
 */
function withResize(url: string, width: 480 | 800 | 1200): string {
  if (!url || !url.includes('/media/') || url.includes('width=')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}width=${width}`;
}

/** 从 images 数组中提取第一张有效 URL */
function firstImageUrl(images?: ProductImage[] | string[]): string {
  if (!images || images.length === 0) return '';
  const first = images[0];
  if (isImageObj(first)) {
    // ProductImage[] — 优先 FRONT
    const front = images.find(img => isImageObj(img) && img.type === 'FRONT') as any | undefined;
    if (pickImgUrl(front)) return pickImgUrl(front);
    if (pickImgUrl(first)) return pickImgUrl(first);
  } else if (typeof first === 'string') {
    return first;
  }
  return '';
}

type ProductLike = {
  listingImage?: ProductImage | null;
  primaryImage?: ProductImage | null;
  images?: ProductImage[] | string[];
} | null | undefined;

/**
 * 获取列表图 URL（Catalog / Search / 推荐）——自动请求 480px 缩放版，替代原图直出
 */
export function getListingImage(product: ProductLike): string {
  if (!product) return '/images/products/placeholder.svg';
  const listing = pickImgUrl(product.listingImage);
  if (listing) return withResize(listing, 480);
  const primary = pickImgUrl(product.primaryImage);
  if (primary) return withResize(primary, 480);
  const fromImages = firstImageUrl(product.images);
  if (fromImages) return withResize(fromImages, 480);
  return '/images/products/placeholder.svg';
}

/**
 * 获取详情主图 URL（ProductDetail）——1200px：灯箱清晰度与带宽的平衡点
 */
export function getPrimaryImage(product: ProductLike): string {
  if (!product) return '/images/products/placeholder.svg';
  const primary = pickImgUrl(product.primaryImage);
  if (primary) return withResize(primary, 1200);
  const fromImages = firstImageUrl(product.images);
  if (fromImages) return withResize(fromImages, 1200);
  return '/images/products/placeholder.svg';
}

/**
 * 获取后台缩略图 URL
 */
export function getThumbnailImage(product: ProductLike): string {
  return getListingImage(product);
}

/**
 * 获取详情缩略图列表（ProductDetail 缩略图切换条）
 */
export function getThumbnailList(images?: ProductImage[]): ProductImage[] {
  if (!images) return [];
  return [...images].sort((a, b) => a.sortOrder - b.sortOrder);
}
