import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { HttpException } from '@nestjs/common';
import { CustomersService } from './customers.service';

type AddressRecord = {
  id: number;
  customerId: number;
  recipientName: string;
  recipientPhone: string;
  province: string | null;
  city: string | null;
  district: string | null;
  detail: string;
  postalCode: string | null;
  isDefault: boolean;
  creationIdempotencyKeyHash?: string | null;
  creationRequestHash?: string | null;
};

function addressInput(
  recipientName: string,
  detail: string,
  isDefault?: boolean,
) {
  return {
    recipientName,
    recipientPhone: '13800138000',
    province: '广东省',
    city: '深圳市',
    district: '罗湖区',
    detail,
    postalCode: '518000',
    ...(isDefault === undefined ? {} : { isDefault }),
  };
}

const addressCustomer = (authVersion = 3) => ({ id: 9, authVersion });

function createHarness(
  seed: AddressRecord[] = [],
  customerStatus: 'ACTIVE' | 'DISABLED' = 'ACTIVE',
  currentAuthVersion = 3,
) {
  const addresses = seed.map((address) => ({ ...address }));
  const operations: string[] = [];
  const isolationLevels: unknown[] = [];
  let nextId = Math.max(0, ...addresses.map((address) => address.id)) + 1;
  let lockTail = Promise.resolve();
  const projectAddress = (address: AddressRecord, select?: Record<string, boolean>) => {
    if (!select) return { ...address };
    return Object.fromEntries(
      Object.entries(select)
        .filter(([, included]) => included)
        .map(([field]) => [field, address[field as keyof AddressRecord]]),
    );
  };

  const prisma: any = {
    $transaction: async (
      callback: (tx: any) => Promise<unknown>,
      options: { isolationLevel?: unknown },
    ) => {
      isolationLevels.push(options?.isolationLevel);
      const previousLock = lockTail;
      let releaseLock!: () => void;
      lockTail = new Promise<void>((resolve) => { releaseLock = resolve; });
      let acquired = false;
      const tx = {
        $queryRaw: async (query: { values?: unknown[] }) => {
          await previousLock;
          acquired = true;
          operations.push('customer.lock');
          return customerStatus === 'ACTIVE'
            && query.values?.includes(currentAuthVersion)
            ? [{ id: 9 }]
            : [];
        },
        customerAddress: {
          findMany: async ({ where, select }: any) => {
            operations.push('address.findMany');
            return addresses
              .filter((address) => address.customerId === where.customerId)
              .map((address) => projectAddress(address, select));
          },
          findUnique: async ({ where, select }: any) => {
            operations.push('address.findUnique');
            const address = addresses.find((item) =>
              where.id !== undefined
                ? item.id === where.id
                : item.creationIdempotencyKeyHash === where.creationIdempotencyKeyHash,
            );
            return address ? projectAddress(address, select) : null;
          },
          count: async ({ where }: any) => {
            operations.push('address.count');
            return addresses.filter((address) => address.customerId === where.customerId).length;
          },
          findFirst: async ({ where }: any) => {
            operations.push('address.findFirst');
            return addresses.find((address) =>
              address.id === where.id && address.customerId === where.customerId,
            ) ?? null;
          },
          updateMany: async ({ where, data }: any) => {
            operations.push('address.updateMany');
            let count = 0;
            for (const address of addresses) {
              const matches = address.customerId === where.customerId
                && (where.isDefault === undefined || address.isDefault === where.isDefault)
                && (where.id?.not === undefined || address.id !== where.id.not);
              if (!matches) continue;
              address.isDefault = data.isDefault;
              count += 1;
            }
            return { count };
          },
          create: async ({ data, select }: any) => {
            operations.push('address.create');
            const created = { id: nextId, ...data } as AddressRecord;
            nextId += 1;
            addresses.push(created);
            return projectAddress(created, select);
          },
          update: async ({ where, data, select }: any) => {
            operations.push('address.update');
            const address = addresses.find((item) => item.id === where.id);
            assert.ok(address);
            Object.assign(address, data);
            return projectAddress(address, select);
          },
          deleteMany: async ({ where }: any) => {
            operations.push('address.deleteMany');
            const index = addresses.findIndex((address) =>
              address.id === where.id && address.customerId === where.customerId,
            );
            if (index < 0) return { count: 0 };
            addresses.splice(index, 1);
            return { count: 1 };
          },
        },
      };
      try {
        return await callback(tx);
      } finally {
        if (acquired) releaseLock();
      }
    },
  };
  const service = new CustomersService(
    prisma,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, addresses, operations, isolationLevels };
}

