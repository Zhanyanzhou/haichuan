import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // 二进制响应（受控媒体端点直接返回 Buffer）：跳过 JSON 包装，保持字节流原样返回
        if (Buffer.isBuffer(data)) return data as any;
        // handler 已用 @Res() 手动结束响应（如受控媒体文件流）：跳过包装，避免 write-after-end
        const response = context.switchToHttp().getResponse();
        if (response?.writableEnded) return data;
        return {
          code: 200,
          data,
          message: 'success',
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
