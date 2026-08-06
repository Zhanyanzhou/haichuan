import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /** 密码复杂度校验：最小8位，必须包含字母和数字 */
  private validatePassword(password: string): void {
    if (!password || password.length < 8) {
      throw new BadRequestException('密码长度不能少于8位');
    }
    if (!/[a-zA-Z]/.test(password)) {
      throw new BadRequestException('密码必须包含至少一个字母');
    }
    if (!/[0-9]/.test(password)) {
      throw new BadRequestException('密码必须包含至少一个数字');
    }
  }

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) throw new UnauthorizedException('用户名或密码错误');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('用户名或密码错误');

    if (user.status === 'DISABLED') throw new UnauthorizedException('账号已被禁用');

    const { password: _, ...result } = user;
    return result;
  }

  async login(user: any) {
    const payload = { sub: user.id, username: user.username, role: user.role };

    // 更新最后登录信息
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        role: user.role,
        avatar: user.avatar,
      },
    };
  }

  async register(data: { username: string; password: string; realName?: string; phone?: string }) {
    // 密码复杂度校验
    this.validatePassword(data.password);

    const existingUser = await this.prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existingUser) throw new UnauthorizedException('用户名已存在');

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        password: hashedPassword,
        realName: data.realName,
        phone: data.phone,
        role: 'EDITOR',
      },
    });

    const { password: _, ...result } = user;
    return result;
  }
}