test('地址私有读取在同一 Serializable 事务内先复核 ACTIVE 与 authVersion', async () => {
  const seed = [{
    id: 1,
    customerId: 9,
    ...addressInput('客户甲', '深南东路 1 号', true),
    province: '广东省',
    city: '深圳市',
    district: '罗湖区',
    postalCode: '518000',
    isDefault: true,
  }];
  const valid = createHarness(seed);
  const addresses = await valid.service.listAddresses(addressCustomer());
  assert.equal(addresses.length, 1);
  assert.deepEqual(valid.operations.slice(0, 2), ['customer.lock', 'address.findMany']);
  assert.deepEqual(valid.isolationLevels, [Prisma.TransactionIsolationLevel.Serializable]);

  const stale = createHarness(seed, 'ACTIVE', 4);
  await assert.rejects(
    stale.service.listAddresses(addressCustomer(3)),
    HttpException,
  );
  assert.deepEqual(stale.operations, ['customer.lock']);
});

test('并发新增首批地址由客户行锁串行化且至多一个默认项', async () => {
  const { service, addresses, operations, isolationLevels } = createHarness();

  await Promise.all([
    service.createAddress(addressCustomer(), addressInput('客户甲', '深南东路 1 号'), 'address-create-0001'),
    service.createAddress(addressCustomer(), addressInput('客户乙', '深南东路 2 号'), 'address-create-0002'),
  ]);

  assert.equal(addresses.length, 2);
  assert.equal(addresses.filter((address) => address.isDefault).length, 1);
  assert.equal(operations.filter((operation) => operation === 'customer.lock').length, 2);
  assert.deepEqual(
    isolationLevels,
    [
      Prisma.TransactionIsolationLevel.Serializable,
      Prisma.TransactionIsolationLevel.Serializable,
    ],
  );
  assert.ok(operations.indexOf('customer.lock') < operations.indexOf('address.count'));
});

test('更新默认项保持至多一个；取消或删除默认项不会擅自提升其他地址', async () => {
  const { service, addresses } = createHarness([
    {
      id: 1,
      customerId: 9,
      ...addressInput('客户甲', '深南东路 1 号', true),
      province: '广东省',
      city: '深圳市',
      district: '罗湖区',
      postalCode: '518000',
      isDefault: true,
    },
    {
      id: 2,
      customerId: 9,
      ...addressInput('客户乙', '深南东路 2 号', false),
      province: '广东省',
      city: '深圳市',
      district: '罗湖区',
      postalCode: '518000',
      isDefault: false,
    },
  ]);

  await service.updateAddress(addressCustomer(), 1, addressInput('客户甲', '深南东路 1 号', false));
  assert.equal(addresses.filter((address) => address.isDefault).length, 0);

  await service.updateAddress(addressCustomer(), 2, addressInput('客户乙', '深南东路 2 号', true));
  assert.deepEqual(
    addresses.filter((address) => address.isDefault).map((address) => address.id),
    [2],
  );

  await service.deleteAddress(addressCustomer(), 2);
  assert.deepEqual(addresses.map((address) => ({ id: address.id, isDefault: address.isDefault })), [
    { id: 1, isDefault: false },
  ]);
});

test('删除地址响应丢失后重复删除仍返回成功且不会影响其他地址', async () => {
  const { service, addresses, operations } = createHarness([
    {
      id: 1,
      customerId: 9,
      ...addressInput('保留客户', '深南东路 1 号', true),
      province: '广东省',
      city: '深圳市',
      district: '罗湖区',
      postalCode: '518000',
      isDefault: true,
    },
    {
      id: 2,
      customerId: 9,
      ...addressInput('删除客户', '深南东路 2 号', false),
      province: '广东省',
      city: '深圳市',
      district: '罗湖区',
      postalCode: '518000',
      isDefault: false,
    },
  ]);

  assert.deepEqual(await service.deleteAddress(addressCustomer(), 2), { success: true });
  assert.deepEqual(await service.deleteAddress(addressCustomer(), 2), { success: true });
  assert.deepEqual(addresses.map((address) => address.id), [1]);
  assert.equal(operations.filter((operation) => operation === 'address.deleteMany').length, 2);
});

