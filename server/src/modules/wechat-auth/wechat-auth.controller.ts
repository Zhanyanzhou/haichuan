// 微信扫码登录控制器：二维码配置 + 授权回调（HTML postMessage 回传）+ 手机号绑定。
import { Body, Controller, Get, Post, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../common/decorators/public.decorator";
import {
  WechatAuthService,
  type WechatCallbackOutcome,
  type WechatCallbackResult,
} from "./wechat-auth.service";
import { BindWechatDto } from "./dto/bind-wechat.dto";

@Controller("customers/wechat")
export class WechatAuthController {
  constructor(private readonly wechatAuth: WechatAuthService) {}

  /** 前端据此决定是否渲染扫码入口，并获取二维码地址 */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get("config")
  config(@Query("origin") origin?: string) {
    if (!this.wechatAuth.isConfigured()) return { enabled: false };
    return {
      enabled: true,
      qrConnectUrl: this.wechatAuth.buildQrConnectUrl(origin).url,
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
    const outcome: WechatCallbackOutcome = code
      ? await this.wechatAuth.handleCallback(code, state)
      : {
          result: { kind: "error", message: "缺少授权码" },
          parentOrigin: null,
        };
    res
      .type("html")
      .send(renderCallbackPage(outcome.result, outcome.parentOrigin));
  }

  /** 扫码后绑定手机号：既有账户校验密码绑定，新手机号直接建号 */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("bind")
  bind(
    @Body() body: BindWechatDto,
  ) {
    return this.wechatAuth.bindWechat(body);
  }
}

/** 回调落地页：序列化结果并按 state 中记录的父页 origin 精确回传（不再使用通配 origin） */
function renderCallbackPage(
  result: WechatCallbackResult,
  parentOrigin: string | null,
): string {
  const payload = JSON.stringify(result).replace(/</g, "\\u003c");
  const allowedOrigin = JSON.stringify(parentOrigin ?? "");
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:sans-serif;text-align:center;padding:48px 24px;color:#68645E;">
  <p id="hint">登录处理中，请返回原页面…</p>
  <script>
    (function () {
      var payload = ${payload};
      var allowedOrigin = ${allowedOrigin};
      try {
        var target = window.parent !== window ? window.parent : window.opener;
        if (target && allowedOrigin) {
          target.postMessage({ type: "wechat-login-result", payload: payload }, allowedOrigin);
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
