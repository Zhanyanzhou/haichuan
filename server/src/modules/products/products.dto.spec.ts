import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './dto/create-product.dto';

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

test('创建商品 DTO 接受最小合法载荷和多 SKU 数组', async () => {
  const minimalErrors = await validateCreateProduct(validProduct);
  const multiSkuErrors = await validateCreateProduct({
    ...validProduct,
    skus: [
      { skuCode: 'SYNTH-SKU-A', price: 12800 },
      { skuCode: 'SYNTH-SKU-B', price: 13800, isActive: false },
    ],
  });

  assert.equal(minimalErrors.length, 0);
  assert.equal(multiSkuErrors.length, 0);
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
