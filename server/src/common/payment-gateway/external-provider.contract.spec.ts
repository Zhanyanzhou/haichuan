import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExternalProviderError,
  runExternalProviderOperation,
  sanitizeProviderCode,
} from './external-provider.contract';

test('安全查询只对可重试错误有限重试，并保持同一幂等键', async () => {
  const seen: Array<{ attempt: number; key: string }> = [];
  const value = await runExternalProviderOperation(
    async (context) => {
      seen.push({ attempt: context.attempt, key: context.idempotencyKey });
      if (context.attempt === 1) {
        throw new ExternalProviderError(
          'NETWORK',
          '受控网络错误',
          true,
        );
      }
      return 'ok';
    },
    {
      idempotencyKey: 'payment:query:wechat:PAY-1',
      maxAttempts: 2,
      retryDelayMs: 0,
    },
  );

  assert.equal(value, 'ok');
  assert.deepEqual(seen, [
    { attempt: 1, key: 'payment:query:wechat:PAY-1' },
    { attempt: 2, key: 'payment:query:wechat:PAY-1' },
  ]);
});

test('非幂等发送可配置为单次尝试，未知结果不会盲目重试', async () => {
  let calls = 0;
  await assert.rejects(
    runExternalProviderOperation(
      async () => {
        calls += 1;
        throw new ExternalProviderError(
          'UNKNOWN_RESULT',
          '送达结果未知',
          false,
        );
      },
      { idempotencyKey: 'mail:event:42', maxAttempts: 1 },
    ),
    (error: unknown) =>
      error instanceof ExternalProviderError &&
      error.code === 'UNKNOWN_RESULT' &&
      error.retryable === false,
  );
  assert.equal(calls, 1);
});

test('超时会中止 signal 并返回可分类错误', async () => {
  let aborted = false;
  await assert.rejects(
    runExternalProviderOperation(
      async ({ signal }) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              resolve();
            },
            { once: true },
          );
        });
        return 'late';
      },
      {
        idempotencyKey: 'tracking:query:abc',
        timeoutMs: 100,
        maxAttempts: 1,
      },
    ),
    (error: unknown) =>
      error instanceof ExternalProviderError && error.code === 'TIMEOUT',
  );
  assert.equal(aborted, true);
});

test('幂等键和 provider code 都使用白名单', async () => {
  await assert.rejects(
    runExternalProviderOperation(async () => 'never', {
      idempotencyKey: 'bad key with spaces',
    }),
    (error: unknown) =>
      error instanceof ExternalProviderError &&
      error.code === 'INVALID_REQUEST',
  );
  assert.equal(sanitizeProviderCode(' acq.trade_not_exist '), 'ACQ.TRADE_NOT_EXIST');
  assert.equal(sanitizeProviderCode('secret path C:\\private'), undefined);
});


