import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

export const DEFAULT_WAX_RATES = {
  RED: new Prisma.Decimal(25),
  PURPLE: new Prisma.Decimal(20),
} as const;

export function resolveWaxRate(
  waxType: 'RED' | 'PURPLE',
  agreement?: { id: number; redWaxRate: Prisma.Decimal; purpleWaxRate: Prisma.Decimal } | null,
) {
  return agreement
    ? {
        rate: agreement[waxType === 'RED' ? 'redWaxRate' : 'purpleWaxRate'],
        source: 'CUSTOMER_AGREEMENT' as const,
        agreementId: agreement.id,
      }
    : {
        rate: DEFAULT_WAX_RATES[waxType],
        source: 'SYSTEM_DEFAULT_D19_V1' as const,
        agreementId: null,
      };
}

export function roundMoney(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function roundWeight(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * v2 报价版本中的行单价已经是最终成交价。本阶段没有独立优惠合同，任何草稿
 * “原价 - 报价”差额都不能再次从版本小计扣减；费用仅在最终行小计之上加一次。
 */
export function computeFinalQuoteAmounts(
  itemSubtotals: readonly Prisma.Decimal.Value[],
  feeAmounts: readonly Prisma.Decimal.Value[],
) {
  const subtotalAmount = roundMoney(
    itemSubtotals.reduce<Prisma.Decimal>(
      (sum, amount) => sum.plus(amount),
      new Prisma.Decimal(0),
    ),
  );
  const discountAmount = new Prisma.Decimal(0);
  const feeAmount = roundMoney(
    feeAmounts.reduce<Prisma.Decimal>(
      (sum, amount) => sum.plus(amount),
      new Prisma.Decimal(0),
    ),
  );
  return {
    subtotalAmount,
    discountAmount,
    feeAmount,
    totalAmount: roundMoney(subtotalAmount.plus(feeAmount)),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function hashBusinessSnapshot(snapshot: Prisma.JsonValue) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(snapshot)))
    .digest('hex');
}

function snapshotField(value: Prisma.JsonValue, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return String((value as Prisma.JsonObject)[field] ?? '');
}

export const snapshotItemSortKey = (value: Prisma.JsonValue) => [
  snapshotField(value, 'productId'),
  snapshotField(value, 'skuId'),
  snapshotField(value, 'waxType'),
  snapshotField(value, 'description'),
  snapshotField(value, 'quantity'),
].join('\u0000');

export const snapshotFeeSortKey = (value: Prisma.JsonValue) => [
  snapshotField(value, 'code'),
  snapshotField(value, 'feeRuleId'),
].join('\u0000');

export const snapshotResourceSortKey = (value: Prisma.JsonValue) =>
  snapshotField(value, 'resourceBucketId').padStart(20, '0');

export function sortSnapshotRows<T extends Prisma.JsonValue>(
  rows: readonly T[],
  keyOf: (row: T) => string = (row) => hashBusinessSnapshot(row),
): T[] {
  return [...rows].sort((left, right) => {
    const byBusinessKey = keyOf(left).localeCompare(keyOf(right));
    return byBusinessKey || hashBusinessSnapshot(left).localeCompare(hashBusinessSnapshot(right));
  });
}

export function requireBusinessSnapshot(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConflictException('报价版本缺少完整交易快照');
  }
  const snapshot = value as Prisma.JsonObject;
  if (snapshot.schemaVersion !== 2) {
    throw new ConflictException('旧版报价只能复制并重新发出后成交');
  }
  return snapshot;
}

export function asSnapshotObject(value: Prisma.JsonValue | undefined, message: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConflictException(message);
  }
  return value as Prisma.JsonObject;
}

export function asSnapshotArray(value: Prisma.JsonValue | undefined, message: string) {
  if (!Array.isArray(value)) throw new ConflictException(message);
  return value;
}
