import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { CustomerPrincipal } from '../../common/security/authenticated-principal';

type CustomerWriteTransaction = Pick<Prisma.TransactionClient, '$queryRaw'>;
type CustomerReadTransaction = Pick<Prisma.TransactionClient, '$queryRaw'>;
type CustomerGatewayOperationTransaction = CustomerWriteTransaction
  & Pick<Prisma.TransactionClient, 'customerGatewayOperation'>;

export type LockedCustomerAccess = Pick<
  CustomerPrincipal,
  'id' | 'accountType' | 'partnerStatus'
>;

export const CUSTOMER_GATEWAY_OPERATION_LEASE_MS = 2 * 60 * 1000;

export type CustomerGatewayOperationKind =
  | 'CREATE_PAYMENT'
  | 'QUERY_PAYMENT'
  | 'CLOSE_PAYMENT';
export type CustomerGatewayOperationLease = {
  id: string;
  customerId: number;
  authVersion: number;
};

/**
 * 客户关联写入的统一串行点。
 *
 * 守卫只能证明请求进入控制器时身份有效；账户注销可能在服务事务开始前提交。
 * 因此所有会重新写入客户关联数据的事务都先竞争 customers 行锁，并在锁内复核
 * ACTIVE 与 access token 对应的 authVersion。这样与 closeAccount 保持同一锁序：
 * customers -> 领域记录。
 */
export async function lockActiveCustomerForWrite(
  transaction: CustomerWriteTransaction,
  customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
): Promise<LockedCustomerAccess> {
  const locked = await transaction.$queryRaw<LockedCustomerAccess[]>(
    Prisma.sql`SELECT id, account_type AS accountType, partner_status AS partnerStatus FROM customers WHERE id = ${customer.id} AND status = 'ACTIVE' AND auth_version = ${customer.authVersion} FOR UPDATE`,
  );

  if (locked.length !== 1) {
    throw new UnauthorizedException('客户登录状态已失效，请重新登录');
  }
  return locked[0];
}

/**
 * 客户私有敏感读取的线性化闸门。
 *
 * 与写闸门检查同一身份事实，但只取得共享锁：同一客户的并发私有读取可以共存，
 * 改密、换绑或注销等需要更新客户行的操作会等待当前读取完成。调用方必须把敏感
 * 领域查询及文件读取保留在同一事务回调内，不能在锁释放后再读取私有内容。
 */
export async function lockActiveCustomerForRead(
  transaction: CustomerReadTransaction,
  customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
): Promise<LockedCustomerAccess> {
  const locked = await transaction.$queryRaw<LockedCustomerAccess[]>(
    Prisma.sql`SELECT id, account_type AS accountType, partner_status AS partnerStatus FROM customers WHERE id = ${customer.id} AND status = 'ACTIVE' AND auth_version = ${customer.authVersion} FOR SHARE`,
  );

  if (locked.length !== 1) {
    throw new UnauthorizedException('客户登录状态已失效，请重新登录');
  }
  return locked[0];
}

/**
 * 在客户行锁内预约一次会产生第三方资金渠道副作用的操作。
 * 预约事务提交后才允许外调；账户注销在同一客户锁后看到有效 lease 会失败稍后重试，
 * 因而不需要在长数据库事务中等待网络。过期 lease 只代表进程结果未知，付款仍保持
 * PENDING 并由渠道回调/系统查单对账，绝不据此恢复客户身份或 PII。
 * 同一订单同类请求可以并存：它们复用稳定商户支付单号作为渠道幂等键；异类请求
 * （例如预下单与关单）互斥，避免相反资金动作同时外调。
 */
export async function reserveCustomerGatewayOperation(
  transaction: CustomerGatewayOperationTransaction,
  customer: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
  kind: CustomerGatewayOperationKind,
  orderId: number,
  paymentId?: number,
): Promise<CustomerGatewayOperationLease> {
  await lockActiveCustomerForWrite(transaction, customer);
  const now = new Date();
  await transaction.customerGatewayOperation.deleteMany({
    where: { customerId: customer.id, expiresAt: { lte: now } },
  });
  const incompatible = await transaction.customerGatewayOperation.findFirst({
    where: {
      customerId: customer.id,
      orderId,
      expiresAt: { gt: now },
      kind: { not: kind },
    },
    select: { id: true },
  });
  if (incompatible) {
    throw new ConflictException('该订单另一笔支付操作正在处理，请稍后重试');
  }

  const lease = {
    id: randomUUID(),
    customerId: customer.id,
    authVersion: customer.authVersion,
  };
  await transaction.customerGatewayOperation.create({
    data: {
      ...lease,
      kind,
      orderId,
      paymentId: paymentId ?? null,
      expiresAt: new Date(now.getTime() + CUSTOMER_GATEWAY_OPERATION_LEASE_MS),
    },
  });
  return lease;
}

/** 客户行已经由调用方锁定；有效 lease 存在时注销不能线性化。 */
export async function assertNoActiveCustomerGatewayOperation(
  transaction: Pick<Prisma.TransactionClient, 'customerGatewayOperation'>,
  customerId: number,
  now = new Date(),
): Promise<void> {
  const operation = await transaction.customerGatewayOperation.findFirst({
    where: { customerId, expiresAt: { gt: now } },
    select: { id: true, expiresAt: true },
  });
  if (operation) {
    throw new ConflictException('支付操作正在处理中，请稍后再注销账户');
  }
  await transaction.customerGatewayOperation.deleteMany({
    where: { customerId, expiresAt: { lte: now } },
  });
}

/**
 * 精确按 token 释放；失败时 lease 会自然过期。释放本身不读取或恢复客户资料。
 */
export function releaseCustomerGatewayOperation(
  client: Pick<Prisma.TransactionClient, 'customerGatewayOperation'>,
  lease: CustomerGatewayOperationLease,
) {
  return client.customerGatewayOperation.deleteMany({
    where: {
      id: lease.id,
      customerId: lease.customerId,
      authVersion: lease.authVersion,
    },
  });
}
