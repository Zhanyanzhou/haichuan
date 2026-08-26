import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

test('仓库创建 DTO 规范化当前管理端载荷并剥离控制字段', async () => {
  const result = await pipe.transform(
    {
      name: '  深圳展厅  ',
      type: 'SHOWROOM',
      address: '  深圳市福田区  ',
      contact: '  陈经理  ',
      phone: '  13800138000  ',
      isActive: false,
      inventoryCount: 99,
    },
    { type: 'body', metatype: CreateWarehouseDto },
  );

  assert.deepEqual({ ...result }, {
    name: '深圳展厅',
    type: 'SHOWROOM',
    address: '深圳市福田区',
    contact: '陈经理',
    phone: '13800138000',
  });
});

test('仓库创建 DTO 保留未传类型时的服务端默认合同', async () => {
  const result = await pipe.transform(
    { name: '  临时展厅  ' },
    { type: 'body', metatype: CreateWarehouseDto },
  );

  assert.deepEqual({ ...result }, { name: '临时展厅' });
});

test('仓库创建 DTO 拒绝空名称 未知类型和超长联系方式', async () => {
  await assert.rejects(
    pipe.transform(
      { name: '  ', type: 'DEPOT', phone: '1'.repeat(21) },
      { type: 'body', metatype: CreateWarehouseDto },
    ),
  );
});

test('仓库更新 DTO 接受真实布尔值并拒绝字符串伪布尔值', async () => {
  const result = await pipe.transform(
    { isActive: false, unknown: 'drop-me' },
    { type: 'body', metatype: UpdateWarehouseDto },
  );
  assert.deepEqual({ ...result }, { isActive: false });

  await assert.rejects(
    pipe.transform(
      { isActive: 'false' },
      { type: 'body', metatype: UpdateWarehouseDto },
    ),
  );
});

test('仓库更新 DTO 拒绝空名称和超长可选字段', async () => {
  await assert.rejects(
    pipe.transform(
      { name: '', address: 'x'.repeat(301), contact: 'x'.repeat(51) },
      { type: 'body', metatype: UpdateWarehouseDto },
    ),
  );
});
