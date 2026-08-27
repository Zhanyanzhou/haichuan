import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { extractSessionCookieToken } from "../../common/security/session-security";
import type { AdminAccessTokenPayload } from "../../common/security/authenticated-principal";

function isAdminAccessTokenPayload(
  payload: unknown,
): payload is AdminAccessTokenPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<AdminAccessTokenPayload>;
  return (
    candidate.type === "admin" &&
    candidate.tokenUse === "access" &&
    Number.isInteger(candidate.sub) &&
    Number(candidate.sub) > 0
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: { headers?: Record<string, unknown> }) =>
          extractSessionCookieToken(request.headers?.cookie, "admin"),
      ]),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET ||
        (() => {
          throw new Error("JWT_SECRET 环境变量未设置");
        })(),
    });
  }

  async validate(payload: unknown) {
    // 两个身份域共用签名密钥时必须正向匹配类型与用途；未知/缺失类型一律拒绝。
    if (!isAdminAccessTokenPayload(payload)) {
      throw new UnauthorizedException('令牌类型无效');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.status === "DISABLED") {
      throw new UnauthorizedException("账号无效或已被禁用");
    }
    const { password: _, ...result } = user;
    return result;
  }
}
