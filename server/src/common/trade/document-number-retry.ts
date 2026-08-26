import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const DEFAULT_MAX_ATTEMPTS = 16;

function targetText(error: Prisma.PrismaClientKnownRequestError): string {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.join(',').toLowerCase();
  return String(target ?? '').toLowerCase();
}

function isRetryableDocumentNumberConflict(
  error: unknown,
  targetMarkers: readonly string[],
): error is Prisma.PrismaClientKnownRequestError {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2002') return false;
  const target = targetText(error);
  return targetMarkers.some((marker) => target.includes(marker.toLowerCase()));
}

/**
 * 每次尝试必须是调用方提供的一整笔数据库事务。只有明确命中目标编号唯一约束的
 * P2002，或 Prisma 定义的可重试事务冲突 P2034，才会在完整回滚后重试。
 */
export async function runWithDocumentNumberRetry<T>(options: {
  targetMarkers: readonly string[];
  documentLabel: string;
  runTransaction: () => Promise<T>;
  maxAttempts?: number;
}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await options.runTransaction();
    } catch (error) {
      if (!isRetryableDocumentNumberConflict(error, options.targetMarkers)) throw error;
      if (attempt === maxAttempts - 1) {
        throw new ConflictException(`${options.documentLabel}编号并发冲突，请刷新后重试`);
      }
    }
  }

  throw new ConflictException(`${options.documentLabel}编号并发冲突，请刷新后重试`);
}
