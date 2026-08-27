import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { extractAccessToken } from '../../common/security/session-security';

/**
 * 公开接口可匿名访问；携带客户令牌时，验证后把客户资料挂到请求中。
 */
@Injectable()
export class OptionalCustomerAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractAccessToken(request, 'customer');
    if (!token) return true;

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: number; type?: string; tokenUse?: string }>(token);
      if (payload.type !== 'customer' || payload.tokenUse !== 'access' || !Number.isInteger(payload.sub)) {
        throw new UnauthorizedException('客户登录状态无效');
      }
      const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });
      if (!customer || customer.status === 'DISABLED') {
        throw new UnauthorizedException('客户登录状态无效');
      }
      // partnerStatus=SUSPENDED 不在此处拒绝：暂停的是合作商品访问权而非整个账户。
      // 每次请求实时读取 customer，SUSPENDED 在 catalog 可见范围过滤层立即降级为 MEMBER。
      request.customer = customer;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('客户登录已失效，请重新登录');
    }
  }
}
