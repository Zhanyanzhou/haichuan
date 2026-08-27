import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  extractBearerToken,
  extractSessionCookieToken,
  type SessionDomain,
} from '../../common/security/session-security';

/**
 * 受控媒体端点鉴权守卫：接受已验证的客户令牌或后台员工令牌。
 *
 * - 客户令牌（payload.type === 'customer'）：挂载 request.customer，标记 request.authKind = 'customer'；
 * - 员工令牌（payload.type === 'admin'）：挂载 request.user，标记 request.authKind = 'staff'。
 *
 * 安全约束（任务书第四节 A2）：不允许 staff 冒充 customer 身份，两种身份走各自分支不交叉。
 * 媒体服务据此决定可见范围校验与是否叠加 PARTNER 水印（员工看原图，客户看受水印保护的图）。
 */
@Injectable()
export class CustomerOrStaffGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const bearerToken = extractBearerToken(request.headers.authorization);
    const customerCookie = extractSessionCookieToken(request.headers.cookie, 'customer');
    const adminCookie = extractSessionCookieToken(request.headers.cookie, 'admin');
    const requestedDomain = request.headers['x-session-domain'];
    const cookieDomain: SessionDomain | null =
      requestedDomain === 'customer' || requestedDomain === 'admin'
        ? requestedDomain
        : customerCookie && !adminCookie
          ? 'customer'
          : adminCookie && !customerCookie
            ? 'admin'
            : null;
    const token = bearerToken || (cookieDomain === 'customer' ? customerCookie : cookieDomain === 'admin' ? adminCookie : null);
    if (!token) throw new UnauthorizedException('请先登录后查看商品资料');

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: number; type?: string; tokenUse?: string }>(token);
      if (!Number.isInteger(payload.sub) || payload.tokenUse !== 'access') {
        throw new UnauthorizedException('访问令牌无效');
      }

      if (payload.type === 'customer') {
        const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });
        if (!customer || customer.status === 'DISABLED') {
          throw new UnauthorizedException('客户访问身份无效');
        }
        request.customer = customer;
        request.authKind = 'customer';
        return true;
      }

      if (payload.type !== 'admin') {
        throw new UnauthorizedException('访问令牌类型无效');
      }
      // 员工令牌：复用后台 User 体系（JwtStrategy.validate 同样执行正向类型匹配，此处独立校验）
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status === 'DISABLED') {
        throw new UnauthorizedException('账号无效或已被禁用');
      }
      const { password: _, ...safeUser } = user;
      request.user = safeUser;
      request.authKind = 'staff';
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('访问令牌已失效');
    }
  }
}
