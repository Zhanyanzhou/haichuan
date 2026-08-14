import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * 受控媒体端点鉴权守卫：接受已验证的客户令牌或后台员工令牌。
 *
 * - 客户令牌（payload.type === 'customer'）：挂载 request.customer，标记 request.authKind = 'customer'；
 * - 员工令牌（无 type 或 type !== 'customer'）：挂载 request.user，标记 request.authKind = 'staff'。
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
    const authorization = request.headers.authorization;
    const token =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : null;
    if (!token) throw new UnauthorizedException('请先登录后查看商品资料');

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: number; type?: string }>(token);
      if (!Number.isInteger(payload.sub)) {
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

      // 员工令牌：复用后台 User 体系（JwtStrategy.validate 同样拒绝 customer token，此处独立校验）
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
