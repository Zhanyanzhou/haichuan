import { expect, test } from '@playwright/test';
import { unwrapList, unwrapResponse } from '../src/utils/unwrap';

test.describe('API 响应解包边界', () => {
  test('双层 envelope 与单层 data 保持既有解包语义', () => {
    expect(
      unwrapResponse<{ id: number }>({
        data: { code: 0, data: { id: 7 }, message: 'ok' },
      }),
    ).toEqual({ id: 7 });

    expect(unwrapResponse<{ id: number }>({ data: { id: 8 } })).toEqual({ id: 8 });
    expect(unwrapResponse<{ id: number }>({ id: 9 })).toEqual({ id: 9 });
  });

  test('列表只接受数组或对象中的数组 list', () => {
    expect(unwrapList<number>({ data: { data: [1, 2] } })).toEqual([1, 2]);
    expect(unwrapList<{ id: number }>({ data: { data: { list: [{ id: 1 }] } } })).toEqual([
      { id: 1 },
    ]);
  });

  test('畸形、空值与非数组 list 安全降级', () => {
    expect(unwrapList({ data: { data: { list: 'invalid' } } })).toEqual([]);
    expect(unwrapList(null)).toEqual([]);
    expect(unwrapResponse<null>(undefined)).toBeNull();
  });
});