test('并发把不同地址设为默认时最终仍只有一个默认项', async () => {
  const { service, addresses } = createHarness([
    {
      id: 1,
      customerId: 9,
      ...addressInput('客户甲', '深南东路 1 号', false),
      province: '广东省',
      city: '深圳市',
      district: '罗湖区',
      postalCode: '518000',
      isDefault: false,
    },
    {
      id: 2,
      customerId: 9,
      ...addressInput('客户乙', '深南东路 2 号', false),
      province: '广东省',
      city: '深圳市',
      district: '罗湖区',
      postalCode: '518000',
      isDefault: false,
    },
  ]);

  await Promise.all([
    service.updateAddress(addressCustomer(), 1, addressInput('客户甲', '深南东路 1 号', true)),
    service.updateAddress(addressCustomer(), 2, addressInput('客户乙', '深南东路 2 号', true)),
  ]);

  assert.equal(addresses.filter((address) => address.isDefault).length, 1);
});

test('新增地址响应丢失后同键同内容返回原地址且不重复改写默认项', async () => {
  const { service, addresses, operations } = createHarness();
  const input = addressInput('响应丢失客户', '深南东路 8 号', false);

  const created = await service.createAddress(addressCustomer(), input, 'address-response-lost-0001');
  const replayed = await service.createAddress(addressCustomer(), input, 'address-response-lost-0001');

  assert.equal(replayed.id, created.id);
  assert.equal(addresses.length, 1);
  assert.equal(addresses[0]?.isDefault, true);
  assert.match(addresses[0]?.creationIdempotencyKeyHash ?? '', /^[a-f0-9]{64}$/);
  assert.match(addresses[0]?.creationRequestHash ?? '', /^[a-f0-9]{64}$/);
  assert.equal(Object.prototype.hasOwnProperty.call(created, 'creationIdempotencyKeyHash'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(created, 'creationRequestHash'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(replayed, 'creationIdempotencyKeyHash'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(replayed, 'creationRequestHash'), false);
  assert.equal(operations.filter((operation) => operation === 'address.create').length, 1);
  assert.equal(operations.filter((operation) => operation === 'address.updateMany').length, 1);
});

test('新增地址同一幂等键改变内容时冲突且不写第二条地址', async () => {
  const { service, addresses } = createHarness();

  await service.createAddress(
    addressCustomer(),
    addressInput('客户甲', '深南东路 1 号'),
    'address-fingerprint-conflict-0001',
  );
  await assert.rejects(
    service.createAddress(
      addressCustomer(),
      addressInput('客户甲', '深南东路 2 号'),
      'address-fingerprint-conflict-0001',
    ),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 409,
  );

  assert.equal(addresses.length, 1);
  assert.equal(addresses[0]?.detail, '深南东路 1 号');
});

test('注销已先取得客户行锁时拒绝新增地址且不会恢复地址 PII', async () => {
  const { service, addresses, operations } = createHarness([], 'DISABLED');

  await assert.rejects(
    service.createAddress(
      addressCustomer(),
      addressInput('已注销客户', '不应写入的地址'),
      'address-disabled-customer-0001',
    ),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 401,
  );

  assert.deepEqual(addresses, []);
  assert.deepEqual(operations, ['customer.lock']);
});

test('旧 authVersion 地址写请求在锁后失败关闭且不会读取或修改地址', async () => {
  const { service, addresses, operations } = createHarness([
    {
      id: 1,
      customerId: 9,
      ...addressInput('受保护客户', '深南东路 1 号', true),
      province: '广东省',
      city: '深圳市',
      district: '罗湖区',
      postalCode: '518000',
      isDefault: true,
    },
  ], 'ACTIVE', 4);

  await assert.rejects(
    service.deleteAddress(addressCustomer(3), 1),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 401,
  );

  assert.deepEqual(addresses.map((address) => address.id), [1]);
  assert.deepEqual(operations, ['customer.lock']);
});
