import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

type AuditRequest = {
  method?: string;
  originalUrl?: string;
  path?: string;
  params?: Record<string, string>;
  body?: unknown;
  ip?: string;
  user?: { id?: number };
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEY = /(password|token|secret|authorization|cookie|file|buffer)/i;

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<AuditRequest>();
    if (!request.user?.id || !MUTATING_METHODS.has(request.method || '')) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        void this.writeLog(request);
      }),
    );
  }

  private async writeLog(request: AuditRequest): Promise<void> {
    const pathname = (request.path || request.originalUrl || '').split('?')[0];
    const segments = pathname.split('/').filter(Boolean);
    const module = (segments[0] === 'api' ? segments[1] : segments[0]) || 'system';
    const idCandidate = request.params?.id;
    const targetId = idCandidate && /^\d+$/.test(idCandidate) ? Number(idCandidate) : undefined;
    const detail = JSON.stringify({
      method: request.method,
      path: pathname,
      payload: this.sanitize(request.body),
    }).slice(0, 4000);

    try {
      await this.prisma.operationLog.create({
        data: {
          userId: request.user!.id!,
          action: this.actionFor(request.method || ''),
          module: module.slice(0, 50),
          targetId,
          detail,
          ip: request.ip?.slice(0, 50),
        },
      });
    } catch (error) {
      // 审计失败不能反向破坏已成功提交的业务事务，但必须留下服务端告警。
      this.logger.error(`审计日志写入失败: ${pathname}`, error instanceof Error ? error.stack : undefined);
    }
  }

  private actionFor(method: string): string {
    return ({ POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' } as Record<string, string>)[method] || method.toLowerCase();
  }

  private sanitize(value: unknown): unknown {
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => this.sanitize(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : this.sanitize(item),
      ]),
    );
  }
}
