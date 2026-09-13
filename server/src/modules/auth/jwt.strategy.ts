import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { extractSessionCookieToken } from "../../common/security/session-security";
import type { AdminAccessTokenPayload } from "../../common/security/authenticated-principal";
import { resolveJwtSecret } from "../../common/config/runtime-environment";

function isAdminAccessTokenPayload(
  payload: unknown,
): payload is AdminAccessTokenPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<AdminAccessTokenPayload>;
  return (
    candidate.type === "admin" &&
    candidate.tokenUse === "access" &&
    Number.isInteger(candidate.sub) &&
    Number(candidate.sub) > 0 &&
    (candidate.sessionFamilyId === undefined ||
      (typeof candidate.sessionFamilyId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          candidate.sessionFamilyId,
        )))
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: { headers?: Record<string, unknown> }) =>
          extractSessionCookieToken(request.headers?.cookie, "admin"),
      ]),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(
        config.get("JWT_SECRET"),
        config.get("NODE_ENV"),
      ),
    });
  }

  async validate(payload: unknown) {
    // 两个身份域共用签名密钥时必须正向匹配类型与用途；未知/缺失类型一律拒绝。
    if (!isAdminAccessTokenPayload(payload)) {
      throw new UnauthorizedException('令牌类型无效');
    }
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        status: { not: "DISABLED" },
        ...(payload.sessionFamilyId
          ? {
              adminRefreshSessions: {
                some: {
                  familyId: payload.sessionFamilyId,
                  revokedAt: null,
                  expiresAt: { gt: new Date() },
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        username: true,
        realName: true,
        phone: true,
        email: true,
        avatar: true,
        role: true,
        status: true,
        lastLoginIp: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException("账号无效或已被禁用");
    }
    return user;
  }
}
