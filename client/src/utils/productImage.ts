/**
 * 统一商品图片选择函数
 * 
 * 读取规则（按优先级回退）：
 *   列表/搜索/推荐 → listingImage → primaryImage → 第一张 FRONT → 第一张 → placeholder
 *   商品详情       → primaryImage → 第一张 FRONT → 第一张 → placeholder
 *   后台缩略       → listingImage → primaryImage → 第一张 FRONT → placeholder
 * 
 * 禁止散落在各组件中的 images[0] 写法。
 */

import type { ProductImage } from '@/types';

/** ProductImage 对象判断 */
function isImageObj(img: any): img is ProductImage {
  return typeof img === 'object' && img !== null && 'url' in img;
}

/** 从 images 数组中提取第一张有效 URL */
function firstImageUrl(images?: ProductImage[] | string[]): string {
  if (!images || images.length === 0) return '';
  const first = images[0];
  if (isImageObj(first)) {
    // ProductImage[] — 优先 FRONT
    const front = images.find(img => isImageObj(img) && img.type === 'FRONT') as ProductImage | undefined;
    if (front?.url) return front.url;
    if (first.url) return first.url;
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
 * 获取列表图 URL（Catalog / Search / 推荐）
 */
export function getListingImage(product: ProductLike): string {
  if (!product) return '/images/products/placeholder.svg';
  if (product.listingImage?.url) return product.listingImage.url;
  if (product.primaryImage?.url) return product.primaryImage.url;
  const fromImages = firstImageUrl(product.images);
  if (fromImages) return fromImages;
  return '/images/products/placeholder.svg';
}

/**
 * 获取详情主图 URL（ProductDetail）
 */
export function getPrimaryImage(product: ProductLike): string {
  if (!product) return '/images/products/placeholder.svg';
  if (product.primaryImage?.url) return product.primaryImage.url;
  const fromImages = firstImageUrl(product.images);
  if (fromImages) return fromImages;
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
