import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ApiError } from "../errors/api-error";
import { resolveCorsOrigins } from "../config/cors-origins";
import {
  csrfCookieValue,
  extractBearerToken,
  hasSessionCookie,
  safeTokenEqual,
  type SessionDomain,
} from "./session-security";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class SessionSecurityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      headers?: Record<string, unknown>;
    }>();
    if (SAFE_METHODS.has((request.method || "GET").toUpperCase())) return true;
    if (extractBearerToken(request.headers?.authorization)) return true;

    const domain = this.cookieDomain(request.headers?.cookie);
    if (!domain) return true;

    const allowedOrigins = resolveCorsOrigins(
      process.env.NODE_ENV,
      process.env.CORS_ORIGIN,
    );
    const origin = request.headers?.origin;
    if (typeof origin !== "string" || !allowedOrigins.includes(origin)) {
      throw new ApiError(403, "SESSION_ORIGIN_REJECTED", "请求来源不受信任");
    }

    const headerToken = request.headers?.["x-csrf-token"];
    const cookieToken = csrfCookieValue(request.headers?.cookie, domain);
    if (
      typeof headerToken !== "string" ||
      !cookieToken ||
      !safeTokenEqual(headerToken, cookieToken)
    ) {
      throw new ApiError(403, "CSRF_TOKEN_INVALID", "CSRF 校验失败");
    }
    return true;
  }

  private cookieDomain(cookieHeader: unknown): SessionDomain | null {
    if (hasSessionCookie(cookieHeader, "admin")) return "admin";
    if (hasSessionCookie(cookieHeader, "customer")) return "customer";
    return null;
  }
}
