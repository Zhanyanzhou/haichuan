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
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";

const WECHAT_QR_CONNECT = "https://open.weixin.qq.com/connect/qrconnect";
const WECHAT_ACCESS_TOKEN_API =
  "https://api.weixin.qq.com/sns/oauth2/access_token";
const STATE_TTL_MS = 5 * 60 * 1000; // 二维码 state 5 分钟有效
const BIND_TTL_MS = 10 * 60 * 1000; // 绑定令牌 10 分钟有效

export type WechatCallbackResult =
  | {
      kind: "success";
      accessToken: string;
      customer: {
        id: number;
        phone: string;
        name: string | null;
        email: string | null;
      };
    }
  | { kind: "need-bind"; bindToken: string }
  | { kind: "error"; message: string };

@Injectable()
export class WechatAuthService {
  // 内存态：state → 签发时间戳；bindToken → openid 绑定上下文。
  // 单实例部署足够；若未来横向扩容，需迁移到 Redis/DB 存储。
  private readonly states = new Map<string, number>();
  private readonly binds = new Map<
    string,
    { openid: string; unionid: string | null; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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
      { sub: customerId, type: "customer" },
      { expiresIn: "24h" },
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

  private prune() {
    const now = Date.now();
    for (const [state, ts] of this.states) {
      if (now - ts > STATE_TTL_MS) this.states.delete(state);
    }
    for (const [token, record] of this.binds) {
      if (now > record.expiresAt) this.binds.delete(token);
    }
  }

  /** 生成微信扫码登录的二维码地址（WeChat 官方 qrconnect 页面，iframe 内嵌自带二维码渲染） */
  buildQrConnectUrl(): { url: string; state: string } {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("微信扫码登录未配置");
    }
    this.prune();
    const state = randomBytes(16).toString("hex");
    this.states.set(state, Date.now());
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
  ): Promise<WechatCallbackResult> {
    if (!this.isConfigured()) {
      return { kind: "error", message: "微信扫码登录未配置" };
    }
    if (!state || !this.states.delete(state)) {
      return { kind: "error", message: "登录状态已失效，请重新扫码" };
    }
    try {
      const { openid, unionid } = await this.exchangeCode(code);
      const existing = await this.prisma.customer.findUnique({
        where: { wechatOpenId: openid },
      });
      if (existing) {
        if (existing.status === "DISABLED") {
          return { kind: "error", message: "该账户已被停用" };
        }
        return { kind: "success", ...this.accountResponse(existing) };
      }
      const bindToken = randomBytes(24).toString("hex");
      this.binds.set(bindToken, {
        openid,
        unionid,
        expiresAt: Date.now() + BIND_TTL_MS,
      });
      return { kind: "need-bind", bindToken };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "微信授权失败";
      return { kind: "error", message };
    }
  }

  /** 绑定：扫码拿到 openid 后，绑定到既有手机号账户（校验密码）或新建账户 */
  async bindWechat(data: {
    bindToken: string;
    phone: string;
    password: string;
    name?: string;
  }) {
    const record = this.binds.get(data.bindToken);
    if (!record || Date.now() > record.expiresAt) {
      throw new BadRequestException("微信登录已过期，请重新扫码");
    }
    const phone = data.phone?.trim();
    if (!/^1\d{10}$/.test(phone)) {
      throw new BadRequestException("请提供有效的手机号码");
    }
    const password = data.password ?? "";
    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      throw new BadRequestException("密码至少需要 8 位，并包含字母和数字");
    }

    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    let customer: {
      id: number;
      phone: string;
      name: string | null;
      email: string | null;
    };
    if (existing) {
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
    this.binds.delete(data.bindToken);
    return this.accountResponse(customer);
  }
}
