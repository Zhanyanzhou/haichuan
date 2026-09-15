import { createHash } from "crypto";
import { ContentLocale } from "@prisma/client";
import type { PublicContentLocale } from "../../common/content-locale";

export const PAGE_LOCALE_REVISION_METADATA_KEY = "__pageLocaleRevision";
export const PAGE_LOCALE_DRAFT_METADATA_KEY = "__pageLocaleDraft";

export const PAGE_LOCALE_SELF_REVIEW_ACTION = "PAGE_LOCALE_SELF_REVIEW_APPROVED";

export type PageLocaleSelfReviewMarker = {
  action: typeof PAGE_LOCALE_SELF_REVIEW_ACTION;
  auditLogId: number;
  actor: number;
  actorRole: "SUPER_ADMIN";
  revision: string;
  reviewedAt: string;
};

export type PageLocaleRevisionMarker = {
  schemaVersion: 1;
  locale: PublicContentLocale;
  contentHash: string;
  submittedBy: number | null;
  submittedAt: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  selfReview?: PageLocaleSelfReviewMarker;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function toDatabaseContentLocale(locale: PublicContentLocale): ContentLocale {
  return locale === "en" ? ContentLocale.EN : ContentLocale.ZH_CN;
}

export function stripPageLocaleRevisionMetadata(
  metadata: unknown,
): Record<string, unknown> {
  if (!isRecord(metadata)) return {};
  const next = { ...metadata };
  delete next[PAGE_LOCALE_REVISION_METADATA_KEY];
  delete next[PAGE_LOCALE_DRAFT_METADATA_KEY];
  return next;
}

export function withPageLocaleDraftMetadata(
  metadata: unknown,
  locale: PublicContentLocale,
): Record<string, unknown> {
  return {
    ...stripPageLocaleRevisionMetadata(metadata),
    [PAGE_LOCALE_DRAFT_METADATA_KEY]: { schemaVersion: 1, locale },
  };
}

export function hasPageLocaleDraftMetadata(
  metadata: unknown,
  locale: PublicContentLocale,
): boolean {
  if (!isRecord(metadata)) return false;
  const marker = metadata[PAGE_LOCALE_DRAFT_METADATA_KEY];
  return isRecord(marker) && marker.schemaVersion === 1 && marker.locale === locale;
}

export function createPageLocaleContentHash(
  puckData: unknown,
  metadata: unknown,
): string {
  const payload = canonicalize({
    puckData,
    metadata: stripPageLocaleRevisionMetadata(metadata),
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function withPageLocaleRevisionMetadata(
  metadata: unknown,
  locale: PublicContentLocale,
  contentHash: string,
  review: {
    submittedBy: number | null;
    submittedAt: Date | null;
    reviewedBy: number | null;
    reviewedAt: Date | null;
    selfReview?: PageLocaleSelfReviewMarker;
  },
): Record<string, unknown> {
  return {
    ...stripPageLocaleRevisionMetadata(metadata),
    [PAGE_LOCALE_REVISION_METADATA_KEY]: {
      schemaVersion: 1,
      locale,
      contentHash,
      submittedBy: review.submittedBy,
      submittedAt: review.submittedAt?.toISOString() ?? null,
      reviewedBy: review.reviewedBy,
      reviewedAt: review.reviewedAt?.toISOString() ?? null,
      ...(review.selfReview ? { selfReview: review.selfReview } : {}),
    } satisfies PageLocaleRevisionMarker,
  };
}

export function readPageLocaleRevisionMarker(
  metadata: unknown,
): PageLocaleRevisionMarker | null {
  if (!isRecord(metadata)) return null;
  const marker = metadata[PAGE_LOCALE_REVISION_METADATA_KEY];
  if (!isRecord(marker)) return null;
  if (
    marker.schemaVersion !== 1
    || (marker.locale !== "zh-CN" && marker.locale !== "en")
    || typeof marker.contentHash !== "string"
    || !/^[a-f0-9]{64}$/.test(marker.contentHash)
    || (marker.submittedBy !== null && !Number.isInteger(marker.submittedBy))
    || (marker.reviewedBy !== null && !Number.isInteger(marker.reviewedBy))
    || (marker.submittedAt !== null && typeof marker.submittedAt !== "string")
    || (marker.reviewedAt !== null && typeof marker.reviewedAt !== "string")
    || (
      marker.selfReview !== undefined
      && (
        !isRecord(marker.selfReview)
        || marker.selfReview.action !== PAGE_LOCALE_SELF_REVIEW_ACTION
        || !Number.isInteger(marker.selfReview.auditLogId)
        || !Number.isInteger(marker.selfReview.actor)
        || marker.selfReview.actorRole !== "SUPER_ADMIN"
        || typeof marker.selfReview.revision !== "string"
        || Number.isNaN(Date.parse(marker.selfReview.revision))
        || typeof marker.selfReview.reviewedAt !== "string"
        || Number.isNaN(Date.parse(marker.selfReview.reviewedAt))
      )
    )
  ) {
    return null;
  }
  const parsed = marker as PageLocaleRevisionMarker;
  const isSelfReview = parsed.submittedBy !== null
    && parsed.submittedBy === parsed.reviewedBy;
  if (
    (isSelfReview && !parsed.selfReview)
    || (!isSelfReview && parsed.selfReview !== undefined)
    || (parsed.selfReview && (
      parsed.submittedAt === null
      || parsed.reviewedAt === null
      || parsed.selfReview.actor !== parsed.submittedBy
      || parsed.selfReview.revision !== parsed.submittedAt
      || parsed.selfReview.reviewedAt !== parsed.reviewedAt
    ))
  ) {
    return null;
  }
  return parsed;
}

export function revisionBelongsToLocale(
  metadata: unknown,
  locale: PublicContentLocale,
): boolean {
  const marker = readPageLocaleRevisionMarker(metadata);
  if (
    !marker
    && isRecord(metadata)
    && Object.prototype.hasOwnProperty.call(metadata, PAGE_LOCALE_REVISION_METADATA_KEY)
  ) {
    return false;
  }
  // 旧单语 revision 只允许作为中文历史兼容读取，绝不作为英文回退。
  return marker ? marker.locale === locale : locale === "zh-CN";
}
