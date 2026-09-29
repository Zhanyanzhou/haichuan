import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from './payments.service';

const config = {
  get: (key: string) =>
    key === 'SITE_BASE_URL' ? 'https://shop.example.test' : undefined,
} as ConfigService;

const CUSTOMER = { id: 7, authVersion: 1 };

function createGatewayOperationStore() {
  const operations: Array<Record<string, any>> = [];
  let lastBoundPaymentId: number | null = null;
  let lastCreatedKind: string | null = null;
  const delegate = {
    findFirst: async ({ where }: any = {}) => operations.find((operation) => {
      if (where?.customerId !== undefined && operation.customerId !== where.customerId) return false;
      if (where?.orderId !== undefined && operation.orderId !== where.orderId) return false;
      if (where?.kind?.not !== undefined && operation.kind === where.kind.not) return false;
      if (where?.expiresAt?.gt && operation.expiresAt <= where.expiresAt.gt) return false;
      return true;
    }) ?? null,
    create: async ({ data }: any) => {
      const operation = { ...data };
      operations.push(operation);
      lastCreatedKind = data.kind;
      return operation;
    },
    update: async ({ where, data }: any) => {
      const operation = operations.find((candidate) => candidate.id === where.id);
      if (operation) Object.assign(operation, data);
      return operation ?? null;
    },
    updateMany: async ({ where, data }: any) => {
      const operation = operations.find((candidate) => (
        candidate.id === where.id
        && candidate.customerId === where.customerId
        && candidate.authVersion === where.authVersion
        && candidate.expiresAt > where.expiresAt.gt
      ));
      if (!operation) return { count: 0 };
      Object.assign(operation, data);
      lastBoundPaymentId = data.paymentId;
      return { count: 1 };
    },
    deleteMany: async ({ where }: any) => {
      const before = operations.length;
      for (let index = operations.length - 1; index >= 0; index -= 1) {
        const operation = operations[index];
        if (where.id && operation.id !== where.id) continue;
        if (where.customerId !== undefined && operation.customerId !== where.customerId) continue;
        if (where.authVersion !== undefined && operation.authVersion !== where.authVersion) continue;
        if (where.expiresAt?.lte && operation.expiresAt > where.expiresAt.lte) continue;
        operations.splice(index, 1);
      }
      return { count: before - operations.length };
    },
  };
  return {
    delegate,
    current: () => operations[0] ?? null,
    lastBoundPaymentId: () => lastBoundPaymentId,
    lastCreatedKind: () => lastCreatedKind,
  };
}

test('客户不能为不属于自己的订单创建支付交易', async () => {
  let gatewayCalls = 0;
  const gatewayOperations = createGatewayOperationStore();
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customerGatewayOperation: gatewayOperations.delegate,
    order: {
      findUnique: async () => ({
        id: 9,
        customerId: 8,
        orderNo: 'ORD-9',
        status: 'PENDING_PAYMENT',
        finalAmount: 100,
      }),
    },
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as unknown as PrismaService,
    {} as OrdersService,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
      createPayment: async () => {
        gatewayCalls += 1;
      },
    } as never,
    config,
  );

  await assert.rejects(
    () => service.createCustomerPayment(CUSTOMER, 9, { scene: 'native' }),
    NotFoundException,
  );
  assert.equal(gatewayCalls, 0);
});

