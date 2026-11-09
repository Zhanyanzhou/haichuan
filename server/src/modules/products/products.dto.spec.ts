import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateCertificateDto, isPublishableCertificateNumber } from './dto/certificate.dto';

const validProduct = {
  name: '合成测试商品',
  code: 'SYNTH-PRODUCT-001',
  categoryId: 1,
};

async function validateCreateProduct(payload: Record<string, unknown>) {
  return validate(plainToInstance(CreateProductDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

test('履约确认和随附证书只接受 JSON 布尔值', async () => {
  const transform = { enableImplicitConversion: true };
  const factories = [
    (input: Record<string, unknown>) => plainToInstance(CreateProductDto, { ...validProduct, ...input }, transform),
    (input: Record<string, unknown>) => plainToInstance(UpdateProductDto, input, transform),
  ];
  for (const buildDto of factories) {
    for (const input of ['false', '0', 1]) {
      const dto = buildDto({ fulfillmentConfirmed: input, includesCertificate: input });
      const fields = (await validate(dto)).map(({ property }) => property);
      assert.ok(fields.includes('fulfillmentConfirmed'));
      assert.ok(fields.includes('includesCertificate'));
    }
    const dto = buildDto({ fulfillmentConfirmed: false, includesCertificate: false });
    assert.deepEqual(await validate(dto), []);
    assert.equal(dto.fulfillmentConfirmed, false);
  }
});

test('证书拒绝占位编号并保留纯数字编号的前导零', async () => {
  for (const input of ['-', '—', '…']) {
    assert.equal(isPublishableCertificateNumber(input), false);
    const dto = plainToInstance(CreateCertificateDto, { certType: 'GIA', certNumber: input });
    assert.ok((await validate(dto)).some(({ property }) => property === 'certNumber'));
  }
  const valid = plainToInstance(CreateCertificateDto, { certType: 'GIA', certNumber: ' 001234 ' });
  assert.deepEqual(await validate(valid), []);
  assert.equal(valid.certNumber, '001234');
  assert.equal(isPublishableCertificateNumber(valid.certNumber), true);
});

test('创建商品 DTO 接受最小合法载荷和多 SKU 数组', async () => {
  const minimalErrors = await validateCreateProduct(validProduct);
  const multiSkuErrors = await validateCreateProduct({
    ...validProduct,
    skus: [
      { skuCode: 'SYNTH-SKU-A', color: '玫瑰金', price: 12800 },
      { skuCode: 'SYNTH-SKU-B', price: 13800, isActive: false },
    ],
  });

  assert.equal(minimalErrors.length, 0);
  assert.equal(multiSkuErrors.length, 0);
});

test('创建商品 DTO 的 SKU 颜色最多 50 个字符', async () => {
  const accepted = await validateCreateProduct({
    ...validProduct,
    skus: [{ skuCode: 'SYNTH-SKU-COLOR', color: '白色', price: 12800 }],
  });
  assert.equal(accepted.length, 0);

  const rejected = await validateCreateProduct({
    ...validProduct,
    skus: [{ skuCode: 'SYNTH-SKU-COLOR', color: '金'.repeat(51), price: 12800 }],
  });
  assert.ok(rejected.find((error) => error.property === 'skus')?.children?.length);
});

test('创建商品 DTO 按淘宝口径限制标题：汉字计 2，字母与数字计 1，合计不超过 60', async () => {
  const accepted = await validateCreateProduct({
    ...validProduct,
    name: `${'金'.repeat(29)}AB`,
  });
  assert.equal(accepted.length, 0);

  const rejected = await validateCreateProduct({
    ...validProduct,
    name: '金'.repeat(31),
  });
  assert.ok(rejected.some((error) => error.property === 'name'));
});

test('创建商品 DTO 拒绝非正分类 ID', async () => {
  const errors = await validateCreateProduct({
    ...validProduct,
    categoryId: 0,
  });

  assert.ok(errors.some((error) => error.property === 'categoryId'));
});

test('创建商品 DTO 拒绝对象形态的 skus，避免静默创建默认 SKU', async () => {
  const errors = await validateCreateProduct({
    ...validProduct,
    skus: { skuCode: 'SYNTH-SKU-A', price: 12800 },
  });

  assert.ok(errors.some((error) => error.property === 'skus'));
});

test('创建商品 DTO 继续校验数组中的 SKU', async () => {
  const errors = await validateCreateProduct({
    ...validProduct,
    skus: [{ skuCode: '', price: -1 }],
  });

  const skusError = errors.find((error) => error.property === 'skus');
  assert.ok(skusError?.children?.length);
});

test('创建商品 DTO 接受两种库存策略并拒绝未知值', async () => {
  for (const inventoryPolicy of ['STANDARD', 'SINGLE_UNIT']) {
    const errors = await validateCreateProduct({ ...validProduct, inventoryPolicy });
    assert.equal(errors.length, 0);
  }
  const errors = await validateCreateProduct({
    ...validProduct,
    inventoryPolicy: 'UNLIMITED',
  });
  assert.ok(errors.some((error) => error.property === 'inventoryPolicy'));
});

test('创建商品 DTO 只接受去重后的既有提取方式', async () => {
  const accepted = await validateCreateProduct({
    ...validProduct,
    deliveryMethods: ['EXPRESS', 'STORE_PICKUP', 'DEDICATED'],
  });
  assert.equal(accepted.length, 0);

  for (const deliveryMethods of [
    ['EXPRESS', 'EXPRESS'],
    ['SAME_CITY_COURIER'],
  ]) {
    const errors = await validateCreateProduct({
      ...validProduct,
      deliveryMethods,
    });
    assert.ok(errors.some((error) => error.property === 'deliveryMethods'));
  }
});
