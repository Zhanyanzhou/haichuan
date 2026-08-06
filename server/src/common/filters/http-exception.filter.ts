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

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = process.env.NODE_ENV === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = '服务器内部错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
    }
    // Prisma 已知异常映射
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // 唯一约束冲突
          status = HttpStatus.CONFLICT;
          message = '数据已存在，请勿重复创建';
          break;
        case 'P2025': // 记录未找到
          status = HttpStatus.NOT_FOUND;
          message = '请求的资源不存在';
          break;
        case 'P2003': // 外键约束
          status = HttpStatus.BAD_REQUEST;
          message = '关联数据不存在，请先创建关联记录';
          break;
        case 'P2014': // 违反关系约束
          status = HttpStatus.BAD_REQUEST;
          message = '数据关系不合法';
          break;
        default:
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = isProduction ? '服务器内部错误' : `数据库错误: ${exception.code}`;
          break;
      }
    }
    // Prisma 校验异常
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = '请求参数格式错误';
    }
    // Prisma 连接异常
    else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = '数据库连接失败，请稍后重试';
    }
    else if (exception instanceof Error) {
      message = isProduction ? '服务器内部错误' : exception.message;
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
      message: Array.isArray(message) ? message[0] : message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