test('手机客户复用同一待支付商户单号，并由服务端传递 H5 场景和真实 IP', async () => {
  let captured: Record<string, unknown> | undefined;
  let localCreates = 0;
  const gatewayOperations = createGatewayOperationStore();
  const tx = {
    $queryRaw: async () => [{ id: 9 }],
    customerGatewayOperation: gatewayOperations.delegate,
    order: {
      findUnique: async () => ({
        id: 9,
        customerId: 7,
        orderNo: 'ORD-9',
        status: 'PENDING_PAYMENT',
        finalAmount: 100,
      }),
      update: async () => undefined,
    },
    payment: {
      findFirst: async () => ({
        id: 3,
        paymentNo: 'PAY-9',
        amount: 100,
        method: 'wechat',
        status: 'PENDING',
      }),
      findMany: async () => [],
      create: async () => {
        localCreates += 1;
      },
    },
    inventoryReservation: {
      findFirst: async () => ({ expiresAt: new Date(Date.now() + 60_000) }),
    },
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      customerGatewayOperation: gatewayOperations.delegate,
    } as unknown as PrismaService,
    {} as OrdersService,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
      createPayment: async (_provider: string, params: Record<string, unknown>) => {
        captured = params;
        return {
          provider: 'wechat',
          scene: 'h5',
          payUrl: 'https://wx.example/h5?prepay=1',
        };
      },
    } as never,
    config,
  );

  const result = await service.createCustomerPayment(CUSTOMER, 9, {
    scene: 'h5',
    clientIp: '203.0.113.10',
    h5Type: 'Android',
  });

  assert.equal(captured?.paymentNo, 'PAY-9');
  assert.equal(captured?.scene, 'h5');
  assert.equal(captured?.clientIp, '203.0.113.10');
  assert.equal(localCreates, 0);
  assert.equal(result.reused, true);
  assert.match(result.payUrl || '', /redirect_url=/);
  assert.equal(gatewayOperations.current(), null);
});

test('客户主动查单确认 SUCCESS 时复用回调核销管线', async () => {
  let approvedPaymentId: number | null = null;
  let settlementPrincipal: Record<string, unknown> | undefined;
  const gatewayOperations = createGatewayOperationStore();
  const payment = {
    id: 3,
    paymentNo: 'PAY-9',
    orderId: 9,
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (tx: any) => Promise<unknown>) =>
        callback({
          $queryRaw: async () => [{ id: 7 }],
          customerGatewayOperation: gatewayOperations.delegate,
        }),
      customerGatewayOperation: gatewayOperations.delegate,
      order: {
        findFirst: async () => ({ id: 9, orderNo: 'ORD-9', status: 'PENDING_PAYMENT' }),
      },
      payment: {
        findFirst: async ({ where }: any) => where?.id?.not ? null : payment,
        findUnique: async () => payment,
      },
    } as unknown as PrismaService,
    {
      confirmPaymentSettlement: async (paymentId: number, ...args: any[]) => {
        approvedPaymentId = paymentId;
        settlementPrincipal = args[4]?.customerPrincipal;
      },
    } as unknown as OrdersService,
    {
      queryPayment: async () => ({
        provider: 'wechat',
        paymentNo: 'PAY-9',
        gatewayTradeNo: 'WX-9',
        state: 'SUCCESS',
        amountYuan: '100.00',
        raw: { trade_state: 'SUCCESS' },
      }),
    } as never,
    config,
  );

  const result = await service.queryCustomerPayment(CUSTOMER, 9);
  assert.equal(result.state, 'PAID');
  assert.equal(approvedPaymentId, 3);
  assert.deepEqual(settlementPrincipal, CUSTOMER);
  assert.equal(gatewayOperations.lastBoundPaymentId(), 3);
  assert.equal(gatewayOperations.lastCreatedKind(), 'QUERY_PAYMENT');
  assert.equal(gatewayOperations.current(), null);
});

