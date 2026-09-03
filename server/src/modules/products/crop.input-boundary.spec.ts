import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CropListingImageDto } from './dto/crop-listing-image.dto';

// 回归合同：曾以裸 body 接收裁切坐标，NaN 会穿透范围比较直达 sharp 变成 500。
const validCrop = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 };

async function validateCrop(payload: Record<string, unknown>) {
  return validate(plainToInstance(CropListingImageDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

test('裁切 DTO 接受 0-1 归一化坐标', async () => {
  const errors = await validateCrop(validCrop);
  assert.equal(errors.length, 0);
});

test('裁切 DTO 拒绝非数值坐标（NaN 穿透回归）', async () => {
  const errors = await validateCrop({ ...validCrop, x: 'abc' });
  assert.ok(errors.some((error) => error.property === 'x'));
});

test('裁切 DTO 拒绝超出 0-1 范围的坐标', async () => {
  const oversizeX = await validateCrop({ ...validCrop, x: 1.5 });
  const oversizeHeight = await validateCrop({ ...validCrop, height: 2 });
  assert.ok(oversizeX.some((error) => error.property === 'x'));
  assert.ok(oversizeHeight.some((error) => error.property === 'height'));
});

test('裁切 DTO 拒绝零尺寸裁切', async () => {
  const errors = await validateCrop({ ...validCrop, width: 0 });
  assert.ok(errors.some((error) => error.property === 'width'));
});

test('裁切 DTO 拒绝缺失字段', async () => {
  const errors = await validateCrop({ x: 0.1 });
  const properties = errors.map((error) => error.property);
  assert.ok(properties.includes('y'));
  assert.ok(properties.includes('width'));
  assert.ok(properties.includes('height'));
});
