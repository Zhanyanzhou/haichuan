import { createHash } from 'node:crypto';
import { reviewImages } from './review-media-reference';

export const REVIEW_SUBMISSION_FINGERPRINT_PREFIX = 'review-submission:v1:';

type ReviewSubmissionFingerprintInput = {
  orderId: number;
  productId: number;
  rating: number;
  content: string;
  images?: unknown;
};

/**
 * 只暴露完整评价意图的不可逆摘要，供响应丢失后的本人权威回读核对。
 * 原始私有图片引用不得为此重新返回给浏览器。
 */
export function reviewSubmissionFingerprint(input: ReviewSubmissionFingerprintInput): string {
  const canonical = JSON.stringify([
    input.orderId,
    input.productId,
    input.rating,
    input.content.trim(),
    reviewImages(input.images).filter((value) => value.length > 0),
  ]);
  return `${REVIEW_SUBMISSION_FINGERPRINT_PREFIX}${createHash('sha256').update(canonical).digest('hex')}`;
}