test('客户关单会先查单，只有 NOTPAY 才关闭渠道并把本地交易置为 FAILED', async () => {
  let closedPaymentNo: string | null = null;
  let failedPaymentId: number | null = null;
  let failureActor: Record<string, unknown> | undefined;
  let failurePrincipal: Record<string, unknown> | undefined;
  const gatewayOperations = createGatewayOperationStore();
  const payment = {
    id: 3,
    paymentNo: 'PAY-9',
    orderId: 9,
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (tx: any) => Promise<unknown>) =>
        callback({
          $queryRaw: async () => [{ id: 7 }],
          customerGatewayOperation: gatewayOperations.delegate,
        }),
      customerGatewayOperation: gatewayOperations.delegate,
      order: {
        findFirst: async () => ({ id: 9, orderNo: 'ORD-9', status: 'PENDING_PAYMENT' }),
      },
      payment: {
        findFirst: async () => payment,
      },
    } as unknown as PrismaService,
    {
      failPendingPaymentAttempt: async (
        paymentId: number,
        _reason: string,
        actor: Record<string, unknown>,
        options: { customerPrincipal?: Record<string, unknown> },
      ) => {
        failedPaymentId = paymentId;
        failureActor = actor;
        failurePrincipal = options.customerPrincipal;
        return { ...payment, status: 'FAILED' };
      },
    } as unknown as OrdersService,
    {
      queryPayment: async () => ({
        provider: 'wechat',
        paymentNo: 'PAY-9',
        state: 'NOTPAY',
        raw: { trade_state: 'NOTPAY' },
      }),
      closePayment: async (_provider: string, paymentNo: string) => {
        closedPaymentNo = paymentNo;
      },
    } as never,
    config,
  );

  const result = await service.closeCustomerPayment(CUSTOMER, 9);
  assert.equal(result.state, 'FAILED');
  assert.equal(closedPaymentNo, 'PAY-9');
  assert.equal(failedPaymentId, 3);
  assert.deepEqual(failureActor, { type: 'SYSTEM' });
  assert.deepEqual(failurePrincipal, CUSTOMER);
  assert.equal(gatewayOperations.lastBoundPaymentId(), 3);
  assert.equal(gatewayOperations.current(), null);
});

test('注销先提交后旧 principal 不能创建、查单或关单且不会调用支付渠道', async () => {
  let orderReads = 0;
  let gatewayCalls = 0;
  const service = new PaymentsService(
    {
      $transaction: async (callback: (tx: { $queryRaw: () => Promise<never[]> }) => Promise<unknown>) =>
        callback({ $queryRaw: async () => [] }),
      order: {
        findFirst: async () => {
          orderReads += 1;
          return null;
        },
      },
    } as unknown as PrismaService,
    {} as OrdersService,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
      createPayment: async () => {
        gatewayCalls += 1;
        throw new Error('不应创建支付交易');
      },
      queryPayment: async () => {
        gatewayCalls += 1;
        throw new Error('不应调用支付渠道');
      },
    } as never,
    config,
  );

  await assert.rejects(
    () => service.createCustomerPayment(CUSTOMER, 9, { scene: 'native' }),
    UnauthorizedException,
  );
  await assert.rejects(
    () => service.queryCustomerPayment(CUSTOMER, 9),
    UnauthorizedException,
  );
  await assert.rejects(
    () => service.closeCustomerPayment(CUSTOMER, 9),
    UnauthorizedException,
  );
  assert.equal(orderReads, 0);
  assert.equal(gatewayCalls, 0);
});

test('客户查单外调返回后 authVersion 已变化时不核销且释放 operation', async () => {
  let transactionCalls = 0;
  let gatewayCalls = 0;
  let settlementWrites = 0;
  const gatewayOperations = createGatewayOperationStore();
  const payment = {
    id: 3,
    paymentNo: 'PAY-9',
    orderId: 9,
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (tx: any) => Promise<unknown>) => {
        transactionCalls += 1;
        const activeForThisTransaction = transactionCalls < 3;
        return callback({
          $queryRaw: async () => activeForThisTransaction ? [{ id: 7 }] : [],
          customerGatewayOperation: gatewayOperations.delegate,
        });
      },
      customerGatewayOperation: gatewayOperations.delegate,
      order: {
        findFirst: async () => ({ id: 9, orderNo: 'ORD-9', status: 'PENDING_PAYMENT' }),
      },
      payment: {
        findFirst: async () => payment,
        findUnique: async () => payment,
      },
    } as unknown as PrismaService,
    {
      confirmPaymentSettlement: async () => {
        settlementWrites += 1;
      },
    } as unknown as OrdersService,
    {
      queryPayment: async () => {
        gatewayCalls += 1;
        return {
          provider: 'wechat',
          paymentNo: 'PAY-9',
          gatewayTradeNo: 'WX-9',
          state: 'SUCCESS',
          amountYuan: '100.00',
          raw: { trade_state: 'SUCCESS' },
        };
      },
    } as never,
    config,
  );

  await assert.rejects(
    () => service.queryCustomerPayment(CUSTOMER, 9),
    UnauthorizedException,
  );
  assert.equal(gatewayCalls, 1);
  assert.equal(settlementWrites, 0);
  assert.equal(gatewayOperations.current(), null);
});

