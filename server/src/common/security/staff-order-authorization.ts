import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { StaffPrincipal } from './authenticated-principal';
import type { OperatorContext } from '../../modules/trade-events/trade-events.constants';

export type StaffOrderAuthorization =
  | 'ORDER_QUERY'
  | 'ORDER_FINANCE_QUERY'
  | 'ORDER_ADMIN'
  | 'ORDER_NOTE'
  | 'FULFILLMENT_MANAGE';

export type StaffOrderActor = Pick<StaffPrincipal, 'id'> | OperatorContext;

type StaffOrderTx = Prisma.TransactionClient | PrismaService;

export async function lockAuthorizedStaffForOrder(
  tx: StaffOrderTx,
  actor: StaffOrderActor,
  authorization: StaffOrderAuthorization,
): Promise<OperatorContext> {
  const actorId = Number(actor.id);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new ForbiddenException('当前员工身份无效');
  }
  const query = authorization === 'ORDER_QUERY'
    ? Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actorId} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR UPDATE`
    : authorization === 'ORDER_FINANCE_QUERY'
      ? Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actorId} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE') FOR UPDATE`
      : authorization === 'ORDER_NOTE'
        ? Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actorId} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR UPDATE`
        : authorization === 'FULFILLMENT_MANAGE'
          ? Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actorId} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'WAREHOUSE') FOR UPDATE`
          : Prisma.sql`SELECT id, username, real_name AS realName FROM users WHERE id = ${actorId} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR UPDATE`;
  const [locked] = await tx.$queryRaw<Array<{
    id: number;
    username?: string;
    realName?: string | null;
  }>>(query);
  if (!locked) {
    throw new ForbiddenException('当前员工已停用或无权处理订单');
  }
  return {
    type: 'ADMIN',
    id: locked.id,
    name: locked.realName || locked.username,
  };
}
