import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { extractSessionCookieToken } from "../../common/security/session-security";

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

  async validate(payload: any) {
    // 拒绝客户令牌：客户与管理员共用 JWT_SECRET，必须按 type 区分，
    // 否则 Customer.id 与 User.id 主键重叠时会被当成员工身份接受（垂直越权）
    if (payload.type === 'customer') {
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
