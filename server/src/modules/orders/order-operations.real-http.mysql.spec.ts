import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';

const databaseUrl = process.env.ORDER_OPS_REAL_MYSQL_URL?.trim();
const { validateTarget: validateSharedTarget } = require('../../../scripts/run-real-mysql-tests.cjs');

type ApiResult = {
  status: number;
  body: unknown;
  data: any;
};

function validateIsolatedTarget(value: string | undefined) {
  assert.equal(
    process.env.ORDER_OPS_REAL_MYSQL_TEST,
    '1',
    '必须显式声明 ORDER_OPS_REAL_MYSQL_TEST=1',
  );
  assert.ok(value, '必须显式提供 ORDER_OPS_REAL_MYSQL_URL');
  if (
    process.env.REAL_MYSQL_TEST_ISOLATED === '1'
    && value === process.env.REAL_MYSQL_TEST_DATABASE_URL
  ) {
    return validateSharedTarget(process.env);
  }
  const target = new URL(value);
  assert.equal(target.protocol, 'mysql:');
  assert.match(
    target.hostname,
    /^hc-orderops-[a-z0-9-]+-mysql$/,
    '只允许本任务命名的隔离 MySQL 容器',
  );
  assert.equal(target.pathname, '/haichuan_order_ops_test');
  assert.equal(target.username, 'hc_order_ops');
  assert.ok(target.password, '隔离测试数据库必须使用专用密码');
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
  return target.href;
}

function assertStatus(result: ApiResult, expected: number, label: string) {
  assert.equal(
    result.status,
    expected,
    `${label}: expected ${expected}, received ${result.status}, body=${JSON.stringify(result.body)}`,
  );
}

