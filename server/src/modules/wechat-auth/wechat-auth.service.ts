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

const WECHAT_QR_CONNECT = "https://open.weixin.qq.com/connect/qrconnect";
const WECHAT_ACCESS_TOKEN_API =
  "https://api.weixin.qq.com/sns/oauth2/access_token";
const STATE_TTL_MS = 5 * 60 * 1000; // 二维码 state 5 分钟有效
const BIND_TTL_MS = 10 * 60 * 1000; // 绑定令牌 10 分钟有效

/** 回调父页来源必须是 CORS 白名单内的完整 http(s) origin。 */
function normalizeParentOrigin(origin: unknown, allowedOrigins: string[]): string | null {
  if (typeof origin !== "string" || !origin.trim()) return null;
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
};

function stateSigningKey(): string {
  const key = process.env.JWT_SECRET?.trim();
  if (!key) throw new ServiceUnavailableException("登录签名配置不可用");
  return key;
}

function stateSignature(value: string): Buffer {
  return createHmac("sha256", stateSigningKey())
    .update(value)
    .digest()
    .subarray(0, 16);
}

function buildSignedState(parentOrigin: string | null, allowedOrigins: string[]): string {
  const originIndex = parentOrigin ? allowedOrigins.indexOf(parentOrigin) : -1;
  const body = [
    "v1",
    Date.now().toString(36),
    String(originIndex),
    randomBytes(12).toString("base64url"),
  ].join(".");
  return `${body}.${stateSignature(body).toString("base64url")}`;
}

function verifySignedState(state: string, allowedOrigins: string[]): string | null {
  const parts = state.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") {
    throw new BadRequestException("登录状态已失效，请重新扫码");
  }
  const body = parts.slice(0, 4).join(".");
  const supplied = Buffer.from(parts[4], "base64url");
  const expected = stateSignature(body);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new BadRequestException("登录状态已失效，请重新扫码");
  }
  const issuedAt = Number.parseInt(parts[1], 36);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > STATE_TTL_MS || issuedAt > Date.now() + 30_000) {
    throw new BadRequestException("登录状态已失效，请重新扫码");
  }
  const originIndex = Number(parts[2]);
  if (!Number.isInteger(originIndex) || originIndex < -1 || originIndex >= allowedOrigins.length) {
    throw new BadRequestException("登录状态已失效，请重新扫码");
  }
  return originIndex === -1 ? null : allowedOrigins[originIndex];
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
  session?: { accessToken: string; customerId: number };
};

@Injectable()
export class WechatAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly sms: SmsService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      process.env.WECHAT_APP_ID?.trim() &&
        process.env.WECHAT_APP_SECRET?.trim() &&
        process.env.WECHAT_REDIRECT_URI?.trim(),
    );
  }

  private issueAccessToken(customerId: number) {
    return this.jwtService.sign(
      { sub: customerId, type: "customer", tokenUse: "access" },
      { expiresIn: "15m" },
    );
  }

  private accountResponse(customer: {
    id: number;
    phone: string;
    name: string | null;
    email: string | null;
  }) {
    return {
      accessToken: this.issueAccessToken(customer.id),
      customer: {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
        email: customer.email,
      },
    };
  }

  /** 生成微信扫码登录的二维码地址（WeChat 官方 qrconnect 页面，iframe 内嵌自带二维码渲染） */
  buildQrConnectUrl(parentOrigin?: unknown): { url: string; state: string } {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("微信扫码登录未配置");
    }
    const allowedOrigins = resolveCorsOrigins(
      process.env.NODE_ENV,
      process.env.CORS_ORIGIN,
    );
    const normalizedOrigin = normalizeParentOrigin(parentOrigin, allowedOrigins);
    const state = buildSignedState(normalizedOrigin, allowedOrigins);
    const url = new URL(WECHAT_QR_CONNECT);
    url.searchParams.set("appid", process.env.WECHAT_APP_ID!.trim());
    url.searchParams.set(
      "redirect_uri",
      process.env.WECHAT_REDIRECT_URI!.trim(),
    );
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "snsapi_login");
    url.searchParams.set("state", state);
    return { url: `${url.toString()}#wechat_redirect`, state };
  }

  private async exchangeCode(
    code: string,
  ): Promise<{ openid: string; unionid: string | null }> {
    const url = new URL(WECHAT_ACCESS_TOKEN_API);
    url.searchParams.set("appid", process.env.WECHAT_APP_ID!.trim());
    url.searchParams.set("secret", process.env.WECHAT_APP_SECRET!.trim());
    url.searchParams.set("code", code);
    url.searchParams.set("grant_type", "authorization_code");

    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      openid?: string;
      unionid?: string;
      errcode?: number;
      errmsg?: string;
    };
    if (!data.openid) {
      throw new BadRequestException(
        `微信授权失败：${data.errmsg || "未知错误"}`,
      );
    }
    return { openid: data.openid, unionid: data.unionid ?? null };
  }

  /** 回调：校验 state → code 换 openid → 已绑定直接登录，未绑定返回一次性绑定令牌 */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<WechatCallbackOutcome> {
    if (!this.isConfigured()) {
      return {
        result: { kind: "error", message: "微信扫码登录未配置" },
        parentOrigin: null,
      };
    }
    let parentOrigin: string | null;
    try {
      parentOrigin = verifySignedState(
        state,
        resolveCorsOrigins(process.env.NODE_ENV, process.env.CORS_ORIGIN),
      );
    } catch {
      return {
        result: { kind: "error", message: "登录状态已失效，请重新扫码" },
        parentOrigin: null,
      };
    }
    try {
      const { openid, unionid } = await this.exchangeCode(code);
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
          session: { accessToken: account.accessToken, customerId: existing.id },
        };
      }
      const bindToken = this.jwtService.sign(
        { type: "customer", tokenUse: "wechat-bind", openid, unionid },
        { expiresIn: Math.floor(BIND_TTL_MS / 1000) },
      );
      return { result: { kind: "need-bind", bindToken }, parentOrigin };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "微信授权失败";
      return { result: { kind: "error", message }, parentOrigin };
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
  }) {
    let record: WechatBindClaims;
    try {
      record = await this.jwtService.verifyAsync<WechatBindClaims>(data.bindToken);
    } catch {
      throw new BadRequestException("微信登录已过期，请重新扫码");
    }
    if (record.type !== "customer" || record.tokenUse !== "wechat-bind" || !record.openid) {
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
      if (existing.wechatOpenId && existing.wechatOpenId !== record.openid) {
        throw new BadRequestException("该手机号已绑定其他微信账号");
      }
      customer = await this.prisma.customer.update({
        where: { id: existing.id },
        data: {
          wechatOpenId: record.openid,
          wechatUnionId: record.unionid,
        },
      });
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
      customer = await this.prisma.customer.create({
        data: {
          phone,
          passwordHash,
          name: data.name?.trim() || null,
          wechatOpenId: record.openid,
          wechatUnionId: record.unionid,
        },
      });
    }
    return this.accountResponse(customer);
  }
}
