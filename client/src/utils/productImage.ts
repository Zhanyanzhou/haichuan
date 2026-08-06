/**
 * 统一商品图片选择函数
 * 
 * 接受 ProductImage[]（详情API返回）或 string[]（列表API映射）
 * 
 * 读取顺序（按角色优先级回退）：
 *   列表/搜索/推荐 → LISTING → PRIMARY → 第一张 FRONT → 第一个URL → placeholder
 *   商品详情       → PRIMARY → 第一张 FRONT → placeholder
 *   后台缩略       → THUMBNAIL → LISTING → PRIMARY → placeholder
 * 
 * 禁止散落在各组件中的 images[0] 写法。
 */

import type { ProductImage } from '@/types';

type ImageRole = 'LISTING' | 'PRIMARY' | 'THUMBNAIL';
type ImageInput = ProductImage | string;

function isObj(img: ImageInput): img is ProductImage {
  return typeof img === 'object' && img !== null;
}

/**
 * 按角色获取商品图片 URL
 * 兼容 ProductImage[]（详情API）和 string[]（列表API映射的 CatalogProduct）
 */
export function getProductImage(
  images: ImageInput[] | undefined | null,
  role: ImageRole,
): string {
  const arr = images && images.length > 0 ? images : [];
  const objs = arr.filter(isObj);
  const strs = arr.filter((img): img is string => typeof img === 'string');

  // 1. 精确角色匹配（仅 ProductImage）
  const byRole = objs.find(img => img.role === role);
  if (byRole?.url) return byRole.url;

  // 2. 列表/缩略图回退链
  if (role === 'LISTING' || role === 'THUMBNAIL') {
    const primary = objs.find(img => img.role === 'PRIMARY' || img.type === 'FRONT');
    if (primary?.url) return primary.url;
    // 字符串数组直接取第一个
    if (strs[0]) return strs[0];
  }

  // 3. PRIMARY 回退
  if (role === 'PRIMARY') {
    const front = objs.find(img => img.type === 'FRONT');
    if (front?.url) return front.url;
  }

  // 4. 兜底：第一个对象 URL → 第一个字符串 → placeholder
  const firstObj = objs.find(img => img.url);
  if (firstObj?.url) return firstObj.url;
  if (strs[0]) return strs[0];

  return '/images/products/placeholder.svg';
}

/**
 * 获取列表图（用于 Catalog / Search / 推荐）
 */
export function getListingImage(images: ImageInput[] | undefined | null): string {
  return getProductImage(images, 'LISTING');
}

/**
 * 获取详情主图（用于 ProductDetail）
 */
export function getPrimaryImage(images: ImageInput[] | undefined | null): string {
  return getProductImage(images, 'PRIMARY');
}

/**
 * 获取缩略图（用于后台管理列表）
 */
export function getThumbnailImage(images: ImageInput[] | undefined | null): string {
  return getProductImage(images, 'THUMBNAIL');
}

/**
 * 获取全部详情图（排除 LISTING/THUMBNAIL，按 sortOrder 排序）
 */
export function getDetailImages(images: ProductImage[] | undefined | null): ProductImage[] {
  if (!images) return [];
  return images
    .filter(img => img.role !== 'LISTING' && img.role !== 'THUMBNAIL')
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * 获取全部缩略图列表（用于详情页缩略图切换条）
 */
export function getThumbnailList(images: ProductImage[] | undefined | null): ProductImage[] {
  if (!images) return [];
  return [...images].sort((a, b) => a.sortOrder - b.sortOrder);
}
