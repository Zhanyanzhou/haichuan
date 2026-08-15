import { Injectable, UnauthorizedException, BadRequestException, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * 登录失败锁定（A07 防爆破第二道防线，配合既有 5/min 限流）：
 * 同一用户名连续失败 5 次锁定 15 分钟；登录成功即清零；锁定期满自动从零开始。
 * 内存态实现：单容器部署下足够，重启清零可接受（限流仍在，攻击者无收益）；
 * 未来多实例部署时迁移到共享存储（届时按 git 历史的 Redis 模板恢复）。
 */
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

interface LoginAttemptRecord {
  failures: number;
  lockedUntil: number;
  lastFailureAt: number;
}

@Injectable()
export class AuthService {
  private readonly loginAttempts = new Map<string, LoginAttemptRecord>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private assertNotLocked(username: string): void {
    const record = this.loginAttempts.get(username);
    if (!record) return;
    const now = Date.now();
    if (record.lockedUntil > now) {
      const minutes = Math.ceil((record.lockedUntil - now) / 60000);
      throw new HttpException(
        `密码连续错误次数过多，账号已临时锁定，请约 ${minutes} 分钟后重试`,
        403,
      );
    }
    // 锁定期已过：视为新周期，清空记录
    this.loginAttempts.delete(username);
  }

  private recordLoginFailure(username: string): void {
    const now = Date.now();
    const record =
      this.loginAttempts.get(username) ??
      ({ failures: 0, lockedUntil: 0, lastFailureAt: now } satisfies LoginAttemptRecord);
    // 距上次失败超过一个锁定期：视为新一轮尝试，从零计数
    if (now - record.lastFailureAt > LOGIN_LOCK_MS) record.failures = 0;
    record.failures += 1;
    record.lastFailureAt = now;
    if (record.failures >= LOGIN_MAX_FAILURES) {
      record.lockedUntil = now + LOGIN_LOCK_MS;
      record.failures = 0; // 锁定期满后从零开始，避免历史失败永久累积
    }
    this.loginAttempts.set(username, record);
    // 防内存膨胀：撞库常用大量随机用户名撑 Map；超阈值时清理全部未锁定条目
    if (this.loginAttempts.size > 1000) {
      for (const [key, value] of this.loginAttempts) {
        if (value.lockedUntil <= now) this.loginAttempts.delete(key);
      }
    }
  }

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
    this.assertNotLocked(username);

    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      // 用户不存在同样计数：防攻击者借锁定行为差异枚举有效用户名
      this.recordLoginFailure(username);
      throw new UnauthorizedException('用户名或密码错误');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.recordLoginFailure(username);
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 登录成功：清除该用户名的失败记录
    this.loginAttempts.delete(username);

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
