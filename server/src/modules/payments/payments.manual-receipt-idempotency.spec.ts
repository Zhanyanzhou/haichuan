import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentsController } from './payments.controller';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';

test('异常线下实收控制器把必填幂等键和完整员工 principal 传给服务', async () => {
  const calls: unknown[][] = [];
  const paymentsService = {
    createReceipt: async (...args: unknown[]) => {
      calls.push(args);
      return { id: 1 };
    },
  };
  const controller = new PaymentsController(paymentsService as never, {} as never);
  const body = {
    orderId: 9,
    amount: 30,
    method: 'bank_transfer' as const,
    type: 'DEPOSIT' as const,
    reviewNote: '已核对',
  };
  const user = {
    id: 12,
    username: 'finance-a',
    realName: '财务甲',
    role: 'FINANCE',
  } as StaffPrincipal;

  await controller.createReceipt(body, user, 'manual-receipt-controller');

  assert.deepEqual(calls, [[
    body,
    'manual-receipt-controller',
    user,
  ]]);
});
