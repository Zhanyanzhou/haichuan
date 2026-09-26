import { createPaymentSimulatorServer } from '../common/payment-gateway/payment-simulator.server';

const ALLOWED_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 未设置`);
  return value;
}

function resolvePort(value = process.env.PAYMENT_SIMULATOR_PORT): number {
  const port = Number(value ?? '4319');
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error('PAYMENT_SIMULATOR_PORT 必须是 1024-65535 的整数');
  }
  return port;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('支付 simulator 禁止在生产环境启动');
  }
  const host = process.env.PAYMENT_SIMULATOR_HOST?.trim() || '127.0.0.1';
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error('PAYMENT_SIMULATOR_HOST 必须是回环地址');
  }
  const signingSecret = required('PAYMENT_SIMULATOR_SIGNING_SECRET');
  if (Buffer.byteLength(signingSecret, 'utf8') < 32) {
    throw new Error('PAYMENT_SIMULATOR_SIGNING_SECRET 至少需要 32 字节');
  }
  const simulator = createPaymentSimulatorServer({ signingSecret });
  const origin = await simulator.listen(resolvePort(), host);
  process.stdout.write(`隔离支付 simulator 已监听 ${origin}\n`);

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await simulator.close();
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : '支付 simulator 启动失败'}\n`,
  );
  process.exitCode = 1;
});
