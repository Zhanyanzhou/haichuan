import type { AddressInfo } from 'node:net';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { PaymentGatewayService } from '../../common/payment-gateway/payment-gateway.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { OrdersService } from '../orders/orders.service';
import { CustomerPaymentsController } from './customer-payments.controller';
import { PaymentsService } from './payments.service';

export const JWT_SECRET = 'customer-payment-http-jwt-secret-32-bytes';
export const SIMULATOR_SECRET =
  'customer-payment-http-simulator-secret-32-bytes';

type StoredPayment = {
  id: number;
  paymentNo: string;
  orderId: number;
  amount: Prisma.Decimal;
  method: string;
  type: string;
  status: string;
  gatewayTradeNo: string | null;
  reviewNote: string | null;
  createdAt: Date;
};

type StoredGatewayOperation = {
  id: string;
  customerId: number;
  authVersion: number;
  kind: string;
  orderId: number;
  paymentId: number | null;
  expiresAt: Date;
};

function sqlText(query: unknown): string {
  const strings = (query as { strings?: readonly string[] } | undefined)?.strings;
  return strings ? strings.join('?') : '';
}

function matchesStatus(value: string, condition: unknown): boolean {
  if (typeof condition === 'string') return value === condition;
  const candidate = condition as { in?: string[] } | undefined;
  return candidate?.in ? candidate.in.includes(value) : true;
}

export function createPersistenceHarness() {
  const customer = {
    id: 7,
    name: '支付测试客户',
    phone: '13800000000',
    email: null,
    authVersion: 2,
    accountType: 'PERSONAL',
    partnerStatus: 'NONE',
    status: 'ACTIVE',
  };
  const otherCustomer = {
    ...customer,
    id: 8,
    name: '其他客户',
    phone: '13900000000',
  };
  const order = {
    id: 9,
    customerId: customer.id,
    orderNo: 'ORD-HTTP-SIM-9',
    status: 'PENDING_PAYMENT',
    finalAmount: new Prisma.Decimal('88.80'),
    depositAmount: new Prisma.Decimal('0'),
    balanceAmount: new Prisma.Decimal('88.80'),
    currency: 'CNY',
    quoteChannel: 'RETAIL',
    quotationVersionId: null,
    paymentMethod: null as string | null,
    paymentPlans: [] as Array<{ id: number }>,
  };
  const payments: StoredPayment[] = [];
  const operations: StoredGatewayOperation[] = [];
  let paymentSequence = 1;

  const customerGatewayOperation = {
    deleteMany: async ({ where }: any) => {
      const before = operations.length;
      for (let index = operations.length - 1; index >= 0; index -= 1) {
        const operation = operations[index];
        if (where.id !== undefined && operation.id !== where.id) continue;
        if (
          where.customerId !== undefined &&
          operation.customerId !== where.customerId
        ) {
          continue;
        }
        if (
          where.authVersion !== undefined &&
          operation.authVersion !== where.authVersion
        ) {
          continue;
        }
        if (where.expiresAt?.lte && operation.expiresAt > where.expiresAt.lte) {
          continue;
        }
        operations.splice(index, 1);
      }
      return { count: before - operations.length };
    },
    findFirst: async ({ where }: any) =>
      operations.find((operation) => {
        if (
          where.customerId !== undefined &&
          operation.customerId !== where.customerId
        ) {
          return false;
        }
        if (where.orderId !== undefined && operation.orderId !== where.orderId) {
          return false;
        }
        if (where.kind?.not && operation.kind === where.kind.not) return false;
        if (where.expiresAt?.gt && operation.expiresAt <= where.expiresAt.gt) {
          return false;
        }
        return true;
      }) ?? null,
    create: async ({ data }: any) => {
      const operation = { ...data } as StoredGatewayOperation;
      operations.push(operation);
      return operation;
    },
    update: async ({ where, data }: any) => {
      const operation = operations.find((item) => item.id === where.id);
      if (!operation) throw new Error('gateway operation missing');
      Object.assign(operation, data);
      return operation;
    },
    updateMany: async ({ where, data }: any) => {
      const operation = operations.find(
        (item) =>
          item.id === where.id &&
          item.customerId === where.customerId &&
          item.authVersion === where.authVersion &&
          (!where.expiresAt?.gt || item.expiresAt > where.expiresAt.gt),
      );
      if (!operation) return { count: 0 };
      Object.assign(operation, data);
      return { count: 1 };
    },
  };

  const prisma: any = {
    $queryRaw: async (query: unknown) => {
      const text = sqlText(query);
      const values = (query as { values?: unknown[] } | undefined)?.values ?? [];
      if (text.includes('FROM customers')) {
        const [customerId, authVersion] = values.map(Number);
        const candidate = customerId === customer.id
          ? customer
          : customerId === otherCustomer.id
            ? otherCustomer
            : null;
        return candidate &&
          authVersion === candidate.authVersion &&
          candidate.status === 'ACTIVE'
          ? [{ id: candidate.id }]
          : [];
      }
      if (text.includes('FROM orders')) {
        return Number(values[0]) === order.id ? [{ id: order.id }] : [];
      }
      if (text.includes('FROM inventory_reservations')) return [{ id: 91 }];
      return [];
    },
    customer: {
      findFirst: async ({ where }: any) => {
        const candidate = where.id === customer.id
          ? customer
          : where.id === otherCustomer.id
            ? otherCustomer
            : null;
        return candidate && candidate.authVersion === where.authVersion
          ? candidate
          : null;
      },
    },
    customerGatewayOperation,
    order: {
      findUnique: async ({ where }: any) =>
        where.id === order.id ? { ...order } : null,
      findFirst: async ({ where }: any) =>
        where.id === order.id && where.customerId === order.customerId
          ? { id: order.id, orderNo: order.orderNo, status: order.status }
          : null,
      update: async ({ where, data }: any) => {
        if (where.id !== order.id) throw new Error('order missing');
        Object.assign(order, data);
        return order;
      },
    },
    inventoryReservation: {
      findFirst: async () => ({
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      }),
    },
    payment: {
      findFirst: async ({ where }: any) => {
        let candidates = [...payments];
        if (where.orderId !== undefined) {
          candidates = candidates.filter((item) => item.orderId === where.orderId);
        }
        if (where.method?.in) {
          candidates = candidates.filter((item) => where.method.in.includes(item.method));
        }
        if (where.status !== undefined) {
          candidates = candidates.filter((item) =>
            matchesStatus(item.status, where.status),
          );
        }
        if (where.id?.not !== undefined) {
          candidates = candidates.filter((item) => item.id !== where.id.not);
        }
        if (where.gatewayTradeNo !== undefined) {
          candidates = candidates.filter(
            (item) => item.gatewayTradeNo === where.gatewayTradeNo,
          );
        }
        return candidates.at(-1) ?? null;
      },
      findMany: async ({ where }: any) =>
        payments.filter(
          (item) =>
            (where.orderId === undefined || item.orderId === where.orderId) &&
            (where.status === undefined || matchesStatus(item.status, where.status)),
        ),
      create: async ({ data }: any) => {
        const payment: StoredPayment = {
          id: paymentSequence++,
          paymentNo: data.paymentNo,
          orderId: data.orderId,
          amount: new Prisma.Decimal(data.amount),
          method: data.method,
          type: data.type,
          status: data.status,
          gatewayTradeNo: null,
          reviewNote: null,
          createdAt: new Date(),
        };
        payments.push(payment);
        return payment;
      },
      findUnique: async ({ where }: any) =>
        payments.find(
          (item) =>
            (where.id !== undefined && item.id === where.id) ||
            (where.paymentNo !== undefined && item.paymentNo === where.paymentNo),
        ) ?? null,
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const payment of payments) {
          if (where.id !== undefined && payment.id !== where.id) continue;
          if (where.status !== undefined && !matchesStatus(payment.status, where.status)) {
            continue;
          }
          if (
            where.OR &&
            !where.OR.some((condition: any) =>
              condition.reviewNote === null
                ? payment.reviewNote === null
                : payment.reviewNote === condition.reviewNote,
            )
          ) {
            continue;
          }
          Object.assign(payment, data);
          count += 1;
        }
        return { count };
      },
    },
  };
  prisma.$transaction = async (action: (transaction: typeof prisma) => unknown) =>
    action(prisma);

  const ordersService = {
    confirmPaymentSettlement: async (
      paymentId: number,
      _reviewerId: unknown,
      _reviewNote: unknown,
      _operator: unknown,
      gateway: { tradeNo?: string },
    ) => {
      const payment = payments.find((item) => item.id === paymentId);
      if (!payment) throw new Error('payment missing');
      payment.status = 'PAID';
      payment.gatewayTradeNo = gateway.tradeNo ?? null;
      return payment;
    },
    failPendingPaymentAttempt: async (paymentId: number) => {
      const payment = payments.find((item) => item.id === paymentId);
      if (!payment) throw new Error('payment missing');
      payment.status = 'FAILED';
      return payment;
    },
  };

  return { prisma, ordersService, payments, operations };
}

