const REVIEW_IMAGE_PATTERN = /^review-image:v1:(\d+):([a-f0-9]{64})$/;

export const REVIEW_IMAGE_REFERENCE_PREFIX = 'review-image:v1:';

export function reviewImages(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function parseReviewImageReference(
  reference: string,
  expectedCustomerId?: number,
): { customerId: number; hash: string } | null {
  const match = REVIEW_IMAGE_PATTERN.exec(reference);
  if (!match) return null;
  const customerId = Number(match[1]);
  if (
    !Number.isSafeInteger(customerId)
    || customerId <= 0
    || (expectedCustomerId !== undefined && customerId !== expectedCustomerId)
  ) {
    return null;
  }
  return { customerId, hash: match[2] };
}

export function isSafeLegacyReviewImageUrl(value: string): boolean {
  return /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._\/-]{0,498}$/.test(value) && !value.includes('..');
}

/**
 * 个人数据导出只返回本人可读的受控地址，不泄漏私有存储凭据或其他客户引用。
 * 数组下标保留原始图片顺序，供受控读取端点再次按数据库事实核验。
 */
export function projectCustomerReviewImages(
  reviewId: number,
  customerId: number,
  images: unknown,
): string[] {
  return reviewImages(images).flatMap((reference, index) => {
    if (parseReviewImageReference(reference, customerId)) {
      return [`/reviews/me/${reviewId}/media/${index}`];
    }
    return isSafeLegacyReviewImageUrl(reference) ? [reference] : [];
  });
}
