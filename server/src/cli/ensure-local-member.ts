/**
 * 只在本机开发库准备一个用户名会员。
 * 生产环境、非本机数据库一律拒绝。口令只从本次进程的环境变量读取，不写进源码或日志。
 *
 * 在 server/ 目录执行：
 * LOCAL_MEMBER_USERNAME=名称 LOCAL_MEMBER_PASSWORD=口令 npx ts-node src/cli/ensure-local-member.ts
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CUSTOMER_USERNAME_REGEX } from '../modules/customers/dto/customer-auth.dto';
import { assertAccountPassword } from '../modules/users/staff-password-policy';

loadEnv({ path: resolve(__dirname, '../../.env') });

const LOCAL_NAME = '海川';
const PHONE_CANDIDATES = ['13800009001', '13800009002', '13800009003'];

export function databaseHost(connectionString: string) {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return '';
  }
}

export function readLocalMemberRequest(env: NodeJS.ProcessEnv) {
  if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'production') {
    throw new Error('生产环境不创建本地会员');
  }
  const host = databaseHost(env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    throw new Error('只允许在本机数据库创建本地会员');
  }
  const username = (env.LOCAL_MEMBER_USERNAME ?? '').trim().toLowerCase();
  if (!CUSTOMER_USERNAME_REGEX.test(username)) {
    throw new Error('请通过 LOCAL_MEMBER_USERNAME 提供有效用户名');
  }
  const password = env.LOCAL_MEMBER_PASSWORD ?? '';
  assertAccountPassword(password);
  const name = (env.LOCAL_MEMBER_NAME ?? '').trim() || LOCAL_NAME;
  return { username, password, name };
}

async function main() {
  const request = readLocalMemberRequest(process.env);
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(request.password, 12);
    const existing = await prisma.customer.findUnique({ where: { username: request.username } });
    if (existing) {
      await prisma.customer.update({
        where: { id: existing.id },
        data: { passwordHash, status: 'ACTIVE', name: existing.name || request.name },
      });
      console.log('已更新本机会员的用户名登录');
      return;
    }

    let phone: string | null = null;
    for (const candidate of PHONE_CANDIDATES) {
      const owner = await prisma.customer.findUnique({ where: { phone: candidate } });
      if (!owner) {
        phone = candidate;
        break;
      }
    }
    if (!phone) throw new Error('本地预留手机号都已被占用');

    await prisma.customer.create({
      data: {
        username: request.username,
        phone,
        name: request.name,
        passwordHash,
        status: 'ACTIVE',
      },
    });
    console.log('已创建本机会员的用户名登录');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : '本地会员创建失败');
    process.exitCode = 1;
  });
}
