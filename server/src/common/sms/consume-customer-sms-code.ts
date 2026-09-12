import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export type CustomerSmsPurpose = 'REGISTER' | 'LOGIN' | 'PROFILE_VERIFY';

/**
 * 客户短信验证码一次性消费（唯一实现）：注册验真、登录挑战、微信绑定建号共用。
 * 哈希绑定手机号且用途一致（换号/换用途无效）；并发抢占由 usedAt 条件更新保证。
 */
export async function consumeCustomerSmsCode(
  tx: Prisma.TransactionClient,
  phone: string,
  smsCode: string,
  now: Date,
  purpose: CustomerSmsPurpose,
): Promise<void> {
  const codeHash = createHash('sha256')
    .update(`${phone}:${smsCode.trim()}`)
    .digest('hex');
  const record = await tx.customerSmsCode.findFirst({
    where: { phone, codeHash, purpose, usedAt: null, expiresAt: { gte: now } },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw new BadRequestException('短信验证码错误或已过期');
  const claimed = await tx.customerSmsCode.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gte: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) throw new BadRequestException('短信验证码错误或已过期');
}
