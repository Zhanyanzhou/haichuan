// 微信开放平台扫码登录：二维码 → 扫码授权 → 回调换 openid → 绑定/登录。
// 说明：微信 openid 不能替代手机号（珠宝咨询业务必须收集电话），故未绑定 openid 时
// 走「绑定令牌」两步流程：先扫码拿 openid，再引导绑定手机号，随后签发客户 JWT。
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { resolveCorsOrigins } from "../../common/config/cors-origins";
import { assertAccountPassword } from "../users/staff-password-policy";
import { SmsService } from "../../common/sms/sms.service";
import { consumeCustomerSmsCode } from "../../common/sms/consume-customer-sms-code";
import {
  WechatOAuthClient,
  type WechatOAuthConfiguration,
} from "./wechat-oauth.client";
import {
  WECHAT_OAUTH_STATE_TTL_MS,
  WechatOAuthStateStore,
} from "./wechat-oauth-state.store";

const WECHAT_QR_CONNECT = "https://open.weixin.qq.com/connect/qrconnect";
const BIND_TTL_MS = 10 * 60 * 1000; // 绑定令牌 10 分钟有效
const BROWSER_BINDING_TTL_MS = 30 * 60 * 1000;
const BROWSER_BINDING_MIN_REMAINING_MS =
  WECHAT_OAUTH_STATE_TTL_MS + BIND_TTL_MS + 30 * 1000;

/** 回调父页来源必须是 CORS 白名单内的完整 http(s) origin。 */
function normalizeParentOrigin(origin: unknown, allowedOrigins: string[]): string {
  if (typeof origin !== "string" || !origin.trim()) {
    throw new BadRequestException("缺少回调页面来源");
  }
  const value = origin.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException("回调页面来源格式无效");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) {
    throw new BadRequestException("回调页面来源格式无效");
  }
  if (!allowedOrigins.includes(url.origin)) {
    throw new BadRequestException("回调页面来源不在允许列表中");
  }
  return url.origin;
}

type WechatBindClaims = {
  type: "customer";
  tokenUse: "wechat-bind";
  openid: string;
  unionid: string | null;
  browserBindingHash?: string;
};

function stateSigningKey(): string {
  const key = process.env.JWT_SECRET?.trim();
  if (!key) throw new ServiceUnavailableException("登录签名配置不可用");
  return key;
}

function signature(value: string): Buffer {
  return createHmac("sha256", stateSigningKey())
    .update(value)
    .digest()
    .subarray(0, 16);
}

function safeSignatureEqual(supplied: string, expected: Buffer): boolean {
  if (!/^[A-Za-z0-9_-]{22}$/.test(supplied)) return false;
  const suppliedBuffer = Buffer.from(supplied, "base64url");
  return (
    suppliedBuffer.length === expected.length &&
    timingSafeEqual(suppliedBuffer, expected)
  );
}

function browserBindingHash(value: string): string {
  return createHmac("sha256", stateSigningKey())
    .update(`wechat-browser-binding:${value}`)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

function parentOriginHash(origin: string): string {
  return createHmac("sha256", stateSigningKey())
    .update(`wechat-parent-origin:${origin}`)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

function createBrowserBinding(now = Date.now()): string {
  const body = [
    "wb1",
    now.toString(36),
    randomBytes(12).toString("base64url"),
  ].join(".");
  return `${body}.${signature(body).toString("base64url")}`;
}

function browserBindingExpiresAt(
  value: unknown,
  now = Date.now(),
): number | null {
  if (typeof value !== "string" || value.length > 128) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "wb1") return null;
  const body = parts.slice(0, 3).join(".");
  if (!safeSignatureEqual(parts[3], signature(body))) return null;
  const issuedAt = Number.parseInt(parts[1], 36);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 30_000) return null;
  return issuedAt + BROWSER_BINDING_TTL_MS;
}

function isValidBrowserBinding(value: unknown, now = Date.now()): value is string {
  const expiresAt = browserBindingExpiresAt(value, now);
  return expiresAt !== null && expiresAt > now;
}

function hasSufficientBrowserBindingLifetime(
  value: unknown,
  now = Date.now(),
): value is string {
  const expiresAt = browserBindingExpiresAt(value, now);
  return (
    expiresAt !== null &&
    expiresAt - now >= BROWSER_BINDING_MIN_REMAINING_MS
  );
}

