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
      url?: string;
      headers?: Record<string, unknown>;
    }>();
    if (SAFE_METHODS.has((request.method || "GET").toUpperCase())) return true;
    if (extractBearerToken(request.headers?.authorization)) return true;

    const domain = this.cookieDomain(request.headers?.cookie);
    const requestsCookieSession =
      request.headers?.["x-session-mode"] === "cookie";
    if (!domain && !requestsCookieSession) return true;

    const allowedOrigins = resolveCorsOrigins(
      process.env.NODE_ENV,
      process.env.CORS_ORIGIN,
    );
    const origin = request.headers?.origin;
    if (typeof origin !== "string" || !allowedOrigins.includes(origin)) {
      throw new ApiError(403, "SESSION_ORIGIN_REJECTED", "请求来源不受信任");
    }

    // 首次登录/注册尚无会话 Cookie；精确 Origin 已阻止跨站登录 CSRF。
    if (!domain) return true;

    // 旧版浏览器可能仍带有长期 access Cookie，却没有新版共享 CSRF Cookie。
    // 登录/注册/绑定/退出只在调用方显式声明 Cookie 模式且 Origin 精确匹配时允许迁移，
    // 避免用户被旧 Cookie 永久卡在无法重新登录的状态；普通业务写接口和 refresh 仍须双提交。
    if (requestsCookieSession && this.isOriginOnlySessionEndpoint(request.url)) {
      return true;
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

  private isOriginOnlySessionEndpoint(url: string | undefined): boolean {
    const path = (url || "").split("?", 1)[0];
    return [
      "/api/auth/login",
      "/api/auth/session/logout",
      "/api/customers/login",
      "/api/customers/register",
      "/api/customers/session/logout",
      "/api/customers/wechat/bind",
    ].includes(path);
  }

  private cookieDomain(cookieHeader: unknown): SessionDomain | null {
    if (hasSessionCookie(cookieHeader, "admin")) return "admin";
    if (hasSessionCookie(cookieHeader, "customer")) return "customer";
    return null;
  }
}
