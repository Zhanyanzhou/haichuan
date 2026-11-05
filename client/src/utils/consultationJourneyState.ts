import { createIdempotencyKey } from "@/utils/idempotency";
import type { CatalogProduct } from "@/data/catalogData";
import type { ConsultationSubmissionReceipt } from "@/services/clients/consultationSubmissionReceipt";

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
const inFlightSubmissions = new Map<string, Promise<ConsultationSubmissionReceipt>>();
const contactSubmissionContexts = new Map<ConsultationDraftOwner, {
  active: string;
  parked: Map<string, ConsultationSubmissionAttempt>;
}>();

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

const contactDrafts = new Map<string, TimedDraft<ContactConsultationDraft>>();
let selectionDraft: TimedDraft<SelectionConsultationDraft> | null = null;
type SelectionReceipt = {
  receipt: ConsultationSubmissionReceipt;
  products: CatalogProduct[];
};
let selectionReceipt: TimedDraft<SelectionReceipt> | null = null;
const selectionReceiptListeners = new Set<() => void>();

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
  context = "",
) {
  for (const [key, draft] of contactDrafts) {
    if (draft.expiresAt <= Date.now()) contactDrafts.delete(key);
  }
  contactDrafts.set(context, saveDraft(owner, value));
}

export function readContactConsultationDraft(
  owner: ConsultationDraftOwner,
  context = "",
): ContactConsultationDraft | null {
  const value = readDraft(contactDrafts.get(context) ?? null, owner);
  if (!value) contactDrafts.delete(context);
  return value;
}

export function clearContactConsultationDraft(context?: string) {
  if (context === undefined) contactDrafts.clear();
  else contactDrafts.delete(context);
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
  clearSelectionConsultationReceipt();
}

export function subscribeSelectionConsultationReceipt(listener: () => void) {
  selectionReceiptListeners.add(listener);
  return () => { selectionReceiptListeners.delete(listener); };
}

export function readSelectionConsultationReceipt(owner: ConsultationDraftOwner) {
  return readDraft(selectionReceipt, owner);
}

export function saveSelectionConsultationReceipt(owner: ConsultationDraftOwner, value: SelectionReceipt) {
  selectionReceipt = saveDraft(owner, value);
  selectionReceiptListeners.forEach((listener) => listener());
}

export function clearSelectionConsultationReceipt() {
  if (!selectionReceipt) return;
  selectionReceipt = null;
  selectionReceiptListeners.forEach((listener) => listener());
}

/** 站内返回或换入口时，同一个仍在途的提交共享请求和回执。 */
export function runConsultationSubmission(
  attempt: ConsultationSubmissionAttempt,
  submit: (key: string) => Promise<ConsultationSubmissionReceipt>,
) {
  const existing = inFlightSubmissions.get(attempt.key);
  if (existing) return existing;
  const pending = submit(attempt.key).finally(() => {
    inFlightSubmissions.delete(attempt.key);
  });
  inFlightSubmissions.set(attempt.key, pending);
  return pending;
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

/** 默认联系页仅探测本人的恢复入口，不消费草稿，也不删除其他身份或失效记录。 */
export function hasContactConsultationRecovery(owner: ConsultationDraftOwner, context = ""): boolean {
  if (readDraft(contactDrafts.get(context) ?? null, owner)) return true;
  const state = contactSubmissionContexts.get(owner);
  if (state && state.active !== context) return state.parked.has(context);
  const key = submissionAttemptStorageKey("contact", owner);
  if (isSubmissionAttempt(volatileSubmissionAttempts.get(key))) return true;
  try {
    return isSubmissionAttempt(JSON.parse(globalThis.sessionStorage?.getItem(key) || "null"));
  } catch {
    return false;
  }
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
  if (!attempt) return null;
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

function storeConsultationSubmissionAttempt(storageKey: string, attempt: ConsultationSubmissionAttempt) {
  volatileSubmissionAttempts.set(storageKey, attempt);
  try {
    globalThis.sessionStorage?.setItem(storageKey, JSON.stringify(attempt));
  } catch {
    // 页面内存已先保存；本页重试继续安全复用同一键。
  }
}

/** 同标签页换咨询作品时保留原尝试；作品引用只保存在内存中。 */
export function activateContactSubmissionContext(owner: ConsultationDraftOwner, context: string) {
  let state = contactSubmissionContexts.get(owner);
  if (!state) {
    state = { active: context, parked: new Map() };
    contactSubmissionContexts.set(owner, state);
  }
  const current = readConsultationSubmissionAttempt("contact", owner);
  if (state.active === context) return current;

  if (current) state.parked.set(state.active, current);
  const restored = state.parked.get(context) ?? null;
  state.parked.delete(context);
  state.active = context;
  if (restored) {
    storeConsultationSubmissionAttempt(submissionAttemptStorageKey("contact", owner), restored);
  } else {
    clearConsultationSubmissionAttempt("contact", owner);
  }
  return restored;
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
  storeConsultationSubmissionAttempt(storageKey, attempt);
  return { status: "ready", attempt, recovered: false };
}
