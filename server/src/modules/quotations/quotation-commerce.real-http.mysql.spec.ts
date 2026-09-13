import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { resolveDesignMediaPath } from '../upload/design-file-media';
import { hashBusinessSnapshot } from './quotation-snapshot';

const databaseUrl = process.env.QUOTATION_REAL_MYSQL_URL?.trim();

type ApiResult = {
  status: number;
  body: unknown;
  data: any;
};

type RunningApi = {
  app: INestApplication;
  call: (path: string, token?: string, init?: RequestInit) => Promise<ApiResult>;
  callRaw: (path: string, token?: string, init?: RequestInit) => Promise<Response>;
};

function validateIsolatedTarget(value: string | undefined) {
  assert.equal(
    process.env.QUOTATION_REAL_MYSQL_TEST,
    '1',
    '必须显式声明 QUOTATION_REAL_MYSQL_TEST=1',
  );
  assert.ok(value, '必须显式提供 QUOTATION_REAL_MYSQL_URL');
  const target = new URL(value);
  assert.equal(target.protocol, 'mysql:');
  assert.match(
    target.hostname,
    /^hc-quotation-[a-z0-9-]+-mysql$/,
    '只允许本任务命名的隔离 MySQL 容器',
  );
  assert.equal(target.pathname, '/haichuan_quotation_test');
  assert.equal(target.username, 'hc_quotation');
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

async function startApi(apiPort: number): Promise<RunningApi> {
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
  const callRaw = async (path: string, token?: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  };
  return {
    app,
    callRaw,
    call: async (path: string, token?: string, init: RequestInit = {}) => {
      const response = await callRaw(path, token, init);
      const body = await response.json().catch(() => null);
      const envelope = body as { data?: unknown } | null;
      return {
        status: response.status,
        body,
        data: envelope && 'data' in envelope ? envelope.data : body,
      };
    },
  };
}

test(
  '真实 Nest HTTP + MySQL：三报价配置、客户本人确认与原子转单闭环',
  {
    skip:
      databaseUrl && process.env.QUOTATION_REAL_MYSQL_TEST === '1'
        ? false
        : '需要显式提供本任务一次性 QUOTATION_REAL_MYSQL_URL',
  },
  async () => {
    assert.equal(process.versions.node.split('.')[0], '22', '真实报价闭环必须在 Node 22 下运行');
    assert.equal(process.env.RELEASE_PROFILE, 'commerce');
    assert.equal(process.env.CUSTOMER_QUOTATION_ORDERING_ENABLED, 'true');
    assert.notEqual(process.env.CUSTOMER_COMMERCE_ENABLED?.trim().toLowerCase(), 'true');
    assert.notEqual(process.env.PAYMENT_GATEWAY_TRANSACTIONS_ENABLED?.trim().toLowerCase(), 'true');
    assert.notEqual(process.env.PAYMENT_GATEWAY_REFUNDS_ENABLED?.trim().toLowerCase(), 'true');

    const isolatedDatabaseUrl = validateIsolatedTarget(databaseUrl);
    assert.ok(process.env.DATABASE_URL, '完整 AppModule 必须显式指向本任务隔离库');
    assert.equal(
      new URL(process.env.DATABASE_URL).href,
      isolatedDatabaseUrl,
      'AppModule DATABASE_URL 与报价验收隔离库必须是同一目标',
    );
    const runId = process.env.QUOTATION_RUN_ID?.trim() || '';
    assert.match(runId, /^[a-z0-9]{6,12}$/, 'QUOTATION_RUN_ID 必须是 6-12 位小写字母或数字');
    const apiPort = Number(process.env.QUOTATION_API_PORT);
    assert.ok(Number.isInteger(apiPort) && apiPort >= 1024 && apiPort <= 65535);

    const prisma = new PrismaClient({ datasourceUrl: isolatedDatabaseUrl });
    await prisma.$connect();
    const populatedTables = await Promise.all([
      prisma.user.count(),
      prisma.customer.count(),
      prisma.quotation.count(),
      prisma.order.count(),
      prisma.partnerPriceAgreement.count(),
      prisma.tradeResourceBucket.count(),
    ]);
    assert.deepEqual(
      populatedTables,
      [0, 0, 0, 0, 0, 0],
      '报价闭环必须从空的一次性业务库开始',
    );

    const password = 'QuotePass9!';
    const passwordHash = await bcrypt.hash(password, 4);
    const admin = await prisma.user.create({
      data: {
        username: `quote-admin-${runId}`,
        password: passwordHash,
        realName: `报价验收管理员-${runId}`,
        role: 'ADMIN',
      },
    });
    const sales = await prisma.user.create({
      data: {
        username: `quote-sales-${runId}`,
        password: passwordHash,
        realName: `报价验收销售-${runId}`,
        role: 'SALES_CONSULTANT',
      },
    });
    const numericRunId = runId.replace(/\D/g, '').slice(-8).padStart(8, '0');
    const customerA = await prisma.customer.create({
      data: {
        phone: `139${numericRunId}`,
        name: `报价验收客户A-${runId}`,
        passwordHash,
        accountType: 'PARTNER',
        partnerStatus: 'APPROVED',
      },
    });
    const customerB = await prisma.customer.create({
      data: {
        phone: `138${numericRunId}`,
        name: `报价验收客户B-${runId}`,
        passwordHash,
      },
    });
    const category = await prisma.category.create({
      data: { name: `报价验收分类-${runId}`, slug: `quotation-${runId}` },
    });
    const product = await prisma.product.create({
      data: {
        code: `QUOTE-${runId}`,
        name: `报价验收现货-${runId}`,
        categoryId: category.id,
        salesMode: 'DIRECT_PURCHASE',
        status: 'PUBLISHED',
      },
    });
    const sku = await prisma.productSKU.create({
      data: {
        productId: product.id,
        skuCode: `QUOTE-SKU-${runId}`,
        price: 100,
      },
    });
    const warehouse = await prisma.warehouse.create({
      data: {
        name: `报价验收仓-${runId}`,
        type: 'FACTORY',
        isDefault: true,
        defaultKey: 'PRIMARY',
      },
    });
    await prisma.inventory.create({
      data: { skuId: sku.id, warehouseId: warehouse.id, quantity: 10 },
    });
    const designBytes = Buffer.from(`haichuan-partner-design-${runId}`);
    const designChecksum = createHash('sha256').update(designBytes).digest('hex');
    let designStoragePath: string | null = null;

    let api: RunningApi | undefined;
    try {
      api = await startApi(apiPort);
      const flags = await api.call('/settings/flags');
      assertStatus(flags, 200, '读取独立交易开关');
      assert.equal(flags.data.quotationOrderingEnabled, true);
      assert.equal(flags.data.commerceEnabled, false);
      assert.equal(flags.data.paymentEnabled, false);
      const loginStaff = async (username: string) => {
        const result = await api!.call('/auth/login', undefined, {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        assertStatus(result, 201, `员工登录 ${username}`);
        assert.ok(result.data?.accessToken);
        return result.data.accessToken as string;
      };
      const loginCustomer = async (phone: string) => {
        const result = await api!.call('/customers/login', undefined, {
          method: 'POST',
          body: JSON.stringify({ phone, password }),
        });
        assertStatus(result, 201, `客户登录 ${phone.slice(-4)}`);
        assert(result.data?.accessToken);
        return result.data.accessToken as string;
      };
      const adminToken = await loginStaff(admin.username);
      const salesToken = await loginStaff(sales.username);
      const customerAToken = await loginCustomer(customerA.phone);
      const customerBToken = await loginCustomer(customerB.phone);

      assertStatus(await api.call('/quotation-configuration/fee-rules'), 401, '匿名读取报价配置');
      assertStatus(
        await api.call('/quotation-configuration/resource-buckets', salesToken),
        403,
        '销售读取管理员报价配置',
      );
      assertStatus(await api.call('/quotations', customerAToken), 401, '客户令牌进入员工报价域');

      const postAdmin = async (path: string, body: unknown, label: string) => {
        const result = await api!.call(path, adminToken, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        assertStatus(result, 201, label);
        return result.data;
      };
      const effectiveFrom = new Date(Date.now() - 60_000).toISOString();
      const partnerPrice = await postAdmin('/quotation-configuration/partner-prices', {
        customerId: customerA.id,
        redWaxRate: 25,
        purpleWaxRate: 20,
        effectiveFrom,
        reason: '真实闭环验收协议价',
      }, '创建合作客户双蜡价');
      assert.equal(partnerPrice.version, 1);

      const createFee = (body: unknown, label: string) =>
        postAdmin('/quotation-configuration/fee-rules', body, label);
      const retailFee = await createFee({
        code: `RF_${runId.toUpperCase()}`,
        channel: 'RETAIL',
        calculationMethod: 'FIXED',
        unitAmount: 5,
        displayText: '零售验收服务费',
        effectiveFrom,
      }, '创建零售费用规则');
      const customFee = await createFee({
        code: `CF_${runId.toUpperCase()}`,
        channel: 'CUSTOM',
        calculationMethod: 'FIXED',
        unitAmount: 10,
        displayText: '定制验收服务费',
        effectiveFrom,
      }, '创建定制费用规则');
      const partnerFee = await createFee({
        code: `PF_${runId.toUpperCase()}`,
        channel: 'PARTNER_WAX',
        waxType: 'RED',
        calculationMethod: 'PER_GRAM',
        unitAmount: 2,
        displayText: '合作蜡模验收按克服务费',
        effectiveFrom,
      }, '创建合作蜡模费用规则');

      const createBucket = (channel: 'CUSTOM' | 'PARTNER_WAX', kind: 'CAPACITY' | 'MATERIAL') =>
        postAdmin('/quotation-configuration/resource-buckets', {
          channel,
          kind,
          code: `${channel === 'CUSTOM' ? 'CU' : 'PW'}_${kind}_${runId.toUpperCase()}`,
          bucketKey: `CURRENT_${runId}`,
          displayName: `${channel}-${kind}-${runId}`,
          unit: kind === 'CAPACITY' ? 'ORDER' : 'GRAM',
          availableQuantity: 100,
        }, `创建 ${channel} ${kind} 资源桶`);
      const customCapacity = await createBucket('CUSTOM', 'CAPACITY');
      const customMaterial = await createBucket('CUSTOM', 'MATERIAL');
      const partnerCapacity = await createBucket('PARTNER_WAX', 'CAPACITY');
      const partnerMaterial = await createBucket('PARTNER_WAX', 'MATERIAL');

      const designFile = await postAdmin('/cooperation-design-files', {
        customerId: customerA.id,
        productId: product.id,
        referenceNo: `DESIGN-${runId.toUpperCase()}`,
      }, '创建合作 3D 文件');
      const designUpload = new FormData();
      designUpload.append(
        'file',
        new Blob([new Uint8Array(designBytes)], { type: 'application/octet-stream' }),
        `design-${runId}.3dm`,
      );
      designUpload.append('targetGoldWeight', '40');
      designUpload.append('redWaxWeight', '4');
      const uploadedDesignVersion = await api.call(
        `/cooperation-design-files/${designFile.id}/versions/upload`,
        adminToken,
        { method: 'POST', body: designUpload },
      );
      assertStatus(uploadedDesignVersion, 201, '上传真实字节并追加 3D 文件版本');
      const designVersion = uploadedDesignVersion.data;
      const persistedDesignVersion = await prisma.cooperationDesignFileVersion.findUniqueOrThrow({
        where: { id: designVersion.id },
        include: { mediaAsset: true },
      });
      assert.equal(persistedDesignVersion.checksumSha256, designChecksum);
      assert.equal(persistedDesignVersion.mediaAsset.checksumSha256, designChecksum);
      assert.equal(persistedDesignVersion.mediaAsset.byteSize, designBytes.length);
      assert.equal(persistedDesignVersion.mediaAsset.accessLevel, 'PRIVATE');
      assert.equal(persistedDesignVersion.mediaAsset.status, 'READY');
      designStoragePath = resolveDesignMediaPath(persistedDesignVersion.mediaAsset.storageKey);
      assert.ok(designStoragePath, '3D 文件必须保存到专用私有媒体根');

      const ownDesignFiles = await api.call(
        '/customers/me/cooperation-design-files',
        customerAToken,
      );
      assertStatus(ownDesignFiles, 200, '客户本人读取 3D 文件列表');
      assert.ok(Array.isArray(ownDesignFiles.data), '3D 文件列表必须是数组');
      const listedDesignFile = ownDesignFiles.data.find(
        (file: { id?: number }) => file.id === designFile.id,
      );
      assert.ok(listedDesignFile, '客户本人必须能读到已提交的 3D 文件');
      assert.equal(listedDesignFile.customerId, undefined, '客户响应不回传内部客户 ID');
      assert.ok(Array.isArray(listedDesignFile.versions));
      assert.equal(listedDesignFile.versions[0].status, 'SUBMITTED');
      assert.equal(listedDesignFile.versions[0].fileName, `design-${runId}.3dm`);

      const foreignDesignFiles = await api.call(
        '/customers/me/cooperation-design-files',
        customerBToken,
      );
      assertStatus(foreignDesignFiles, 200, '其他客户读取 3D 文件列表');
      assert.deepEqual(foreignDesignFiles.data, []);

      const ownDesignDownload = await api.callRaw(
        `/customers/me/cooperation-design-files/${designFile.id}/versions/${designVersion.version}/content`,
        customerAToken,
      );
      assert.equal(ownDesignDownload.status, 200);
      assert.equal(ownDesignDownload.headers.get('cache-control'), 'private, no-store');
      assert.equal(ownDesignDownload.headers.get('x-content-type-options'), 'nosniff');
      assert.match(ownDesignDownload.headers.get('content-disposition') ?? '', /attachment/);
      assert.equal(
        ownDesignDownload.headers.get('digest'),
        `sha-256=${Buffer.from(designChecksum, 'hex').toString('base64')}`,
      );
      assert.deepEqual(Buffer.from(await ownDesignDownload.arrayBuffer()), designBytes);
      const foreignDesignDownload = await api.callRaw(
        `/customers/me/cooperation-design-files/${designFile.id}/versions/${designVersion.version}/content`,
        customerBToken,
      );
      assert.equal(foreignDesignDownload.status, 404);

      const missingMedia = await prisma.mediaAsset.create({
        data: {
          storageKey: `design-assets/missing-${runId}/missing.3dm`,
          originalName: `missing-${runId}.3dm`,
          mimeType: 'application/octet-stream',
          byteSize: designBytes.length,
          checksumSha256: designChecksum,
          accessLevel: 'PRIVATE',
          status: 'READY',
          integrityCheckedAt: new Date(),
          uploadedBy: admin.id,
        },
      });
      const versionsBeforeMissingAttempt = await prisma.cooperationDesignFileVersion.count({
        where: { designFileId: designFile.id },
      });
      const missingMediaVersion = await api.call(
        `/cooperation-design-files/${designFile.id}/versions`,
        adminToken,
        {
          method: 'POST',
          body: JSON.stringify({
            mediaAssetId: missingMedia.id,
            checksumSha256: designChecksum,
            redWaxWeight: 4,
          }),
        },
      );
      assertStatus(missingMediaVersion, 404, '缺失真实字节的 3D 媒体不得登记版本');
      assert.equal(
        await prisma.cooperationDesignFileVersion.count({ where: { designFileId: designFile.id } }),
        versionsBeforeMissingAttempt,
      );
      const confirmedDesign = await api.call(
        `/customers/me/cooperation-design-files/${designFile.id}/versions/${designVersion.version}/confirm`,
        customerAToken,
        { method: 'POST' },
      );
      assertStatus(confirmedDesign, 201, '客户本人确认 3D 版本');
      assert.equal(confirmedDesign.data.status, 'CONFIRMED');
      assert.equal('targetGoldWeight' in confirmedDesign.data, false);

      const createQuotation = async (
        channel: 'RETAIL' | 'CUSTOM' | 'PARTNER_WAX',
        items: unknown[],
        depositAmount = 0,
      ) => {
        const result = await api!.call('/quotations', salesToken, {
          method: 'POST',
          body: JSON.stringify({
            channel,
            customerId: customerA.id,
            customerName: customerA.name,
            customerPhone: customerA.phone,
            depositAmount,
            items,
          }),
        });
        assertStatus(result, 201, `创建 ${channel} 报价草稿`);
        return result.data;
      };
      const issueQuotation = async (quotationId: number, body: unknown, label: string) => {
        const result = await api!.call(`/quotations/${quotationId}/issue`, salesToken, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        assertStatus(result, 201, label);
        return result.data;
      };
      const retailQuote = await createQuotation('RETAIL', [{
        productId: product.id,
        skuId: sku.id,
        productName: product.name,
        quantity: 1,
        unitPrice: 100,
        quotedPrice: 100,
      }]);
      const customQuote = await createQuotation('CUSTOM', [{
        productName: `定制验收项-${runId}`,
        quantity: 1,
        unitPrice: 100,
        quotedPrice: 100,
      }], 20);
      const partnerQuote = await createQuotation('PARTNER_WAX', [{
        productName: `蜡模验收项-${runId}`,
        quantity: 1,
        unitPrice: 1,
        quotedPrice: 1,
      }]);
      assert.equal(
        (await prisma.quotation.findUniqueOrThrow({ where: { id: retailQuote.id } })).salesConsultantId,
        sales.id,
      );

      const retailVersion = await issueQuotation(retailQuote.id, {
        feeRuleIds: [retailFee.id],
      }, '发出 RETAIL 报价版本');
      const customRequirements = [
        { resourceBucketId: customCapacity.id, requiredQuantity: 1 },
        { resourceBucketId: customMaterial.id, requiredQuantity: 2 },
      ];
      const customVersion = await issueQuotation(customQuote.id, {
        feeRuleIds: [customFee.id],
        resourceRequirements: customRequirements,
      }, '发出 CUSTOM 报价版本');
      const partnerRequirements = [
        { resourceBucketId: partnerCapacity.id, requiredQuantity: 1 },
        { resourceBucketId: partnerMaterial.id, requiredQuantity: 4 },
      ];
      const partnerVersion = await issueQuotation(partnerQuote.id, {
        designFileVersionId: designVersion.id,
        waxType: 'RED',
        feeRuleIds: [partnerFee.id],
        resourceRequirements: partnerRequirements,
      }, '发出 PARTNER_WAX 报价版本');

      const customerQuotes = await api.call('/customers/me/quotations', customerAToken);
      assertStatus(customerQuotes, 200, '客户读取本人报价列表');
      assert.deepEqual(
        new Set(customerQuotes.data.map((item: { channel: string }) => item.channel)),
        new Set(['RETAIL', 'CUSTOM', 'PARTNER_WAX']),
      );
      assertStatus(
        await api.call(`/customers/me/quotations/${retailQuote.id}`, customerBToken),
        404,
        '其他客户读取报价',
      );
      assertStatus(
        await api.call(`/customers/me/quotations/${retailQuote.id}/confirm-and-order`, customerBToken, {
          method: 'POST',
          headers: { 'Idempotency-Key': `foreign-${runId}` },
          body: JSON.stringify({ quotationVersion: retailVersion.version, address: '深圳市隔离路 2 号' }),
        }),
        404,
        '其他客户确认报价',
      );

      const confirmOrder = (
        quotationId: number,
        quotationVersion: number,
        idempotencyKey: string,
        address: string,
      ) => api!.call(`/customers/me/quotations/${quotationId}/confirm-and-order`, customerAToken, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ quotationVersion, address }),
      });

      const orderingFlag = process.env.CUSTOMER_QUOTATION_ORDERING_ENABLED;
      process.env.CUSTOMER_QUOTATION_ORDERING_ENABLED = 'false';
      try {
        const gated = await confirmOrder(
          retailQuote.id,
          retailVersion.version,
          `gated-${runId}-stable`,
          '深圳市报价路 1 号',
        );
        assertStatus(gated, 503, '报价成交门禁关闭');
        assert.equal((gated.body as { errorCode?: string }).errorCode, 'CUSTOMER_QUOTATION_ORDERING_DISABLED');
        assert.equal(await prisma.order.count(), 0);
        assert.equal(await prisma.quotationConversion.count(), 0);
      } finally {
        process.env.CUSTOMER_QUOTATION_ORDERING_ENABLED = orderingFlag;
      }

      const retailKey = `retail-${runId}-stable`;
      const retailAddress = '深圳市报价路 1 号';
      const concurrentRetail = await Promise.all([
        confirmOrder(retailQuote.id, retailVersion.version, retailKey, retailAddress),
        confirmOrder(retailQuote.id, retailVersion.version, retailKey, retailAddress),
      ]);
      concurrentRetail.forEach((result, index) => assertStatus(result, 201, `RETAIL 同键并发 ${index + 1}`));
      assert.equal(concurrentRetail[0].data.order.id, concurrentRetail[1].data.order.id);
      const retailReplay = await confirmOrder(retailQuote.id, retailVersion.version, retailKey, retailAddress);
      assertStatus(retailReplay, 201, 'RETAIL 同键顺序重放');
      assert.equal(retailReplay.data.order.id, concurrentRetail[0].data.order.id);
      assertStatus(
        await confirmOrder(retailQuote.id, retailVersion.version, retailKey, '深圳市另一地址 9 号'),
        409,
        '同一幂等键复用于异载荷',
      );

      const customOrderResult = await confirmOrder(
        customQuote.id,
        customVersion.version,
        `custom-${runId}-stable`,
        '深圳市定制路 1 号',
      );
      assertStatus(customOrderResult, 201, 'CUSTOM 客户确认并转单');
      const partnerOrderResult = await confirmOrder(
        partnerQuote.id,
        partnerVersion.version,
        `partner-${runId}-stable`,
        '深圳市合作路 1 号',
      );
      assertStatus(partnerOrderResult, 201, 'PARTNER_WAX 客户确认并转单');

      const insufficientQuote = await createQuotation('CUSTOM', [{
        productName: `资源不足验收项-${runId}`,
        quantity: 1,
        unitPrice: 30,
        quotedPrice: 30,
      }]);
      const insufficientVersion = await issueQuotation(insufficientQuote.id, {
        resourceRequirements: [
          { resourceBucketId: customCapacity.id, requiredQuantity: 999 },
          { resourceBucketId: customMaterial.id, requiredQuantity: 999 },
        ],
      }, '发出资源不足 CUSTOM 报价');
      const reservedBeforeFailure = await prisma.tradeResourceBucket.findMany({
        where: { id: { in: [customCapacity.id, customMaterial.id] } },
        orderBy: { id: 'asc' },
        select: { id: true, reservedQuantity: true, version: true },
      });
      assertStatus(
        await confirmOrder(
          insufficientQuote.id,
          insufficientVersion.version,
          `insufficient-${runId}`,
          '深圳市资源路 1 号',
        ),
        409,
        '资源不足转单原子回滚',
      );
      const reservedAfterFailure = await prisma.tradeResourceBucket.findMany({
        where: { id: { in: [customCapacity.id, customMaterial.id] } },
        orderBy: { id: 'asc' },
        select: { id: true, reservedQuantity: true, version: true },
      });
      assert.deepEqual(reservedAfterFailure, reservedBeforeFailure);
      assert.equal(await prisma.order.count({ where: { quotationVersionId: insufficientVersion.id } }), 0);
      assert.equal(await prisma.quotationConversion.count({ where: { quotationVersionId: insufficientVersion.id } }), 0);
      const failedQuoteState = await prisma.quotation.findUniqueOrThrow({ where: { id: insufficientQuote.id } });
      assert.equal(failedQuoteState.status, 'PENDING_CONFIRM');
      const failedPlan = await prisma.paymentPlan.findUniqueOrThrow({
        where: { quotationVersionId: insufficientVersion.id },
      });
      assert.equal(failedPlan.status, 'DRAFT');
      assert.equal(failedPlan.orderId, null);

      const orderIds = [
        concurrentRetail[0].data.order.id,
        customOrderResult.data.order.id,
        partnerOrderResult.data.order.id,
      ];
      const storedOrders = await prisma.order.findMany({
        where: { id: { in: orderIds } },
        include: {
          items: true,
          quotedLines: true,
          reservations: true,
          resourceReservations: true,
          quotationVersion: true,
          quotationConversion: true,
          paymentPlans: true,
        },
        orderBy: { id: 'asc' },
      });
      assert.equal(storedOrders.length, 3);
      for (const order of storedOrders) {
        assert.equal(order.status, 'PENDING_PAYMENT');
        assert.equal(order.customerId, customerA.id);
        assert.equal(order.confirmedByCustomerId, customerA.id);
        assert.equal(order.snapshotSchemaVersion, 2);
        assert(order.transactionSnapshot);
        assert.equal(hashBusinessSnapshot(order.transactionSnapshot), order.transactionSnapshotHash);
        assert(order.quotationVersionId);
        assert.equal(order.quotationConversion?.orderId, order.id);
        assert.equal(order.quotationConversion?.quotationVersionId, order.quotationVersionId);
        assert.equal(order.quotationVersion?.status, 'ACCEPTED');
        assert.equal(order.paymentPlans.length, 1);
        assert.equal(order.paymentPlans[0].status, 'ACTIVE');
        assert.equal(order.paymentPlans[0].orderId, order.id);
        if (order.quoteChannel === 'RETAIL') {
          assert.equal(order.items.length, 1);
          assert.equal(order.quotedLines.length, 0);
          assert.equal(order.reservations.length, 1);
          assert.equal(order.resourceReservations.length, 0);
        } else {
          assert.equal(order.items.length, 0);
          assert.equal(order.quotedLines.length, 1);
          assert.equal(order.reservations.length, 0);
          assert.equal(order.resourceReservations.length, 2);
        }
      }
      const convertedQuotes = await prisma.quotation.findMany({
        where: { id: { in: [retailQuote.id, customQuote.id, partnerQuote.id] } },
        orderBy: { id: 'asc' },
      });
      assert.equal(convertedQuotes.every((quotation) => quotation.status === 'CONVERTED'), true);
      assert.deepEqual(
        new Set(convertedQuotes.map((quotation) => quotation.convertedOrderId)),
        new Set(orderIds),
      );

      const customAdminDetail = await api.call(`/orders/${customOrderResult.data.order.id}`, adminToken);
      assertStatus(customAdminDetail, 200, '后台读取 CUSTOM 报价订单');
      assert.equal(customAdminDetail.data.quotationVersionId, customVersion.id);
      assert.equal(customAdminDetail.data.quotedLines.length, 1);
      assert.equal(customAdminDetail.data.resourceReservations.length, 2);

      assert.deepEqual(
        await Promise.all([
          prisma.payment.count(),
          prisma.refund.count(),
          prisma.notification.count(),
          prisma.notificationDelivery.count(),
          prisma.outboxEvent.count(),
        ]),
        [0, 0, 0, 0, 0],
        '报价转单不得自动创建支付、退款或通知事实',
      );

      await api.app.close();
      api = undefined;
      api = await startApi(apiPort);
      const restartedCustomerQuote = await api.call(
        `/customers/me/quotations/${partnerQuote.id}`,
        customerAToken,
      );
      assertStatus(restartedCustomerQuote, 200, '重启后客户回读 PARTNER_WAX 报价');
      assert.equal(restartedCustomerQuote.data.status, 'CONVERTED');
      assert.equal(restartedCustomerQuote.data.convertedOrder.id, partnerOrderResult.data.order.id);
      const restartedDesignDownload = await api.callRaw(
        `/customers/me/cooperation-design-files/${designFile.id}/versions/${designVersion.version}/content`,
        customerAToken,
      );
      assert.equal(restartedDesignDownload.status, 200);
      assert.deepEqual(Buffer.from(await restartedDesignDownload.arrayBuffer()), designBytes);
      const restartedCustomerOrders = await api.call('/customers/me/orders', customerAToken);
      assertStatus(restartedCustomerOrders, 200, '重启后客户回读订单');
      assert.equal(
        orderIds.every((id) => restartedCustomerOrders.data.some((order: { id: number }) => order.id === id)),
        true,
      );
      const restartedAdminQuote = await api.call(`/quotations/${customQuote.id}`, adminToken);
      assertStatus(restartedAdminQuote, 200, '重启后后台回读 CUSTOM 报价');
      assert.equal(restartedAdminQuote.data.convertedOrder.id, customOrderResult.data.order.id);
      const restartedOrder = await prisma.order.findUniqueOrThrow({
        where: { id: partnerOrderResult.data.order.id },
      });
      assert(restartedOrder.transactionSnapshot);
      assert.equal(
        hashBusinessSnapshot(restartedOrder.transactionSnapshot),
        restartedOrder.transactionSnapshotHash,
      );
      assert.deepEqual(
        await Promise.all([
          prisma.payment.count(),
          prisma.refund.count(),
          prisma.notification.count(),
          prisma.notificationDelivery.count(),
          prisma.outboxEvent.count(),
        ]),
        [0, 0, 0, 0, 0],
      );
    } finally {
      if (api) await api.app.close();
      await prisma.$disconnect();
      if (designStoragePath) await rm(designStoragePath, { force: true });
    }
  },
);
