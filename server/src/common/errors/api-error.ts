import { HttpException, HttpStatus } from "@nestjs/common";

export type ApiErrorDetails = Record<string, string | number | boolean | null>;

/**
 * 稳定的业务错误合同。message 面向用户，errorCode 面向调用方分支；
 * details 只能放经过筛选的非敏感字段，禁止传入请求体、令牌或第三方原始响应。
 */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly errorCode: string,
    message: string,
    readonly details?: ApiErrorDetails,
  ) {
    super(message, status);
  }
}
