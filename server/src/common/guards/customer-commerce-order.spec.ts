import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CustomerCommerceGuard } from './customer-commerce.guard';
import { SettingsController } from '../../modules/settings/settings.controller';
import { CustomersController } from '../../modules/customers/customers.controller';
import { UploadController } from '../../modules/upload/upload.controller';
import { CustomerPaymentsController } from '../../modules/payments/customer-payments.controller';
import { CustomerAuthGuard } from '../../modules/customers/customer-auth.guard';

function guardsOn(target: object, methodName?: string): unknown[] {
  const decorated = (methodName
    ? (target as Record<string, unknown>)[methodName]
    : target) as object;
  return Reflect.getMetadata(GUARDS_METADATA, decorated) ?? [];
}

test('客户交易写接口先认证，再判断交易开关', () => {
  assert.deepEqual(guardsOn(CustomersController.prototype, 'checkout'), [
    CustomerAuthGuard,
    CustomerCommerceGuard,
  ]);
  assert.deepEqual(guardsOn(CustomersController.prototype, 'submitPaymentProof'), [
    CustomerAuthGuard,
    CustomerCommerceGuard,
  ]);
  assert.deepEqual(guardsOn(UploadController.prototype, 'uploadPaymentProof'), [
    CustomerAuthGuard,
    CustomerCommerceGuard,
  ]);
  assert.deepEqual(guardsOn(CustomerPaymentsController), [CustomerAuthGuard]);
  assert.deepEqual(guardsOn(CustomerPaymentsController.prototype, 'create'), [
    CustomerCommerceGuard,
  ]);
  assert.deepEqual(guardsOn(CustomerPaymentsController.prototype, 'close'), [
    CustomerCommerceGuard,
  ]);
});

test('交易开关和 commerce 发布档位必须同时显式开启', () => {
  const previousFlag = process.env.CUSTOMER_COMMERCE_ENABLED;
  const previousProfile = process.env.RELEASE_PROFILE;
  try {
    delete process.env.CUSTOMER_COMMERCE_ENABLED;
    delete process.env.RELEASE_PROFILE;
    assert.throws(
      () => new CustomerCommerceGuard().canActivate(),
      ServiceUnavailableException,
    );

    process.env.CUSTOMER_COMMERCE_ENABLED = 'true';
    process.env.RELEASE_PROFILE = 'lead-generation';
    assert.throws(
      () => new CustomerCommerceGuard().canActivate(),
      ServiceUnavailableException,
    );

    process.env.RELEASE_PROFILE = 'commerce';
    assert.equal(new CustomerCommerceGuard().canActivate(), true);
  } finally {
    if (previousFlag === undefined) delete process.env.CUSTOMER_COMMERCE_ENABLED;
    else process.env.CUSTOMER_COMMERCE_ENABLED = previousFlag;
    if (previousProfile === undefined) delete process.env.RELEASE_PROFILE;
    else process.env.RELEASE_PROFILE = previousProfile;
  }
});

test('公开功能开关与服务端交易守卫使用同一双重门禁', () => {
  const previousFlag = process.env.CUSTOMER_COMMERCE_ENABLED;
  const previousProfile = process.env.RELEASE_PROFILE;
  const previousAnalytics = process.env.ANALYTICS_DASHBOARD_ENABLED;
  const previousPartnerWrite = process.env.PARTNER_APPLICATIONS_WRITE_ENABLED;
  const controller = new SettingsController(undefined as never);
  try {
    process.env.CUSTOMER_COMMERCE_ENABLED = 'true';
    process.env.RELEASE_PROFILE = 'lead-generation';
    delete process.env.ANALYTICS_DASHBOARD_ENABLED;
    delete process.env.PARTNER_APPLICATIONS_WRITE_ENABLED;
    assert.deepEqual(controller.getFlags(), {
      commerceEnabled: false,
      cartEnabled: false,
      paymentEnabled: false,
      partnerApplicationsWriteEnabled: false,
      analyticsDashboardEnabled: true,
    });

    process.env.RELEASE_PROFILE = 'commerce';
    assert.equal(controller.getFlags().commerceEnabled, true);
    process.env.PARTNER_APPLICATIONS_WRITE_ENABLED = 'true';
    assert.equal(controller.getFlags().partnerApplicationsWriteEnabled, true);
  } finally {
    if (previousFlag === undefined) delete process.env.CUSTOMER_COMMERCE_ENABLED;
    else process.env.CUSTOMER_COMMERCE_ENABLED = previousFlag;
    if (previousProfile === undefined) delete process.env.RELEASE_PROFILE;
    else process.env.RELEASE_PROFILE = previousProfile;
    if (previousAnalytics === undefined) delete process.env.ANALYTICS_DASHBOARD_ENABLED;
    else process.env.ANALYTICS_DASHBOARD_ENABLED = previousAnalytics;
    if (previousPartnerWrite === undefined) delete process.env.PARTNER_APPLICATIONS_WRITE_ENABLED;
    else process.env.PARTNER_APPLICATIONS_WRITE_ENABLED = previousPartnerWrite;
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
  assert.match(
    compose,
    /PARTNER_APPLICATIONS_WRITE_ENABLED:\s*"\$\{PARTNER_APPLICATIONS_WRITE_ENABLED:-false\}"/,
  );
  assert.match(exampleEnv, /^PARTNER_APPLICATIONS_WRITE_ENABLED=false$/m);
});