let activeHarness = createPersistenceHarness();
let activeConfig: Record<string, string> = {};

@Module({
  imports: [JwtModule.register({ secret: JWT_SECRET })],
  controllers: [CustomerPaymentsController],
  providers: [
    {
      provide: ConfigService,
      useFactory: () => ({ get: (key: string) => activeConfig[key] }),
    },
    { provide: PrismaService, useFactory: () => activeHarness.prisma },
    { provide: OrdersService, useFactory: () => activeHarness.ordersService },
    PaymentGatewayService,
    PaymentsService,
    CustomerAuthGuard,
    CustomerCommerceGuard,
  ],
})
class CustomerPaymentSimulatorHttpModule {}

export async function startHttpCandidate(
  simulatorBaseUrl: string,
  scenario: 'success' | 'pending',
  port = 0,
) {
  activeHarness = createPersistenceHarness();
  activeConfig = {
    RELEASE_PROFILE: 'commerce',
    PAYMENT_PROVIDER_MODE: 'simulator',
    PAYMENT_SIMULATOR_BASE_URL: simulatorBaseUrl,
    PAYMENT_SIMULATOR_SCENARIO: scenario,
    PAYMENT_SIMULATOR_SIGNING_SECRET: SIMULATOR_SECRET,
    PAYMENT_GATEWAY_TRANSACTIONS_ENABLED: 'true',
    PAYMENT_GATEWAY_REFUNDS_ENABLED: 'true',
    SITE_BASE_URL: 'https://shop.example.test',
  };
  const app = await NestFactory.create(CustomerPaymentSimulatorHttpModule, {
    logger: false,
    abortOnError: false,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(port, '127.0.0.1');
  const activePort = (app.getHttpServer().address() as AddressInfo).port;
  return {
    app,
    baseUrl: `http://127.0.0.1:${activePort}/api`,
    harness: activeHarness,
  };
}
