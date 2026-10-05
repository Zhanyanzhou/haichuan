import { createIdempotencyKey } from "@/utils/idempotency";

const DRAFT_TTL_MS = 30 * 60 * 1000;
const SUBMISSION_ATTEMPT_PREFIX = "hc:consultation-submission-attempt";

type TimedDraft<T> = {
  expiresAt: number;
  owner: ConsultationDraftOwner;
  value: T;
};

export type ConsultationDraftOwner = `customer:${number}` | "guest";
export type ConsultationSubmissionChannel = "contact" | "selection";

export type ConsultationSubmissionAttempt = {
  version: 1;
  fingerprint: string;
  key: string;
};

export type ConsultationSubmissionReservation =
  | { status: "ready"; attempt: ConsultationSubmissionAttempt; recovered: boolean }
  | { status: "conflict"; attempt: ConsultationSubmissionAttempt };

const volatileSubmissionAttempts = new Map<string, ConsultationSubmissionAttempt>();

export function consultationDraftOwner(
  customerId: number | null | undefined,
): ConsultationDraftOwner {
  return typeof customerId === "number" && Number.isInteger(customerId) && customerId > 0
    ? `customer:${customerId}`
    : "guest";
}

export type ContactConsultationDraft = {
  name: string;
  phone: string;
  email: string;
  consultationType: string;
  preferredContact: string;
  preferredTime: string;
  budgetRange: string;
  message: string;
};

export type SelectionConsultationDraft = {
  customerName: string;
  phone: string;
  email: string;
  wechat: string;
  message: string;
};

let contactDraft: TimedDraft<ContactConsultationDraft> | null = null;
let selectionDraft: TimedDraft<SelectionConsultationDraft> | null = null;

function saveDraft<T>(owner: ConsultationDraftOwner, value: T): TimedDraft<T> {
  return { owner, value, expiresAt: Date.now() + DRAFT_TTL_MS };
}

function readDraft<T>(
  draft: TimedDraft<T> | null,
  owner: ConsultationDraftOwner,
): T | null {
  if (!draft || draft.expiresAt <= Date.now() || draft.owner !== owner) return null;
  return draft.value;
}

/** 仅保存在当前 SPA 内存中；刷新、关闭标签页或超时后自动失效。 */
export function saveContactConsultationDraft(
  owner: ConsultationDraftOwner,
  value: ContactConsultationDraft,
) {
  contactDraft = saveDraft(owner, value);
}

export function readContactConsultationDraft(
  owner: ConsultationDraftOwner,
): ContactConsultationDraft | null {
  const value = readDraft(contactDraft, owner);
  if (!value) contactDraft = null;
  return value;
}

export function clearContactConsultationDraft() {
  contactDraft = null;
}

/** 仅保存在当前 SPA 内存中，不写 localStorage / sessionStorage。 */
export function saveSelectionConsultationDraft(
  owner: ConsultationDraftOwner,
  value: SelectionConsultationDraft,
) {
  selectionDraft = saveDraft(owner, value);
}

export function readSelectionConsultationDraft(
  owner: ConsultationDraftOwner,
): SelectionConsultationDraft | null {
  const value = readDraft(selectionDraft, owner);
  if (!value) selectionDraft = null;
  return value;
}

export function clearSelectionConsultationDraft() {
  selectionDraft = null;
}

export function clearConsultationDrafts() {
  clearContactConsultationDraft();
  clearSelectionConsultationDraft();
}

function submissionAttemptStorageKey(
  channel: ConsultationSubmissionChannel,
  owner: ConsultationDraftOwner,
) {
  return `${SUBMISSION_ATTEMPT_PREFIX}:${channel}:${owner}`;
}

function isSubmissionAttempt(value: unknown): value is ConsultationSubmissionAttempt {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Partial<ConsultationSubmissionAttempt>;
  return attempt.version === 1
    && typeof attempt.fingerprint === "string"
    && /^[a-f0-9]{64}$/.test(attempt.fingerprint)
    && typeof attempt.key === "string"
    && attempt.key.length >= 8
    && attempt.key.length <= 128
    && /^[A-Za-z0-9._:-]+$/.test(attempt.key);
}

/**
 * 只持久化不可逆请求摘要与随机幂等键，不保存姓名、电话、邮箱、留言或作品详情。
 * sessionStorage 不可用时退化为页内恢复；当前页面的人工重试仍复用同一键。
 */
export function readConsultationSubmissionAttempt(
  channel: ConsultationSubmissionChannel,
  owner: ConsultationDraftOwner,
): ConsultationSubmissionAttempt | null {
  const storageKey = submissionAttemptStorageKey(channel, owner);
  let stored: unknown = null;
  try {
    stored = JSON.parse(globalThis.sessionStorage?.getItem(storageKey) || "null");
  } catch {
    stored = null;
  }
  const attempt = isSubmissionAttempt(stored)
    ? stored
    : volatileSubmissionAttempts.get(storageKey) ?? null;
  if (!attempt) {
    clearConsultationSubmissionAttempt(channel, owner);
    return null;
  }
  volatileSubmissionAttempts.set(storageKey, attempt);
  return attempt;
}

export function clearConsultationSubmissionAttempt(
  channel: ConsultationSubmissionChannel,
  owner: ConsultationDraftOwner,
) {
  const storageKey = submissionAttemptStorageKey(channel, owner);
  volatileSubmissionAttempts.delete(storageKey);
  try {
    globalThis.sessionStorage?.removeItem(storageKey);
  } catch {
    // sessionStorage 被浏览器策略禁用时，页内副本仍已清除。
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export async function createConsultationSubmissionFingerprint(value: unknown) {
  const encoded = new TextEncoder().encode(JSON.stringify(stableValue(value)));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function reserveConsultationSubmissionAttempt(
  channel: ConsultationSubmissionChannel,
  owner: ConsultationDraftOwner,
  fingerprint: string,
): ConsultationSubmissionReservation {
  const existing = readConsultationSubmissionAttempt(channel, owner);
  if (existing) {
    return existing.fingerprint === fingerprint
      ? { status: "ready", attempt: existing, recovered: true }
      : { status: "conflict", attempt: existing };
  }

  const storageKey = submissionAttemptStorageKey(channel, owner);
  const attempt: ConsultationSubmissionAttempt = {
    version: 1,
    fingerprint,
    key: createIdempotencyKey(),
  };
  volatileSubmissionAttempts.set(storageKey, attempt);
  try {
    globalThis.sessionStorage?.setItem(storageKey, JSON.stringify(attempt));
  } catch {
    // 页面内存已先保存；本页重试继续安全复用同一键。
  }
  return { status: "ready", attempt, recovered: false };
}
