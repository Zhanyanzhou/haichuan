// 微信扫码登录控制器：二维码配置 + 授权回调（HTML postMessage 回传）+ 手机号绑定。
import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../common/decorators/public.decorator";
import {
  WechatAuthService,
  type WechatCallbackOutcome,
  type WechatCallbackResult,
} from "./wechat-auth.service";
import { BindWechatDto } from "./dto/bind-wechat.dto";
import { RefreshSessionService } from "../../common/security/refresh-session.service";
import {
  buildClearWechatOAuthBindingCookie,
  buildSessionCookieHeaders,
  buildWechatOAuthBindingCookie,
  extractWechatOAuthBindingCookie,
  requestSessionMetadata,
} from "../../common/security/session-security";
import { CustomerAuthGuard } from "../customers/customer-auth.guard";
import type { CustomerRequest } from "../../common/security/authenticated-principal";

@Controller("customers/wechat")
export class WechatAuthController {
  constructor(
    private readonly wechatAuth: WechatAuthService,
    private readonly refreshSessions: RefreshSessionService,
  ) {}

  /** 前端据此决定是否渲染扫码入口，并获取二维码地址 */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get("config")
  config(
    @Query("origin") origin: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    response.setHeader("Referrer-Policy", "no-referrer");
    if (!this.wechatAuth.isConfigured()) return { enabled: false };
    const prepared = this.wechatAuth.buildQrConnectUrl(
      origin,
      extractWechatOAuthBindingCookie(request.headers?.cookie),
    );
    response.setHeader(
      "Set-Cookie",
      buildWechatOAuthBindingCookie(prepared.browserBindingToken),
    );
    return {
      enabled: true,
      qrConnectUrl: prepared.url,
      callbackOrigin: prepared.callbackOrigin,
    };
  }

  /** 微信授权回调：返回 HTML 页面，通过 postMessage 把结果回传给内嵌 iframe 的父页面 */
  @Public()
  @Get("callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() request: Request,
    @Res() res: Response,
  ) {
    res.setHeader("Cache-Control", "no-store, private, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    const browserBindingToken = extractWechatOAuthBindingCookie(
      request.headers?.cookie,
    );
    let outcome: WechatCallbackOutcome = await this.wechatAuth.handleCallback(
      code,
      state,
      browserBindingToken,
    );
    const cookies: string[] = [];
    if (outcome.session) {
      try {
        const refresh = await this.refreshSessions.issueCustomer(
          outcome.session.customerId,
          requestSessionMetadata(request),
          outcome.session.authVersion,
        );
        cookies.push(
          ...buildSessionCookieHeaders(
            "customer",
            outcome.session.accessToken,
            refresh.refreshToken,
          ).headers,
        );
      } catch {
        outcome = {
          result: { kind: "error", message: "客户会话未建立，请重新扫码" },
          parentOrigin: outcome.parentOrigin,
        };
      }
    }
    if (cookies.length) res.setHeader("Set-Cookie", cookies);

    const scriptNonce = randomBytes(18).toString("base64url");
    const frameAncestor = outcome.parentOrigin ?? "'none'";
    res.removeHeader?.("X-Frame-Options");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${frameAncestor}; script-src 'nonce-${scriptNonce}'; style-src 'unsafe-inline'`,
    );
    res
      .type("html")
      .send(
        renderCallbackPage(
          outcome.result,
          outcome.parentOrigin,
          scriptNonce,
        ),
      );
  }

  /** 扫码后绑定手机号：既有账户校验密码绑定，新手机号直接建号 */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("bind")
  async bind(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: BindWechatDto,
  ) {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    const { sessionAuthVersion, ...result } = await this.wechatAuth.bindWechat(
      body,
      extractWechatOAuthBindingCookie(request.headers?.cookie),
    );
    if (request.headers?.["x-session-mode"] === "cookie") {
      const session = await this.refreshSessions.issueCustomer(
        result.customer.id,
        requestSessionMetadata(request),
        sessionAuthVersion,
      );
      response.setHeader(
        "Set-Cookie",
        [
          ...buildSessionCookieHeaders(
            "customer",
            result.accessToken,
            session.refreshToken,
          ).headers,
        ],
      );
      return { customer: result.customer };
    }
    return result;
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Delete("binding")
  async unbind(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader(
      "Set-Cookie",
      buildClearWechatOAuthBindingCookie(),
    );
    return this.wechatAuth.unbindWechat(request.customer.id);
  }
}

/** 回调落地页：序列化结果并按 state 中记录的父页 origin 精确回传（不再使用通配 origin） */
function renderCallbackPage(
  result: WechatCallbackResult,
  parentOrigin: string | null,
  scriptNonce: string,
): string {
  const payload = JSON.stringify(result)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const allowedOrigin = JSON.stringify(parentOrigin ?? "");
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"></head>
<body style="font-family:sans-serif;text-align:center;padding:48px 24px;color:#68645E;">
  <p id="hint">登录处理中，请返回原页面…</p>
  <script nonce="${scriptNonce}">
    (function () {
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch (e) {}
      var payload = ${payload};
      var allowedOrigin = ${allowedOrigin};
      try {
        var target = window.parent !== window ? window.parent : null;
        if (target && allowedOrigin) {
          target.postMessage({ type: "wechat-login-result", version: 1, payload: payload }, allowedOrigin);
        } else {
          document.getElementById("hint").textContent = "登录失败：无法确认来源页面，请返回原页面重新扫码。";
        }
      } catch (e) {
        document.getElementById("hint").textContent = "登录失败：无法安全回传结果，请返回原页面重新扫码。";
      }
    })();
  </script>
</body>
</html>`;
}