test('客户查单续租后 authVersion 才变化时不写渠道异常对账备注', async () => {
  let transactionCalls = 0;
  let gatewayCalls = 0;
  let reviewNoteWrites = 0;
  const gatewayOperations = createGatewayOperationStore();
  const payment = {
    id: 3,
    paymentNo: 'PAY-9',
    orderId: 9,
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (tx: any) => Promise<unknown>) => {
        transactionCalls += 1;
        const activeForThisTransaction = transactionCalls < 4;
        return callback({
          $queryRaw: async () => activeForThisTransaction ? [{ id: 7 }] : [],
          customerGatewayOperation: gatewayOperations.delegate,
          payment: {
            updateMany: async () => {
              reviewNoteWrites += 1;
              return { count: 1 };
            },
          },
        });
      },
      customerGatewayOperation: gatewayOperations.delegate,
      order: {
        findFirst: async () => ({ id: 9, orderNo: 'ORD-9', status: 'PENDING_PAYMENT' }),
      },
      payment: {
        findFirst: async () => payment,
        findUnique: async () => payment,
      },
    } as unknown as PrismaService,
    {} as OrdersService,
    {
      queryPayment: async () => {
        gatewayCalls += 1;
        return {
          provider: 'wechat',
          paymentNo: 'PAY-9',
          gatewayTradeNo: 'WX-9',
          state: 'SUCCESS',
          amountYuan: '99.00',
          raw: { trade_state: 'SUCCESS' },
        };
      },
    } as never,
    config,
  );

  await assert.rejects(
    () => service.queryCustomerPayment(CUSTOMER, 9),
    UnauthorizedException,
  );
  assert.equal(gatewayCalls, 1);
  assert.equal(reviewNoteWrites, 0);
  assert.equal(gatewayOperations.current(), null);
});

test('客户关单外调完成后 authVersion 已变化时不写本地 FAILED', async () => {
  let transactionCalls = 0;
  let queryCalls = 0;
  let closeCalls = 0;
  let failedWrites = 0;
  const gatewayOperations = createGatewayOperationStore();
  const payment = {
    id: 3,
    paymentNo: 'PAY-9',
    orderId: 9,
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (tx: any) => Promise<unknown>) => {
        transactionCalls += 1;
        const activeForThisTransaction = transactionCalls < 4;
        return callback({
          $queryRaw: async () => activeForThisTransaction ? [{ id: 7 }] : [],
          customerGatewayOperation: gatewayOperations.delegate,
        });
      },
      customerGatewayOperation: gatewayOperations.delegate,
      order: {
        findFirst: async () => ({ id: 9, orderNo: 'ORD-9', status: 'PENDING_PAYMENT' }),
      },
      payment: {
        findFirst: async () => payment,
      },
    } as unknown as PrismaService,
    {
      failPendingPaymentAttempt: async () => {
        failedWrites += 1;
      },
    } as unknown as OrdersService,
    {
      queryPayment: async () => {
        queryCalls += 1;
        return {
          provider: 'wechat',
          paymentNo: 'PAY-9',
          state: 'NOTPAY',
          raw: { trade_state: 'NOTPAY' },
        };
      },
      closePayment: async () => {
        closeCalls += 1;
      },
    } as never,
    config,
  );

  await assert.rejects(
    () => service.closeCustomerPayment(CUSTOMER, 9),
    UnauthorizedException,
  );
  assert.equal(queryCalls, 1);
  assert.equal(closeCalls, 1);
  assert.equal(failedWrites, 0);
  assert.equal(gatewayOperations.current(), null);
});

