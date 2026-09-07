import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Observable } from "rxjs";
import { finalize, tap } from "rxjs/operators";
import { requestPathOnly } from "./request-path";
import { OperationalMetricsService } from "./operational-metrics.service";

type MetricRequest = Request & {
  route?: { path?: unknown };
  params?: Record<string, unknown>;
};

function safeMethod(value: unknown): string {
  return typeof value === "string" && /^[A-Z]{3,8}$/.test(value)
    ? value
    : "OTHER";
}

export function resolveMetricRoute(request: MetricRequest): string {
  const routePath = request.route?.path;
  if (typeof routePath !== "string" || !routePath.startsWith("/")) {
    return "unmatched";
  }
  const baseUrl = typeof request.baseUrl === "string" ? request.baseUrl : "";
  const candidate = `${baseUrl}${routePath}`.replace(/\/{2,}/g, "/");
  const sanitized = candidate.replace(/[^A-Za-z0-9_/:.-]/g, "_").slice(0, 160);
  return sanitized || "unmatched";
}

export function resolveGatewayCallback(request: MetricRequest): {
  kind: "payment" | "refund";
  provider: "wechat" | "alipay";
} | undefined {
  const path = requestPathOnly(request.originalUrl ?? request.url);
  const match = /^\/api\/(payments|refunds)\/notify\/(wechat|alipay)$/.exec(path);
  if (!match) return undefined;
  return {
    kind: match[1] === "payments" ? "payment" : "refund",
    provider: match[2] as "wechat" | "alipay",
  };
}

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(private readonly metrics: OperationalMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest<MetricRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = process.hrtime.bigint();
    let failed = false;
    let failureStatusCode = 500;
    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          failed = true;
          failureStatusCode = error instanceof HttpException
            ? error.getStatus()
            : 500;
        },
      }),
      finalize(() => {
        const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
        const statusCode = failed
          ? failureStatusCode
          : response.statusCode || 200;
        this.metrics.recordHttpRequest({
          method: safeMethod(request.method),
          route: resolveMetricRoute(request),
          statusCode,
          durationSeconds,
        });
        const callback = resolveGatewayCallback(request);
        if (callback) {
          this.metrics.recordGatewayCallback({
            ...callback,
            statusClass: statusCode >= 500
              ? "5xx"
              : statusCode >= 400
                ? "4xx"
                : "2xx",
            durationSeconds,
          });
        }
      }),
    );
  }
}

