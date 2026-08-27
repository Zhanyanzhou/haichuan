import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError, type ApiErrorDetails } from '../errors/api-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as Request & { id?: unknown }).id;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = '服务器内部错误';
    let errorCode = 'INTERNAL_ERROR';
    let details: ApiErrorDetails | undefined;

    if (exception instanceof ApiError) {
      status = exception.getStatus();
      message = exception.message;
      errorCode = exception.errorCode;
      details = exception.details;
    }
    else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'message' in exceptionResponse
      ) {
        const responseMessage = exceptionResponse.message;
        message =
          typeof responseMessage === 'string' ||
          (Array.isArray(responseMessage) && responseMessage.every((item) => typeof item === 'string'))
            ? responseMessage
            : exception.message;
      } else {
        message = exception.message;
      }
      errorCode = status === HttpStatus.BAD_REQUEST
        ? 'VALIDATION_ERROR'
        : `HTTP_${status}`;
    }
    // Prisma 已知异常映射
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // 唯一约束冲突
          status = HttpStatus.CONFLICT;
          message = '数据已存在，请勿重复创建';
          errorCode = 'DATABASE_CONFLICT';
          break;
        case 'P2025': // 记录未找到
          status = HttpStatus.NOT_FOUND;
          message = '请求的资源不存在';
          errorCode = 'RESOURCE_NOT_FOUND';
          break;
        case 'P2003': // 外键约束
          status = HttpStatus.BAD_REQUEST;
          message = '关联数据不存在，请先创建关联记录';
          errorCode = 'RELATION_NOT_FOUND';
          break;
        case 'P2014': // 违反关系约束
          status = HttpStatus.BAD_REQUEST;
          message = '数据关系不合法';
          errorCode = 'RELATION_CONFLICT';
          break;
        default:
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = '服务器内部错误';
          errorCode = 'DATABASE_ERROR';
          break;
      }
    }
    // Prisma 校验异常 — 透传真实消息便于调试
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = '请求参数格式错误';
      errorCode = 'VALIDATION_ERROR';
      this.logger.error('Prisma 校验异常', exception.stack);
    }
    // Prisma 连接异常
    else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = '数据库连接失败，请稍后重试';
      errorCode = 'DATABASE_UNAVAILABLE';
    }
    // ServeStaticModule 使用的 Express NotFoundError 不是 Nest HttpException，
    // 但会携带 status/statusCode。保留 4xx，避免缺失静态文件被误记为 500。
    else if (exception instanceof Error) {
      const candidate = exception as Error & { status?: unknown; statusCode?: unknown };
      const externalStatus = candidate.status ?? candidate.statusCode;
      if (typeof externalStatus === 'number' && externalStatus >= 400 && externalStatus < 500) {
        status = externalStatus;
        message = status === HttpStatus.NOT_FOUND ? '请求的资源不存在' : '请求不合法';
        errorCode = status === HttpStatus.NOT_FOUND ? 'RESOURCE_NOT_FOUND' : `HTTP_${status}`;
      } else {
        message = '服务器内部错误';
        errorCode = 'INTERNAL_ERROR';
      }
    }

    // 服务端错误记录日志
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : '',
      );
    }

    response.status(status).json({
      code: status,
      data: null,
      // class-validator 的 message 是数组（每个违规字段一条），合并展示
      message: Array.isArray(message) ? message.join("；") : message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(typeof requestId === 'string' ? { requestId } : {}),
      errorCode,
      ...(details ? { details } : {}),
    });
  }
}