test('预下单响应丢失后 authVersion 已变化时不写旧会话对账备注', async () => {
  let transactionCalls = 0;
  let gatewayCalls = 0;
  let reviewNoteWrites = 0;
  const gatewayOperations = createGatewayOperationStore();
  const payment = {
    id: 3,
    paymentNo: 'PAY-9',
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
  };
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    customerGatewayOperation: gatewayOperations.delegate,
    order: {
      findUnique: async () => ({
        id: 9,
        customerId: 7,
        orderNo: 'ORD-9',
        status: 'PENDING_PAYMENT',
        finalAmount: 100,
      }),
      update: async () => undefined,
    },
    payment: {
      findFirst: async () => payment,
      findMany: async () => [],
    },
    inventoryReservation: {
      findFirst: async () => ({ expiresAt: new Date(Date.now() + 60_000) }),
    },
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (client: any) => Promise<unknown>) => {
        transactionCalls += 1;
        if (transactionCalls < 3) return callback(tx);
        return callback({
          ...tx,
          $queryRaw: async () => [],
        });
      },
      customerGatewayOperation: gatewayOperations.delegate,
      payment: {
        updateMany: async () => {
          reviewNoteWrites += 1;
          return { count: 1 };
        },
      },
    } as unknown as PrismaService,
    {} as OrdersService,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
      createPayment: async () => {
        gatewayCalls += 1;
        throw new Error('synthetic response lost after acceptance');
      },
    } as never,
    config,
  );

  await assert.rejects(
    () => service.createCustomerPayment(CUSTOMER, 9, { scene: 'native' }),
    UnauthorizedException,
  );
  assert.equal(gatewayCalls, 1);
  assert.equal(reviewNoteWrites, 0);
  assert.equal(gatewayOperations.current(), null);
});

test('预下单准备已提交但注销先于外调完成时 CAS 失败且支付渠道零调用', async () => {
  let gatewayCalls = 0;
  const gatewayOperations = createGatewayOperationStore();
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    customerGatewayOperation: {
      ...gatewayOperations.delegate,
      updateMany: async () => ({ count: 0 }),
    },
    order: {
      findUnique: async () => ({
        id: 9,
        customerId: 7,
        orderNo: 'ORD-9',
        status: 'PENDING_PAYMENT',
        finalAmount: 100,
      }),
      update: async () => undefined,
    },
    payment: {
      findFirst: async () => ({
        id: 3,
        paymentNo: 'PAY-9',
        amount: 100,
        method: 'wechat',
        status: 'PENDING',
      }),
      findMany: async () => [],
    },
    inventoryReservation: {
      findFirst: async () => ({ expiresAt: new Date(Date.now() + 60_000) }),
    },
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      customerGatewayOperation: gatewayOperations.delegate,
    } as unknown as PrismaService,
    {} as OrdersService,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
      createPayment: async () => {
        gatewayCalls += 1;
        throw new Error('不应调用支付渠道');
      },
    } as never,
    config,
  );

  await assert.rejects(
    () => service.createCustomerPayment(CUSTOMER, 9, { scene: 'native' }),
    ConflictException,
  );
  assert.equal(gatewayCalls, 0);
  assert.equal(gatewayOperations.current(), null);
});

test('关单预约已提交但注销先于外调完成时 CAS 失败且查单与关单均零调用', async () => {
  let gatewayCalls = 0;
  const gatewayOperations = createGatewayOperationStore();
  const payment = {
    id: 3,
    paymentNo: 'PAY-9',
    orderId: 9,
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
        $queryRaw: async () => [{ id: 7 }],
        customerGatewayOperation: {
          ...gatewayOperations.delegate,
          updateMany: async () => ({ count: 0 }),
        },
      }),
      customerGatewayOperation: gatewayOperations.delegate,
      order: {
        findFirst: async () => ({ id: 9, orderNo: 'ORD-9', status: 'PENDING_PAYMENT' }),
      },
      payment: {
        findFirst: async () => payment,
      },
    } as unknown as PrismaService,
    {} as OrdersService,
    {
      queryPayment: async () => {
        gatewayCalls += 1;
        throw new Error('不应查询支付渠道');
      },
      closePayment: async () => {
        gatewayCalls += 1;
        throw new Error('不应关闭支付渠道');
      },
    } as never,
    config,
  );

  await assert.rejects(
    () => service.closeCustomerPayment(CUSTOMER, 9),
    ConflictException,
  );
  assert.equal(gatewayCalls, 0);
  assert.equal(gatewayOperations.current(), null);
});

