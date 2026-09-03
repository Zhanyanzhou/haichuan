import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { SKIP_GENERIC_AUDIT_KEY } from '../decorators/skip-generic-audit.decorator';
import { PrismaService } from '../prisma/prisma.service';

type AuditRequest = {
  method?: string;
  originalUrl?: string;
  path?: string;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  ip?: string;
  user?: { id?: number };
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SAFE_PAGE_KEY = /^[a-z][a-z0-9-]{0,49}$/;

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const skipsGenericAudit = this.reflector.getAllAndOverride<boolean>(
      SKIP_GENERIC_AUDIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipsGenericAudit) return next.handle();
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
    const pageDocumentTarget = module === 'page-modules' && pathname.includes('/document')
      ? this.pageDocumentTarget(request)
      : undefined;
    const detail = JSON.stringify({
      schemaVersion: 1,
      method: request.method,
      path: pathname,
      ...(pageDocumentTarget ? { target: pageDocumentTarget } : {}),
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

  private pageDocumentTarget(request: AuditRequest): { pageKey: string; version?: number } | undefined {
    const candidate = request.query?.pageKey ?? request.body?.pageKey;
    if (typeof candidate !== 'string' || !SAFE_PAGE_KEY.test(candidate)) return undefined;
    const rawVersion = request.params?.version;
    const version = rawVersion && /^\d+$/.test(rawVersion) ? Number(rawVersion) : undefined;
    return { pageKey: candidate, ...(version ? { version } : {}) };
  }

  private actionFor(method: string): string {
    return ({ POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' } as Record<string, string>)[method] || method.toLowerCase();
  }
}
