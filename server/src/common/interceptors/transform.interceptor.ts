import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Response } from 'express';

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
  timestamp: string;
  requestId?: string;
}

// 与 @nestjs/common 的 SSE_METADATA 一致（@Sse 装饰器在 handler 上标记 '__sse__'）。
const SSE_METADATA = '__sse__';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    // SSE 流式端点不能被 JSON 包装：@Sse handler 返回的每个 MessageEvent 会被
    // SseStream 直接序列化，若包成 { code, data, ... } 会让 data 再嵌套一层，
    // 客户端解析不到 type/pageKey（ready/heartbeat 过滤失效、pageKey 过滤失效）。
    const isSse = this.reflector.get<boolean>(
      SSE_METADATA,
      context.getHandler(),
    );
    if (isSse) {
      return next.handle() as unknown as Observable<ApiResponse<T>>;
    }

    return next.handle().pipe(
      map((data) => {
        // 二进制响应（受控媒体端点直接返回 Buffer）：跳过 JSON 包装，保持字节流原样返回
        if (Buffer.isBuffer(data)) return data;
        // handler 已用 @Res() 手动结束响应（如受控媒体文件流）：跳过包装，避免 write-after-end
        const http = context.switchToHttp();
        const response = http.getResponse<Response>();
        if (response?.writableEnded) return data;
        const request = http.getRequest<{ id?: unknown }>();
        const requestId =
          typeof request?.id === "string" ? request.id : undefined;
        return {
          code: 200,
          data,
          message: 'success',
          timestamp: new Date().toISOString(),
          ...(requestId ? { requestId } : {}),
        };
      }),
    ) as Observable<ApiResponse<T>>;
  }
}