test('渠道可能已受理预下单但响应丢失时保留 PENDING 对账状态并释放 operation', async () => {
  const gatewayOperations = createGatewayOperationStore();
  let accepted = 0;
  let reconciliationWrite: any;
  const payment = {
    id: 3,
    paymentNo: 'PAY-9',
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
  };
  const tx = {
    $queryRaw: async () => [{ id: 7 }],
    customerGatewayOperation: gatewayOperations.delegate,
    order: {
      findUnique: async () => ({
        id: 9,
        customerId: 7,
        orderNo: 'ORD-9',
        status: 'PENDING_PAYMENT',
        finalAmount: 100,
      }),
      update: async () => undefined,
    },
    payment: {
      findFirst: async () => payment,
      findMany: async () => [],
      updateMany: async (args: any) => {
        reconciliationWrite = args;
        return { count: 1 };
      },
    },
    inventoryReservation: {
      findFirst: async () => ({ expiresAt: new Date(Date.now() + 60_000) }),
    },
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      customerGatewayOperation: gatewayOperations.delegate,
      payment: {
        updateMany: async (args: any) => {
          reconciliationWrite = args;
          return { count: 1 };
        },
      },
    } as unknown as PrismaService,
    {} as OrdersService,
    {
      isTransactionCreationEnabled: () => true,
      isAvailable: () => true,
      createPayment: async () => {
        accepted += 1;
        throw new Error('synthetic response lost after acceptance');
      },
    } as never,
    config,
  );

  await assert.rejects(
    () => service.createCustomerPayment(CUSTOMER, 9, { scene: 'native' }),
    /response lost/,
  );
  assert.equal(accepted, 1);
  assert.deepEqual(reconciliationWrite.where, { id: 3, status: 'PENDING' });
  assert.match(reconciliationWrite.data.reviewNote, /结果未确认/);
  assert.equal(gatewayOperations.current(), null);
});

test('渠道关单可能已受理但响应丢失时不写 FAILED，保留 PENDING 供系统查单', async () => {
  const gatewayOperations = createGatewayOperationStore();
  let accepted = 0;
  let reconciliationWrite: any;
  let failedWrites = 0;
  const payment = {
    id: 3,
    paymentNo: 'PAY-9',
    orderId: 9,
    amount: 100,
    method: 'wechat',
    status: 'PENDING',
  };
  const service = new PaymentsService(
    {
      $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
        $queryRaw: async () => [{ id: 7 }],
        customerGatewayOperation: gatewayOperations.delegate,
        payment: {
          updateMany: async (args: any) => {
            reconciliationWrite = args;
            return { count: 1 };
          },
        },
      }),
      customerGatewayOperation: gatewayOperations.delegate,
      order: {
        findFirst: async () => ({ id: 9, orderNo: 'ORD-9', status: 'PENDING_PAYMENT' }),
      },
      payment: {
        findFirst: async () => payment,
        updateMany: async (args: any) => {
          reconciliationWrite = args;
          return { count: 1 };
        },
      },
    } as unknown as PrismaService,
    {
      failPendingPaymentAttempt: async () => {
        failedWrites += 1;
      },
    } as unknown as OrdersService,
    {
      queryPayment: async () => ({
        provider: 'wechat',
        paymentNo: 'PAY-9',
        state: 'NOTPAY',
        raw: { trade_state: 'NOTPAY' },
      }),
      closePayment: async () => {
        accepted += 1;
        throw new Error('synthetic close response lost after acceptance');
      },
    } as never,
    config,
  );

  await assert.rejects(
    () => service.closeCustomerPayment(CUSTOMER, 9),
    /close response lost/,
  );
  assert.equal(accepted, 1);
  assert.equal(failedWrites, 0);
  assert.equal(gatewayOperations.lastBoundPaymentId(), 3);
  assert.deepEqual(reconciliationWrite.where, { id: 3, status: 'PENDING', method: 'wechat' });
  assert.match(reconciliationWrite.data.reviewNote, /关单结果未确认/);
  assert.equal(gatewayOperations.current(), null);
});
