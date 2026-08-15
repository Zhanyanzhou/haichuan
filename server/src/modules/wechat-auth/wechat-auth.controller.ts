// 微信扫码登录控制器：二维码配置 + 授权回调（HTML postMessage 回传）+ 手机号绑定。
import { Body, Controller, Get, Post, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../common/decorators/public.decorator";
import {
  WechatAuthService,
  type WechatCallbackResult,
} from "./wechat-auth.service";

@Controller("customers/wechat")
export class WechatAuthController {
  constructor(private readonly wechatAuth: WechatAuthService) {}

  /** 前端据此决定是否渲染扫码入口，并获取二维码地址 */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get("config")
  config() {
    if (!this.wechatAuth.isConfigured()) return { enabled: false };
    return {
      enabled: true,
      qrConnectUrl: this.wechatAuth.buildQrConnectUrl().url,
    };
  }

  /** 微信授权回调：返回 HTML 页面，通过 postMessage 把结果回传给内嵌 iframe 的父页面 */
  @Public()
  @Get("callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: any,
  ) {
    const result: WechatCallbackResult = code
      ? await this.wechatAuth.handleCallback(code, state)
      : { kind: "error", message: "缺少授权码" };
    res.type("html").send(renderCallbackPage(result));
  }

  /** 扫码后绑定手机号：既有账户校验密码绑定，新手机号直接建号 */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("bind")
  bind(
    @Body()
    body: { bindToken: string; phone: string; password: string; name?: string },
  ) {
    return this.wechatAuth.bindWechat(body);
  }
}

/** 回调落地页：安全序列化结果并 postMessage 到父窗口（iframe 同源） */
function renderCallbackPage(result: WechatCallbackResult): string {
  const payload = JSON.stringify(result).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:sans-serif;text-align:center;padding:48px 24px;color:#68645E;">
  <p>登录处理中，请返回原页面…</p>
  <script>
    (function () {
      var payload = ${payload};
      try {
        var target = window.parent !== window ? window.parent : window.opener;
        if (target) target.postMessage({ type: "wechat-login-result", payload: payload }, "*");
      } catch (e) {}
    })();
  </script>
</body>
</html>`;
}
