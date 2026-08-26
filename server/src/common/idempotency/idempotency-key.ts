import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import { createHash } from "node:crypto";

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function parseIdempotencyKey(
  value: unknown,
  required = true,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new HttpException("缺少 Idempotency-Key 请求头", 428);
    }
    return undefined;
  }
  if (Array.isArray(value) || typeof value !== "string") {
    throw new BadRequestException("Idempotency-Key 格式无效");
  }
  const key = value.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new BadRequestException(
      "Idempotency-Key 必须为 8-128 位字母、数字、点、下划线、冒号或连字符",
    );
  }
  return key;
}

export const IdempotencyKey = createParamDecorator(
  (required: boolean | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, unknown>;
    }>();
    return parseIdempotencyKey(
      request.headers?.[IDEMPOTENCY_KEY_HEADER],
      required !== false,
    );
  },
);

@Injectable()
export class IdempotencyService {
  /** 域作用哈希可安全持久化，避免把调用方原始键直接扩散到业务表和日志。 */
  scopedHash(scope: string, key: string): string {
    const normalizedScope = scope.trim();
    if (!/^[A-Za-z0-9._:-]{1,80}$/.test(normalizedScope)) {
      throw new BadRequestException("幂等作用域格式无效");
    }
    const normalizedKey = parseIdempotencyKey(key, true)!;
    return createHash("sha256")
      .update(normalizedScope)
      .update("\0")
      .update(normalizedKey)
      .digest("hex");
  }
}
