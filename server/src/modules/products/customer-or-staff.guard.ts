import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import {
  findActiveCustomerPrincipal,
  findActiveStaffPrincipal,
  isAdminAccessTokenPayload,
  isCustomerAccessTokenPayload,
  staffHasAnyRole,
} from '../../common/security/access-session-validation';
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
    private readonly reflector: Reflector,
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
      const payload = await this.jwtService.verifyAsync<Record<string, unknown>>(token);

      if (isCustomerAccessTokenPayload(payload)) {
        const customer = await findActiveCustomerPrincipal(this.prisma, payload);
        if (!customer) {
          throw new UnauthorizedException('客户访问身份无效');
        }
        request.customer = customer;
        request.authKind = 'customer';
        return true;
      }

      if (!isAdminAccessTokenPayload(payload)) {
        throw new UnauthorizedException('访问令牌类型无效');
      }
      const user = await findActiveStaffPrincipal(this.prisma, payload);
      if (!user) {
        throw new UnauthorizedException('账号无效或已被禁用');
      }
      const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!staffHasAnyRole(user, requiredRoles)) {
        throw new ForbiddenException('无权访问该资源');
      }
      request.user = user;
      request.authKind = 'staff';
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('访问令牌已失效');
    }
  }
}
