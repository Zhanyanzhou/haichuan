import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { StaffPrincipal } from './authenticated-principal';
import type { OperatorContext } from '../../modules/trade-events/trade-events.constants';

export type StaffPaymentAuthorization =
  | 'PAYMENT_ADMIN'
  | 'PAYMENT_QUERY'
  | 'PAYMENT_RECEIPT';

type StaffPaymentTx = Prisma.TransactionClient | PrismaService;

export async function lockAuthorizedStaffForPayment(
  tx: StaffPaymentTx,
  actor: Pick<StaffPrincipal, 'id'>,
  authorization: StaffPaymentAuthorization,
): Promise<OperatorContext> {
  if (!Number.isInteger(actor.id) || actor.id <= 0) {
    throw new ForbiddenException('当前员工身份无效');
  }
  const query = authorization === 'PAYMENT_QUERY'
    ? Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR UPDATE`
    : authorization === 'PAYMENT_RECEIPT'
      ? Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE') FOR UPDATE`
      : Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR UPDATE`;
  const [locked] = await tx.$queryRaw<Array<{
    id: number;
    username?: string;
    realName?: string | null;
  }>>(query);
  if (!locked) {
    throw new ForbiddenException('当前员工已停用或无权处理付款');
  }
  return {
    type: 'ADMIN',
    id: locked.id,
    name: locked.realName || locked.username,
  };
}