test(
  '真实 Nest HTTP + MySQL：订单、履约、售后与退款后台运营闭环保持权限和状态完整性',
  {
    skip:
      databaseUrl && process.env.ORDER_OPS_REAL_MYSQL_TEST === '1'
        ? false
        : '需要显式提供本任务一次性 ORDER_OPS_REAL_MYSQL_URL',
  },
  async () => {
    assert.equal(process.versions.node.split('.')[0], '22', '真实运营闭环必须在 Node 22 下运行');
    const isolatedDatabaseUrl = validateIsolatedTarget(databaseUrl);
    const runId = process.env.ORDER_OPS_RUN_ID?.trim() || '';
    assert.match(runId, /^[a-z0-9]{6,12}$/, 'ORDER_OPS_RUN_ID 必须是 6-12 位小写字母或数字');
    const apiPort = Number(process.env.ORDER_OPS_API_PORT);
    assert.ok(Number.isInteger(apiPort) && apiPort >= 1024 && apiPort <= 65535);

    const prisma = new PrismaClient({ datasourceUrl: isolatedDatabaseUrl });
    await prisma.$connect();
    const populatedTables = await Promise.all([
      prisma.user.count(),
      prisma.customer.count(),
      prisma.order.count(),
    ]);
    assert.deepEqual(populatedTables, [0, 0, 0], '运营闭环必须从空的一次性业务库开始');

    const password = 'OpsPass9!';
    const passwordHash = await bcrypt.hash(password, 4);
    const users = {} as Record<string, { id: number; username: string }>;
    for (const role of ['ADMIN', 'CUSTOMER_SERVICE', 'WAREHOUSE', 'EDITOR'] as const) {
      const key = role.toLowerCase();
      users[key] = await prisma.user.create({
        data: {
          username: `ops-${key}-${runId}`,
          password: passwordHash,
          realName: `运营验收-${role}`,
          role,
        },
        select: { id: true, username: true },
      });
    }

    const numericRunId = runId.replace(/\D/g, '').slice(-8).padStart(8, '0');
    const customerA = await prisma.customer.create({
      data: {
        phone: `139${numericRunId}`,
        name: `验收客户A-${runId}`,
        passwordHash,
      },
    });
    const customerBPhone = `138${numericRunId}`;
    const customerB = await prisma.customer.create({
      data: {
        phone: customerBPhone,
        name: `验收客户B-${runId}`,
        passwordHash,
      },
    });
    const category = await prisma.category.create({
      data: { name: `运营验收分类-${runId}`, slug: `order-ops-${runId}` },
    });
    const product = await prisma.product.create({
      data: {
        code: `OPS-${runId}`,
        name: `运营验收作品-${runId}`,
        categoryId: category.id,
        salesMode: 'DIRECT_PURCHASE',
      },
    });
    const sku = await prisma.productSKU.create({
      data: {
        productId: product.id,
        skuCode: `OPS-SKU-${runId}`,
        price: 100,
      },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        name: `运营验收仓-${runId}`,
        type: 'FACTORY',
        isDefault: true,
        defaultKey: 'PRIMARY',
      },
    });
    const inventory = await prisma.inventory.create({
      data: { skuId: sku.id, warehouseId: warehouse.id, quantity: 3 },
    });
    const order = await prisma.order.create({
      data: {
        orderNo: `HCOPS${runId.toUpperCase()}`,
        customerId: customerA.id,
        customerName: customerA.name!,
        customerPhone: customerA.phone,
        customerEmail: null,
        address: '深圳市运营验收路 1 号',
        totalAmount: 100,
        finalAmount: 100,
        shippingAddressSnapshot: {
          version: 1,
          recipientName: customerA.name!,
          recipientPhone: customerA.phone,
          detail: '深圳市运营验收路 1 号',
        },
        pricingSnapshot: {
          version: 1,
          currency: 'CNY',
          itemSubtotalCents: 10000,
          discountCents: 0,
          shippingCents: 0,
          insuranceCents: 0,
          taxCents: 0,
          adjustmentCents: 0,
          finalCents: 10000,
        },
        items: {
          create: {
            productId: product.id,
            skuId: sku.id,
            quantity: 1,
            unitPrice: 100,
            subtotal: 100,
            productNameSnapshot: product.name,
            productCodeSnapshot: product.code,
            skuSnapshot: sku.skuCode,
          },
        },
      },
      include: { items: true },
    });
    const orderItem = order.items[0];
    assert.ok(orderItem);

    // AppModule 会在导入时执行运行环境校验；只有显式打开真实数据库门禁后才加载，
    // 避免普通目标单测在本文件被 skip 时仍要求 JWT_SECRET 等运行配置。
    const { AppModule } = await import('../../app.module');
    const app = await NestFactory.create(AppModule, {
      abortOnError: false,
      logger: false,
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.listen(apiPort, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${apiPort}/api`;
    const call = async (
      path: string,
      token?: string,
      init: RequestInit = {},
    ): Promise<ApiResult> => {
      const headers = new Headers(init.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (init.body) headers.set('Content-Type', 'application/json');
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const body = await response.json().catch(() => null);
      const envelope = body as { data?: unknown } | null;
      return {
        status: response.status,
        body,
        data: envelope && 'data' in envelope ? envelope.data : body,
      };
    };
    const loginStaff = async (key: string) => {
      const result = await call('/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ username: users[key].username, password }),
      });
      assertStatus(result, 201, `登录 ${key}`);
      assert.equal(result.data.user.role, key.toUpperCase());
      assert.ok(result.data.accessToken);
      return result.data.accessToken as string;
    };
    const loginCustomer = async (phone: string) => {
      const result = await call('/customers/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
      });
      assertStatus(result, 201, `客户登录 ${phone.slice(-4)}`);
      assert.ok(result.data.accessToken);
      return result.data.accessToken as string;
    };

    try {
      const adminToken = await loginStaff('admin');
      const customerServiceToken = await loginStaff('customer_service');
      const warehouseToken = await loginStaff('warehouse');
      const editorToken = await loginStaff('editor');
      const customerAToken = await loginCustomer(customerA.phone);
      const customerBToken = await loginCustomer(customerBPhone);

      assertStatus(await call('/orders'), 401, '匿名读取订单');
      const adminOrders = await call(`/orders?keyword=${order.orderNo}`, adminToken);
      assertStatus(adminOrders, 200, '管理员读取订单列表');
      assert.equal(adminOrders.data.total, 1);
      assert.equal(adminOrders.data.list[0].status, 'PENDING_PAYMENT');
      assertStatus(await call(`/orders/${order.id}`, customerServiceToken), 200, '客服读取订单详情');
      assertStatus(await call('/orders', warehouseToken), 403, '仓储读取通用订单');
      assertStatus(await call('/orders', editorToken), 403, '编辑读取通用订单');
      assertStatus(await call('/orders', customerAToken), 401, '客户令牌进入后台订单域');

      const gatewayAttempt = await call(`/payments/${order.id}/channel`, adminToken, {
        method: 'POST',
        body: JSON.stringify({ method: 'wechat' }),
      });
      assertStatus(gatewayAttempt, 503, '资金门禁关闭时发起微信支付');
      assert.match(String((gatewayAttempt.body as { message?: string })?.message), /当前已关闭/);
      assert.equal(await prisma.payment.count({ where: { orderId: order.id } }), 0);

      const receipt = await call('/payments/receipt', adminToken, {
        method: 'POST',
        body: JSON.stringify({
          orderId: order.id,
          amount: 100,
          method: 'store',
          type: 'FULL',
          gatewayTradeNo: `STORE-${runId}`,
          reviewNote: '隔离运营验收合成实收',
        }),
      });
      assertStatus(receipt, 201, '登记合成线下实收');
      const paymentId = receipt.data.id as number;
      const paidOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(paidOrder.status, 'PENDING_SHIP');
      assert.equal(Number(paidOrder.paidAmount), 100);
      assert.equal((await prisma.inventory.findUniqueOrThrow({ where: { id: inventory.id } })).quantity, 2);
      const fulfillment = await prisma.fulfillment.findFirstOrThrow({
        where: { orderId: order.id },
        include: { items: true },
      });
      assert.equal(fulfillment.status, 'PENDING_PICK');
      assert.equal(fulfillment.items.length, 1);

      const duplicateReceipt = await call('/payments/receipt', adminToken, {
        method: 'POST',
        body: JSON.stringify({
          orderId: order.id,
          amount: 100,
          method: 'store',
          type: 'FULL',
        }),
      });
      assertStatus(duplicateReceipt, 400, '重复登记同一订单实收');
      assert.equal(await prisma.payment.count({ where: { orderId: order.id } }), 1);

      const warehouseList = await call(`/fulfillments?keyword=${order.orderNo}`, warehouseToken);
      assertStatus(warehouseList, 200, '仓储读取履约最小投影');
      assert.equal(warehouseList.data.total, 1);
      assert.equal(warehouseList.data.list[0].order.customerPhone, `${customerA.phone.slice(0, 3)}****${customerA.phone.slice(-4)}`);

      const dispatchBody = {
        carrier: '隔离承运商',
        trackingNo: `TRACK-${runId}`,
        internalNote: '隔离履约验收',
      };
      assertStatus(
        await call(`/fulfillments/${fulfillment.id}/dispatch`, warehouseToken, {
          method: 'PUT',
          body: JSON.stringify(dispatchBody),
        }),
        200,
        '仓储发货',
      );
      assertStatus(
        await call(`/fulfillments/${fulfillment.id}/dispatch`, warehouseToken, {
          method: 'PUT',
          body: JSON.stringify(dispatchBody),
        }),
        200,
        '相同物流信息重复发货幂等',
      );
      assertStatus(
        await call(`/fulfillments/${fulfillment.id}/dispatch`, warehouseToken, {
          method: 'PUT',
          body: JSON.stringify({ ...dispatchBody, trackingNo: `OTHER-${runId}` }),
        }),
        409,
        '不同物流信息重复发货',
      );
      assertStatus(
        await call(`/orders/${order.id}/status`, adminToken, {
          method: 'PUT',
          body: JSON.stringify({ status: 'COMPLETED' }),
        }),
        400,
        '未送达订单提前完成',
      );
      assertStatus(
        await call(`/fulfillments/${fulfillment.id}/status`, warehouseToken, {
          method: 'PUT',
          body: JSON.stringify({ status: 'ABNORMAL', abnormalReason: '隔离测试物流异常' }),
        }),
        200,
        '标记物流异常',
      );
      assertStatus(
        await call(`/fulfillments/${fulfillment.id}/status`, warehouseToken, {
          method: 'PUT',
          body: JSON.stringify({ status: 'DELIVERED' }),
        }),
        200,
        '物流异常恢复并送达',
      );
      assertStatus(
        await call(`/orders/${order.id}/status`, adminToken, {
          method: 'PUT',
          body: JSON.stringify({ status: 'COMPLETED' }),
        }),
        200,
        '送达后完成订单',
      );

      const customerBOrders = await call('/customers/me/orders', customerBToken);
      assertStatus(customerBOrders, 200, '客户 B 读取本人订单');
      assert.equal(customerBOrders.data.length, 0);
      assertStatus(
        await call(`/customers/me/orders/${order.id}/after-sales`, customerBToken, {
          method: 'POST',
          headers: { 'X-Session-Domain': 'customer' },
          body: JSON.stringify({ orderItemId: orderItem.id, type: 'REFUND', reason: '越权售后' }),
        }),
        404,
        '客户 B 对客户 A 订单发起售后',
      );

      const createdCase = await call(`/customers/me/orders/${order.id}/after-sales`, customerAToken, {
        method: 'POST',
        headers: { 'X-Session-Domain': 'customer' },
        body: JSON.stringify({
          orderItemId: orderItem.id,
          type: 'REFUND',
          reason: '隔离验收退款退货',
        }),
      });
      assertStatus(createdCase, 201, '客户 A 发起本人售后');
      const caseId = createdCase.data.id as number;
      assertStatus(
        await call(`/customers/me/orders/${order.id}/after-sales`, customerAToken, {
          method: 'POST',
          headers: { 'X-Session-Domain': 'customer' },
          body: JSON.stringify({
            orderItemId: orderItem.id,
            type: 'REFUND',
            reason: '重复售后',
          }),
        }),
        409,
        '同一商品重复发起进行中售后',
      );
      assertStatus(
        await call(`/customers/me/after-sales/${caseId}/cancel`, customerBToken, {
          method: 'POST',
          headers: { 'X-Session-Domain': 'customer' },
        }),
        404,
        '客户 B 撤销客户 A 售后',
      );

      const reviewedCase = await call(`/after-sales-cases/${caseId}/review`, customerServiceToken, {
        method: 'PUT',
        body: JSON.stringify({
          action: 'APPROVED',
          approvedRefundAmount: 50,
          adminNote: '客服审核通过隔离售后',
        }),
      });
      assertStatus(reviewedCase, 200, '客服审核售后');
      assert.equal(reviewedCase.data.status, 'APPROVED');
      assertStatus(
        await call(`/after-sales-cases/${caseId}/status`, customerServiceToken, {
          method: 'PUT',
          body: JSON.stringify({ status: 'COMPLETED', adminNote: '不得绕过退款完成' }),
        }),
        400,
        '退款类售后绕过退款直接完成',
      );
      for (const status of ['RETURNING', 'QC_PASSED'] as const) {
        assertStatus(
          await call(`/after-sales-cases/${caseId}/status`, customerServiceToken, {
            method: 'PUT',
            body: JSON.stringify({ status, adminNote: `推进至 ${status}` }),
          }),
          200,
          `推进售后至 ${status}`,
        );
      }

      const refundInput = {
        orderId: order.id,
        paymentId,
        amount: 50,
        reason: '隔离验收部分退款',
        idempotencyKey: `ops-refund-${runId}`,
        afterSalesCaseId: caseId,
      };
      assertStatus(
        await call('/refunds', customerServiceToken, {
          method: 'POST',
          body: JSON.stringify(refundInput),
        }),
        403,
        '客服越权创建退款',
      );
      const createdRefund = await call('/refunds', adminToken, {
        method: 'POST',
        body: JSON.stringify(refundInput),
      });
      assertStatus(createdRefund, 201, '管理员创建关联售后退款');
      const refundId = createdRefund.data.id as number;
      const duplicateRefund = await call('/refunds', adminToken, {
        method: 'POST',
        body: JSON.stringify(refundInput),
      });
      assertStatus(duplicateRefund, 201, '相同幂等键重复创建退款');
      assert.equal(duplicateRefund.data.id, refundId);
      assertStatus(
        await call('/refunds', adminToken, {
          method: 'POST',
          body: JSON.stringify({ ...refundInput, amount: 49 }),
        }),
        409,
        '复用幂等键篡改退款金额',
      );
      assert.equal(await prisma.refund.count({ where: { orderId: order.id } }), 1);

      const approvedRefund = await call(`/refunds/${refundId}/review`, adminToken, {
        method: 'PUT',
        body: JSON.stringify({ action: 'APPROVED', reviewNote: '隔离退款审核通过' }),
      });
      assertStatus(approvedRefund, 200, '管理员审核退款');
      assert.equal(approvedRefund.data.status, 'APPROVED');
      assertStatus(
        await call(`/refunds/${refundId}/review`, customerServiceToken, {
          method: 'PUT',
          body: JSON.stringify({ action: 'APPROVED' }),
        }),
        403,
        '客服越权审核退款',
      );
      assertStatus(await call('/refunds', warehouseToken), 403, '仓储读取退款数据');

      const failedExecution = await call(`/refunds/${refundId}/execute`, adminToken, {
        method: 'PUT',
        body: JSON.stringify({ action: 'FAILED', reviewNote: '隔离退款执行失败，待重试' }),
      });
      assertStatus(failedExecution, 200, '记录线下退款失败');
      assert.equal(failedExecution.data.status, 'APPROVED');
      const refundReference = `STORE-REFUND-${runId}`;
      const completedRefund = await call(`/refunds/${refundId}/execute`, adminToken, {
        method: 'PUT',
        body: JSON.stringify({ action: 'COMPLETED', gatewayRefundNo: refundReference }),
      });
      assertStatus(completedRefund, 200, '失败后重试完成线下退款');
      assert.equal(completedRefund.data.status, 'COMPLETED');
      assertStatus(
        await call(`/refunds/${refundId}/execute`, adminToken, {
          method: 'PUT',
          body: JSON.stringify({ action: 'COMPLETED', gatewayRefundNo: refundReference }),
        }),
        200,
        '相同退款流水重复完成幂等',
      );
      assertStatus(
        await call(`/refunds/${refundId}/execute`, adminToken, {
          method: 'PUT',
          body: JSON.stringify({ action: 'COMPLETED', gatewayRefundNo: `OTHER-${runId}` }),
        }),
        409,
        '不同退款流水重复完成',
      );

      const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      const finalPayment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const finalFulfillment = await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } });
      const finalCase = await prisma.afterSalesCase.findUniqueOrThrow({ where: { id: caseId } });
      const finalRefund = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
      assert.equal(finalOrder.status, 'COMPLETED');
      assert.equal(finalOrder.deliveryStatus, 'RECEIVED');
      assert.equal(Number(finalOrder.refundedAmount), 50);
      assert.equal(finalPayment.status, 'PARTIAL_REFUND');
      assert.equal(finalFulfillment.status, 'DELIVERED');
      assert.equal(finalCase.status, 'COMPLETED');
      assert.equal(finalRefund.status, 'COMPLETED');
      assert.equal(finalRefund.afterSalesCaseId, caseId);

      const events = await prisma.tradeEvent.findMany({
        where: { orderId: order.id },
        orderBy: { id: 'asc' },
      });
      const eventTypes = events.map((event) => event.eventType);
      for (const expected of [
        'PAYMENT_APPROVED',
        'FULFILLMENT_CREATED',
        'STOCK_CONSUMED',
        'SHIPMENT_DISPATCHED',
        'FULFILLMENT_ABNORMAL',
        'FULFILLMENT_DELIVERED',
        'ORDER_RECEIVED',
        'ORDER_COMPLETED',
        'AFTER_SALES_REQUESTED',
        'AFTER_SALES_APPROVED',
        'REFUND_REQUESTED',
        'REFUND_APPROVED',
        'REFUND_EXECUTE_FAILED',
        'REFUND_COMPLETED',
      ]) {
        assert.ok(eventTypes.includes(expected), `缺少交易审计事件 ${expected}`);
      }
      assert.equal(eventTypes.filter((value) => value === 'SHIPMENT_DISPATCHED').length, 1);
      assert.equal(eventTypes.filter((value) => value === 'REFUND_REQUESTED').length, 1);
      assert.equal(eventTypes.filter((value) => value === 'REFUND_EXECUTE_FAILED').length, 1);
      assert.equal(eventTypes.filter((value) => value === 'REFUND_COMPLETED').length, 1);
      assert.ok(events.every((event) => event.operatorType && event.entityType));

      let auditedModules = new Set<string>();
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const logs = await prisma.operationLog.findMany({
          where: {
            userId: { in: Object.values(users).map((user) => user.id) },
          },
          select: { module: true },
        });
        auditedModules = new Set(logs.map((log) => log.module));
        if (['payments', 'fulfillments', 'orders', 'after-sales-cases', 'refunds'].every((name) => auditedModules.has(name))) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      for (const expectedModule of ['payments', 'fulfillments', 'orders', 'after-sales-cases', 'refunds']) {
        assert.ok(auditedModules.has(expectedModule), `通用操作日志缺少模块 ${expectedModule}`);
      }

      const orderDetail = await call(`/orders/${order.id}`, adminToken);
      assertStatus(orderDetail, 200, '管理员回读完整订单时间线');
      assert.equal(orderDetail.data.status, 'COMPLETED');
      assert.equal(orderDetail.data.fulfillments[0].status, 'DELIVERED');
      assert.equal(orderDetail.data.afterSalesCases[0].status, 'COMPLETED');
      assert.equal(orderDetail.data.refunds[0].status, 'COMPLETED');
      assert.equal(orderDetail.data.tradeEvents.length, events.length);

      console.log(
        `ORDER_OPS_REAL_HTTP_GATE_PASS run=${runId} order=${order.orderNo} events=${events.length} modules=${[...auditedModules].sort().join(',')}`,
      );
    } finally {
      await app.close();
      await prisma.$disconnect();
    }
  },
);
