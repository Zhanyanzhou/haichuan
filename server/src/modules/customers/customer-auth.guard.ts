import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { extractAccessToken } from '../../common/security/session-security';

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractAccessToken(request, 'customer');
    if (!token) throw new UnauthorizedException('请先验证订单访问身份');

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
        type?: string;
        tokenUse?: string;
        authVersion?: number;
      }>(token);
      if (payload.type !== 'customer' || payload.tokenUse !== 'access' || !Number.isInteger(payload.sub)) {
        throw new UnauthorizedException('客户访问令牌无效');
      }
      const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });
      if (!customer || customer.status === 'DISABLED') {
        throw new UnauthorizedException('客户访问身份无效');
      }
      // 兼容迁移前签发且尚未过期的 v1 令牌；改密/换绑递增 authVersion 后立即失效。
      if ((payload.authVersion ?? 1) !== (customer.authVersion ?? 1)) {
        throw new UnauthorizedException('客户访问令牌已失效，请重新登录');
      }
      // 注意：partnerStatus=SUSPENDED 不在此处拒绝请求——暂停的是"合作商品访问权"，而非整个账户。
      // 每次请求都从数据库实时读取 customer（含 partnerStatus），因此审核暂停即便旧 JWT 未过期，
      // 也会在 catalog 可见范围过滤层立即生效（SUSPENDED 自动降级为 MEMBER 可见范围）。
      request.customer = customer;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('客户访问令牌已失效');
    }
  }
}
