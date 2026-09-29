export const REVIEW_SUBMISSION_FINGERPRINT_PREFIX = "review-submission:v1:";

type ReviewSubmissionFingerprintInput = {
  orderId: number;
  productId: number;
  rating: number;
  content: string;
  imageUrls?: string[];
};

export async function reviewSubmissionFingerprint(
  input: ReviewSubmissionFingerprintInput,
): Promise<string> {
  const canonical = JSON.stringify([
    input.orderId,
    input.productId,
    input.rating,
    input.content.trim(),
    (input.imageUrls ?? []).filter((value) => typeof value === "string" && value.length > 0),
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  const hash = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${REVIEW_SUBMISSION_FINGERPRINT_PREFIX}${hash}`;
}
