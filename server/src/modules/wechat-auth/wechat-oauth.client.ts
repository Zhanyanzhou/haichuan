import { BadRequestException } from "@nestjs/common";

const WECHAT_ACCESS_TOKEN_API =
  "https://api.weixin.qq.com/sns/oauth2/access_token";

export type WechatOAuthConfiguration = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  callbackOrigin: string;
};

export type WechatOAuthIdentity = {
  openid: string;
  unionid: string | null;
};

export class WechatOAuthClient {
  async exchangeCode(
    config: WechatOAuthConfiguration,
    code: string,
  ): Promise<WechatOAuthIdentity> {
    const normalizedCode = code.trim();
    if (!normalizedCode || normalizedCode.length > 512) {
      throw new BadRequestException("微信授权失败，请重新扫码");
    }

    const url = new URL(WECHAT_ACCESS_TOKEN_API);
    url.searchParams.set("appid", config.appId);
    url.searchParams.set("secret", config.appSecret);
    url.searchParams.set("code", normalizedCode);
    url.searchParams.set("grant_type", "authorization_code");

    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error("wechat-oauth-http-error");
      }
      const data = (await response.json()) as {
        openid?: unknown;
        unionid?: unknown;
      };
      if (typeof data.openid !== "string" || !data.openid.trim()) {
        throw new Error("wechat-oauth-invalid-response");
      }
      return {
        openid: data.openid,
        unionid:
          typeof data.unionid === "string" && data.unionid.trim()
            ? data.unionid
            : null,
      };
    } catch {
      throw new BadRequestException("微信授权失败，请重新扫码");
    }
  }
}


