import { BadRequestException, ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";

export const IDEMPOTENCY_HEADER = "idempotency-key";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
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

/**
 * 公开写入的幂等键只保存 SHA-256，不把客户端原值写入数据库或日志。
 * 键是可选的，以兼容旧客户端；新客户端每次用户提交意图生成一个 UUID，
 * 网络重试沿用同一个值，用户明确发起下一次提交时再生成新值。
 */
export function prepareLeadIdempotency(
  rawKey: string | undefined,
  fingerprintValue: unknown,
) {
  const key = rawKey?.trim();
  if (!key) {
    return {
      idempotencyKeyHash: null,
      submissionFingerprint: hash(JSON.stringify(stableValue(fingerprintValue))),
    };
  }
  if (
    key.length < 8 ||
    key.length > 128 ||
    !IDEMPOTENCY_KEY_PATTERN.test(key)
  ) {
    throw new BadRequestException("幂等键格式不正确");
  }
  return {
    idempotencyKeyHash: hash(key),
    submissionFingerprint: hash(JSON.stringify(stableValue(fingerprintValue))),
  };
}

export function prepareRequiredLeadIdempotency(
  rawKey: string | undefined,
  fingerprintValue: unknown,
) {
  const prepared = prepareLeadIdempotency(rawKey, fingerprintValue);
  if (!prepared.idempotencyKeyHash) {
    throw new BadRequestException("缺少 Idempotency-Key 请求头");
  }
  return {
    idempotencyKeyHash: prepared.idempotencyKeyHash,
    operationFingerprint: prepared.submissionFingerprint,
  };
}

export function assertMatchingSubmission(
  existing: {
    sourceType: string;
    submissionFingerprint: string | null;
  },
  expectedSourceType: "INQUIRY" | "SELECTION_INQUIRY",
  expectedFingerprint: string,
) {
  if (
    existing.sourceType !== expectedSourceType ||
    existing.submissionFingerprint !== expectedFingerprint
  ) {
    throw new ConflictException("该幂等键已用于另一笔提交，请重新提交");
  }
}

export function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}

export function retentionForStatus(
  status: "PENDING" | "CONTACTED" | "FOLLOWING" | "COMPLETED" | "INVALID",
  now = new Date(),
) {
  if (status === "COMPLETED") {
    const retentionUntil = new Date(now);
    retentionUntil.setUTCMonth(retentionUntil.getUTCMonth() + 12);
    return { closedAt: now, retentionUntil };
  }
  if (status === "INVALID") {
    return {
      closedAt: now,
      retentionUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    };
  }
  return { closedAt: null, retentionUntil: null };
}