function buildSignedState(
  parentOrigin: string,
  bindingHash: string,
  now = Date.now(),
): string {
  const body = [
    "v2",
    now.toString(36),
    parentOriginHash(parentOrigin),
    randomBytes(12).toString("base64url"),
    bindingHash,
  ].join(".");
  return `${body}.${signature(body).toString("base64url")}`;
}

function verifySignedState(
  state: unknown,
  allowedOrigins: string[],
  browserBinding: unknown,
  now = Date.now(),
): { parentOrigin: string; expiresAt: number } | null {
  if (
    typeof state !== "string" ||
    state.length > 192 ||
    !isValidBrowserBinding(browserBinding, now)
  ) {
    return null;
  }
  const parts = state.split(".");
  if (parts.length !== 6 || parts[0] !== "v2") return null;
  const body = parts.slice(0, 5).join(".");
  if (!safeSignatureEqual(parts[5], signature(body))) return null;
  const issuedAt = Number.parseInt(parts[1], 36);
  if (
    !Number.isFinite(issuedAt) ||
    issuedAt > now + 30_000 ||
    now - issuedAt >= WECHAT_OAUTH_STATE_TTL_MS
  ) {
    return null;
  }
  const parentOrigin = allowedOrigins.find((origin) =>
    safeSignatureEqual(
      parts[2],
      Buffer.from(parentOriginHash(origin), "base64url"),
    ),
  );
  if (!parentOrigin) return null;
  const expectedBindingHash = browserBindingHash(browserBinding);
  const suppliedBindingHash = parts[4];
  if (
    !/^[A-Za-z0-9_-]{22}$/.test(suppliedBindingHash) ||
    !safeSignatureEqual(suppliedBindingHash, Buffer.from(expectedBindingHash, "base64url"))
  ) {
    return null;
  }
  return {
    parentOrigin,
    expiresAt: issuedAt + WECHAT_OAUTH_STATE_TTL_MS,
  };
}

function readWechatConfiguration(): WechatOAuthConfiguration {
  const appId = process.env.WECHAT_APP_ID?.trim();
  const appSecret = process.env.WECHAT_APP_SECRET?.trim();
  const redirectUri = process.env.WECHAT_REDIRECT_URI?.trim();
  if (!appId || !appSecret || !redirectUri) {
    throw new ServiceUnavailableException("微信扫码登录未配置");
  }
  stateSigningKey();

  let callbackUrl: URL;
  try {
    callbackUrl = new URL(redirectUri);
  } catch {
    throw new ServiceUnavailableException("微信扫码登录回调配置无效");
  }
  const validProtocol = ["http:", "https:"].includes(callbackUrl.protocol);
  const secureProduction =
    process.env.NODE_ENV !== "production" || callbackUrl.protocol === "https:";
  if (
    !validProtocol ||
    !secureProduction ||
    callbackUrl.username ||
    callbackUrl.password ||
    callbackUrl.search ||
    callbackUrl.hash ||
    callbackUrl.pathname !== "/api/customers/wechat/callback"
  ) {
    throw new ServiceUnavailableException("微信扫码登录回调配置无效");
  }
  return {
    appId,
    appSecret,
    redirectUri: callbackUrl.toString(),
    callbackOrigin: callbackUrl.origin,
  };
}

export type WechatCallbackResult =
  | {
      kind: "success";
      customer: {
        id: number;
        phone: string;
        name: string | null;
        email: string | null;
      };
    }
  | { kind: "need-bind"; bindToken: string }
  | { kind: "error"; message: string };

export type WechatCallbackOutcome = {
  result: WechatCallbackResult;
  parentOrigin: string | null;
  session?: { accessToken: string; customerId: number; authVersion: number };
};

