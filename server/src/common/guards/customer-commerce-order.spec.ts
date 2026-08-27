import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { CustomerCommerceGuard } from './customer-commerce.guard';

const source = readFileSync(
  join(process.cwd(), 'src/modules/customers/customers.controller.ts'),
  'utf8',
);
const uploadSource = readFileSync(
  join(process.cwd(), 'src/modules/upload/upload.controller.ts'),
  'utf8',
);

test('客户交易写接口先认证，再判断交易开关', () => {
  const customerRoutes = ["checkout", "me/orders/:id/payment-proof"];
  for (const route of customerRoutes) {
    assert.match(
      source,
      new RegExp(
        `@UseGuards\\(CustomerAuthGuard, CustomerCommerceGuard\\)[\\s\\S]{0,320}@Post\\('${route.replace(/[/:]/g, '\\$&')}'\\)`,
      ),
    );
  }
  assert.match(
    uploadSource,
    /@UseGuards\(CustomerAuthGuard, CustomerCommerceGuard\)[\s\S]{0,320}@Post\('payment-proof'\)/,
  );
});

test('交易开关默认关闭，显式 true 才放行已认证请求', () => {
  const previous = process.env.CUSTOMER_COMMERCE_ENABLED;
  try {
    delete process.env.CUSTOMER_COMMERCE_ENABLED;
    assert.throws(
      () => new CustomerCommerceGuard().canActivate(),
      ServiceUnavailableException,
    );

    process.env.CUSTOMER_COMMERCE_ENABLED = 'true';
    assert.equal(new CustomerCommerceGuard().canActivate(), true);
  } finally {
    if (previous === undefined) delete process.env.CUSTOMER_COMMERCE_ENABLED;
    else process.env.CUSTOMER_COMMERCE_ENABLED = previous;
  }
});

test('Compose 与示例配置默认关闭交易', () => {
  const workspaceRoot = join(process.cwd(), '..');
  const compose = readFileSync(join(workspaceRoot, 'docker-compose.yml'), 'utf8');
  const exampleEnv = readFileSync(join(workspaceRoot, '.env.example'), 'utf8');

  assert.match(
    compose,
    /CUSTOMER_COMMERCE_ENABLED:\s*"\$\{CUSTOMER_COMMERCE_ENABLED:-false\}"/,
  );
  assert.match(exampleEnv, /^CUSTOMER_COMMERCE_ENABLED=false$/m);
});