@Injectable()
export class WechatAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly sms: SmsService,
    private readonly oauthClient: WechatOAuthClient = new WechatOAuthClient(),
    private readonly oauthStates: WechatOAuthStateStore =
      new WechatOAuthStateStore(),
  ) {}

  isConfigured(): boolean {
    try {
      readWechatConfiguration();
      return true;
    } catch {
      return false;
    }
  }

  private issueAccessToken(customerId: number, authVersion = 1) {
    return this.jwtService.sign(
      { sub: customerId, type: "customer", tokenUse: "access", authVersion },
      { expiresIn: "15m" },
    );
  }

  private accountResponse(customer: {
    id: number;
    phone: string;
    name: string | null;
    email: string | null;
    authVersion?: number;
  }) {
    return {
      accessToken: this.issueAccessToken(customer.id, customer.authVersion ?? 1),
      customer: {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
        email: customer.email,
      },
    };
  }

  /** 生成微信扫码登录的二维码地址（WeChat 官方 qrconnect 页面，iframe 内嵌自带二维码渲染） */
  buildQrConnectUrl(
    parentOrigin: unknown,
    currentBrowserBinding?: string | null,
  ): {
    url: string;
    state: string;
    callbackOrigin: string;
    browserBindingToken: string;
  } {
    const config = readWechatConfiguration();
    const allowedOrigins = resolveCorsOrigins(
      process.env.NODE_ENV,
      process.env.CORS_ORIGIN,
    );
    const normalizedOrigin = normalizeParentOrigin(parentOrigin, allowedOrigins);
    const browserBindingToken = hasSufficientBrowserBindingLifetime(
      currentBrowserBinding,
    )
      ? currentBrowserBinding
      : createBrowserBinding();
    const state = buildSignedState(
      normalizedOrigin,
      browserBindingHash(browserBindingToken),
    );
    const url = new URL(WECHAT_QR_CONNECT);
    url.searchParams.set("appid", config.appId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "snsapi_login");
    url.searchParams.set("state", state);
    return {
      url: `${url.toString()}#wechat_redirect`,
      state,
      callbackOrigin: config.callbackOrigin,
      browserBindingToken,
    };
  }

  /** 回调：校验 state → code 换 openid → 已绑定直接登录，未绑定返回一次性绑定令牌 */
  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    browserBindingToken?: string | null,
  ): Promise<WechatCallbackOutcome> {
    if (!this.isConfigured()) {
      return {
        result: { kind: "error", message: "微信扫码登录未配置" },
        parentOrigin: null,
      };
    }
    const verifiedState = verifySignedState(
      state,
      resolveCorsOrigins(process.env.NODE_ENV, process.env.CORS_ORIGIN),
      browserBindingToken,
    );
    if (!verifiedState) {
      return {
        result: { kind: "error", message: "登录状态已失效，请重新扫码" },
        parentOrigin: null,
      };
    }
    const parentOrigin = verifiedState.parentOrigin;
    try {
      if (!this.oauthStates.claim(state!, verifiedState.expiresAt)) {
        return {
          result: { kind: "error", message: "登录状态已失效，请重新扫码" },
          parentOrigin,
        };
      }
    } catch (error) {
      return {
        result: {
          kind: "error",
          message:
            error instanceof ServiceUnavailableException
              ? error.message
              : "微信登录暂不可用，请稍后重试",
        },
        parentOrigin,
      };
    }
    if (!code?.trim()) {
      return {
        result: { kind: "error", message: "缺少授权码，请重新扫码" },
        parentOrigin,
      };
    }
    try {
      const { openid, unionid } = await this.oauthClient.exchangeCode(
        readWechatConfiguration(),
        code,
      );
      const existing = await this.prisma.customer.findUnique({
        where: { wechatOpenId: openid },
      });
      if (existing) {
        if (existing.status === "DISABLED") {
          return {
            result: { kind: "error", message: "该账户已被停用" },
            parentOrigin,
          };
        }
        const account = this.accountResponse(existing);
        return {
          result: { kind: "success", customer: account.customer },
          parentOrigin,
          session: {
            accessToken: account.accessToken,
            customerId: existing.id,
            authVersion: existing.authVersion ?? 1,
          },
        };
      }
      const bindToken = this.jwtService.sign(
        {
          type: "customer",
          tokenUse: "wechat-bind",
          openid,
          unionid,
          browserBindingHash: browserBindingHash(browserBindingToken!),
        },
        { expiresIn: Math.floor(BIND_TTL_MS / 1000) },
      );
      return { result: { kind: "need-bind", bindToken }, parentOrigin };
    } catch (error) {
      const message =
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
          ? error.message
          : "微信授权失败，请重新扫码";
      return {
        result: { kind: "error", message },
        parentOrigin,
      };
    }
  }

  /** 绑定：扫码拿到 openid 后，绑定到既有手机号账户（校验密码）或新建账户。
   * 新建账户必须先用短信验证手机号主权（防任意手机号抢注与绕过注册验真）；
   * 短信通道未配置时明确拒绝新建，只允许绑定既有账户。
   */
  async bindWechat(data: {
    bindToken: string;
    phone: string;
    password: string;
    name?: string;
    smsCode?: string;
  }, browserBindingToken?: string | null) {
    let record: WechatBindClaims;
    try {
      record = await this.jwtService.verifyAsync<WechatBindClaims>(data.bindToken);
    } catch {
      throw new BadRequestException("微信登录已过期，请重新扫码");
    }
    if (record.type !== "customer" || record.tokenUse !== "wechat-bind" || !record.openid) {
      throw new BadRequestException("微信登录已过期，请重新扫码");
    }
    // 控制器始终传入浏览器绑定值；省略参数仅保留给既有的 service 级策略测试。
    const secureBrowserFlow = browserBindingToken !== undefined;
    if (secureBrowserFlow) {
      if (
        !this.isConfigured() ||
        !record.browserBindingHash ||
        !isValidBrowserBinding(browserBindingToken) ||
        !safeSignatureEqual(
          record.browserBindingHash,
          Buffer.from(browserBindingHash(browserBindingToken), "base64url"),
        )
      ) {
        throw new BadRequestException("微信登录已过期，请重新扫码");
      }
    } else if (record.browserBindingHash) {
      throw new BadRequestException("微信登录已过期，请重新扫码");
    }
    const phone = data.phone?.trim();
    if (!/^1\d{10}$/.test(phone)) {
      throw new BadRequestException("请提供有效的手机号码");
    }
    const password = data.password ?? "";

    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    let customer: {
      id: number;
      phone: string;
      name: string | null;
      email: string | null;
      authVersion?: number;
    };
    if (existing) {
      if (existing.status === "DISABLED") {
        throw new UnauthorizedException("该账户已被停用");
      }
      if (
        !existing.passwordHash ||
        !(await bcrypt.compare(password, existing.passwordHash))
      ) {
        throw new UnauthorizedException("手机号或密码不正确");
      }
      if (secureBrowserFlow && existing.wechatOpenId === record.openid) {
        throw new BadRequestException("微信绑定已完成，请重新扫码登录");
      }
      if (existing.wechatOpenId && existing.wechatOpenId !== record.openid) {
        throw new BadRequestException("该手机号已绑定其他微信账号");
      }
      if (secureBrowserFlow) {
        let claimed: { count: number };
        try {
          claimed = await this.prisma.customer.updateMany({
            where: { id: existing.id, wechatOpenId: null },
            data: {
              wechatOpenId: record.openid,
              wechatUnionId: record.unionid,
            },
          });
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
          ) {
            throw new BadRequestException("该微信账号已绑定其他手机号");
          }
          throw error;
        }
        if (claimed.count !== 1) {
          throw new BadRequestException("微信绑定已完成，请重新扫码登录");
        }
        customer = {
          id: existing.id,
          phone: existing.phone,
          name: existing.name,
          email: existing.email,
          authVersion: existing.authVersion,
        };
      } else {
        customer = await this.prisma.customer.update({
          where: { id: existing.id },
          data: {
            wechatOpenId: record.openid,
            wechatUnionId: record.unionid,
          },
        });
      }
    } else {
      // 新手机号建账户：短信验真强制（不依赖注册开关，手机号主权必须证明）
      if (!this.sms.isAvailable()) {
        throw new ServiceUnavailableException(
          "短信服务未配置，暂不能为新手机号创建账户；请先注册会员后再绑定微信",
        );
      }
      if (!data.smsCode?.trim()) {
        throw new BadRequestException("请输入该手机号收到的短信验证码后再创建账户");
      }
      await consumeCustomerSmsCode(this.prisma, phone, data.smsCode, new Date(), "REGISTER");
      assertAccountPassword(password);
      const passwordHash = await bcrypt.hash(password, 12);
      try {
        customer = await this.prisma.customer.create({
          data: {
            phone,
            passwordHash,
            name: data.name?.trim() || null,
            wechatOpenId: record.openid,
            wechatUnionId: record.unionid,
          },
        });
      } catch (error) {
        if (
          secureBrowserFlow &&
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        ) {
          throw new BadRequestException("微信绑定已完成，请重新扫码登录");
        }
        throw error;
      }
    }
    return {
      ...this.accountResponse(customer),
      sessionAuthVersion: customer.authVersion ?? 1,
    };
  }

  /** 客户本人解除微信绑定；重复调用保持成功且不影响其它账户。 */
  async unbindWechat(customerId: number) {
    const result = await this.prisma.customer.updateMany({
      where: {
        id: customerId,
        OR: [
          { wechatOpenId: { not: null } },
          { wechatUnionId: { not: null } },
        ],
      },
      data: { wechatOpenId: null, wechatUnionId: null },
    });
    return { bound: false, changed: result.count === 1 };
  }
}
