# When to Mock vs Use Real Services

> **When to use**: When deciding whether to mock API calls, intercept network requests, or hit real services in your Playwright tests.
> **Prerequisites**: [locators.md](locators.md), [assertions-and-waiting.md](assertions-and-waiting.md)

## Quick Answer

**Use layered confidence.** Mock third-party boundaries by default in routine CI. Separately verify third-party capabilities included in the release against provider sandboxes or approved test environments. Test critical frontend-to-backend flows with the real local/test API and relevant persistence, read-back, roles and consumer results; static or mocked contract checks are supplementary. You may Mock your own API to create deterministic UI, visual, loading, empty, error, permission and boundary states, but label those tests as mocked and never count them as proof of real integration.

Real-service tests require the environment, test identities/data and any external side effects to be covered by current authorization under `AGENTS.md`. A sandbox, nightly schedule or example below does not authorize payment, message delivery or production access. Production defaults to authorized read-only smoke; precisely authorized controlled acceptance follows `AGENTS.md` without requesting the same permission again. Disabled or out-of-scope release capabilities need an explicit applicability record, not a fabricated integration PASS.

## Decision Flowchart

```
Is this service part of YOUR codebase (your API, your backend)?
├── YES → What confidence does this test need?
│   ├── Critical business integration → use the real local/test API and relevant persistence/read-back.
│   ├── Static or mocked contract checks → supplementary evidence; not a substitute for real integration.
│   ├── Deterministic UI / visual / failure state → Mock is allowed; label it and keep separate real coverage.
│   └── Service is slow or flaky → investigate the service; do not hide the only integration path behind mocks.
└── NO → It's a third-party service.
    ├── Routine CI / deterministic UI / failure states
    │   └── Default to Mock; use sanitized HAR for complex sequences.
    ├── Capability included in the release
    │   └── Also verify real integration in a provider sandbox or approved test environment.
    │       Cover success, actual failure/retry and callback/delivery/persistence where applicable.
    │       Respect authorized side effects, rate limits and cost; missing access remains unverified.
    └── Capability disabled or outside the approved release scope
        └── Record why it is disabled/not applicable; do not claim real integration from Mock results.
```

## Decision Matrix

| Scenario | Mock? | Why | Strategy |
|---|---|---|---|
| Your own REST/GraphQL API | Depends on test layer | Real API and relevant persistence for critical flows; static/mocked contracts are supplementary | Keep mocked suites clearly named and retain separate real integration coverage |
| Your database (through your API) | Real for persistence/integration | Data round-trips require the real stack; UI-only suites may replace the API boundary | Seed isolated test data for integration; never claim a UI mock validates persistence |
| Authentication (your auth system) | Mostly no | Auth bugs are critical; test the real flow | Use `storageState` to skip login in most tests, but keep a few real login tests |
| Stripe / payment gateway | Routine CI: default Mock | Bound cost and side effects in CI | `route.fulfill()` for UI; approved provider test mode for released payment flows and applicable callbacks/refunds/reconciliation |
| SendGrid / email service | Routine CI: default Mock | Avoid unintended delivery | Verify mocked payloads; separately verify approved test recipients or provider sandbox delivery, failure and retry evidence |
| OAuth providers (Google, GitHub) | Routine CI: default Mock | Redirect-heavy, rate-limited, CAPTCHAs | Mock token exchange for UI; verify released login/callback flows with approved provider test accounts |
| Analytics (Segment, Mixpanel) | Routine CI: default Mock | Avoid polluting analytics | `route.abort()` or `route.fulfill()`; verify released integration against an approved test property |
| Maps / geocoding APIs | Routine CI: default Mock | Bound rate limits and cost | Static responses for UI; approved real integration checks when included in the release |
| Feature flags (LaunchDarkly, etc.) | Usually | Control test conditions deterministically | Mock to force specific flag states |
| CDN / static assets | Never | Already fast, part of your infra | Let them load normally |
| Flaky external dependency | Routine CI: Mock; approved integration: real | Separate deterministic feedback from release evidence | Explicit test tier and approved environment; do not hide a release integration failure |
| Slow external dependency | Dev/CI: Mock; approved integration: real | Fast feedback plus bounded integration checks | Separate projects; a nightly schedule alone does not authorize external actions |

## Mocking Strategies

### Full Mock (route.fulfill)

**Use when**: You want to completely replace a third-party API response. The most common mocking strategy.

**TypeScript**
```typescript
import { test, expect } from '@playwright/test';

test('checkout flow with mocked payment API', async ({ page }) => {
  // Mock Stripe payment intent creation
  await page.route('**/api/create-payment-intent', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clientSecret: 'pi_mock_secret_123',
        amount: 9900,
        currency: 'usd',
      }),
    });
  });

  // Mock Stripe confirmation
  await page.route('**/api/confirm-payment', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'succeeded',
        receiptUrl: 'https://receipt.example.com/123',
      }),
    });
  });

  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay $99.00' }).click();
  await expect(page.getByText('Payment successful')).toBeVisible();
});

test('handle payment failure gracefully', async ({ page }) => {
  // Mock a declined card response
  await page.route('**/api/confirm-payment', (route) => {
    route.fulfill({
      status: 402,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'card_declined', message: 'Your card was declined.' },
      }),
    });
  });

  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay $99.00' }).click();
  await expect(page.getByRole('alert')).toContainText('card was declined');
});
```

**JavaScript**
```javascript
const { test, expect } = require('@playwright/test');

test('checkout flow with mocked payment API', async ({ page }) => {
  await page.route('**/api/create-payment-intent', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clientSecret: 'pi_mock_secret_123',
        amount: 9900,
        currency: 'usd',
      }),
    });
  });

  await page.route('**/api/confirm-payment', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'succeeded',
        receiptUrl: 'https://receipt.example.com/123',
      }),
    });
  });

  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay $99.00' }).click();
  await expect(page.getByText('Payment successful')).toBeVisible();
});

test('handle payment failure gracefully', async ({ page }) => {
  await page.route('**/api/confirm-payment', (route) => {
    route.fulfill({
      status: 402,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'card_declined', message: 'Your card was declined.' },
      }),
    });
  });

  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay $99.00' }).click();
  await expect(page.getByRole('alert')).toContainText('card was declined');
});
```

### Partial Mock (Modify Responses)

**Use when**: You want the real API call to happen but need to tweak the response -- injecting error states, adding edge-case data, or overriding a single field.

**TypeScript**
```typescript
import { test, expect } from '@playwright/test';

test('show warning when inventory is low', async ({ page }) => {
  // Let the real API call go through, but override the stock count
  await page.route('**/api/products/*', async (route) => {
    const response = await route.fetch(); // forward to real server
    const body = await response.json();

    // Modify just the field we care about
    body.stockCount = 2;
    body.lowStockWarning = true;

    await route.fulfill({
      response, // preserve headers, status
      body: JSON.stringify(body),
    });
  });

  await page.goto('/products/running-shoes');
  await expect(page.getByText('Only 2 left in stock')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to cart' })).toBeEnabled();
});

test('inject additional items into a real API response', async ({ page }) => {
  await page.route('**/api/notifications', async (route) => {
    const response = await route.fetch();
    const body = await response.json();

    // Append a test notification to whatever real data comes back
    body.notifications.push({
      id: 'test-notif',
      message: 'Your export is ready',
      type: 'success',
      read: false,
    });

    await route.fulfill({
      response,
      body: JSON.stringify(body),
    });
  });

  await page.goto('/dashboard');
  await expect(page.getByText('Your export is ready')).toBeVisible();
});
```

**JavaScript**
```javascript
const { test, expect } = require('@playwright/test');

test('show warning when inventory is low', async ({ page }) => {
  await page.route('**/api/products/*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();

    body.stockCount = 2;
    body.lowStockWarning = true;

    await route.fulfill({
      response,
      body: JSON.stringify(body),
    });
  });

  await page.goto('/products/running-shoes');
  await expect(page.getByText('Only 2 left in stock')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to cart' })).toBeEnabled();
});

test('inject additional items into a real API response', async ({ page }) => {
  await page.route('**/api/notifications', async (route) => {
    const response = await route.fetch();
    const body = await response.json();

    body.notifications.push({
      id: 'test-notif',
      message: 'Your export is ready',
      type: 'success',
      read: false,
    });

    await route.fulfill({
      response,
      body: JSON.stringify(body),
    });
  });

  await page.goto('/dashboard');
  await expect(page.getByText('Your export is ready')).toBeVisible();
});
```

### Record and Replay (HAR Files)

**Use when**: Complex API sequences with many endpoints (OAuth flows, multi-step wizards, dashboard data loading). Record once from a real session, replay deterministically. Update the recording periodically so mocks do not drift from reality.

**Recording a HAR file:**

**TypeScript**
```typescript
import { test } from '@playwright/test';

// Record HAR — run this once, then commit the .har file
test('record API traffic for dashboard', async ({ page }) => {
  await page.routeFromHAR('tests/fixtures/dashboard.har', {
    url: '**/api/**',
    update: true, // record mode: forwards requests and saves responses
  });

  await page.goto('/dashboard');
  // Interact with the page to capture all relevant API calls
  await page.getByRole('tab', { name: 'Analytics' }).click();
  await page.getByRole('tab', { name: 'Users' }).click();
  await page.getByRole('button', { name: 'Load more' }).click();

  // HAR file is saved automatically when the page closes
});
```

**Replaying a HAR file:**

**TypeScript**
```typescript
import { test, expect } from '@playwright/test';

test('dashboard loads with recorded data', async ({ page }) => {
  // Replay mode: serves responses from the HAR file
  await page.routeFromHAR('tests/fixtures/dashboard.har', {
    url: '**/api/**',
    update: false, // replay mode (default)
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(page.getByTestId('revenue-chart')).toBeVisible();
});
```

**JavaScript**
```javascript
const { test, expect } = require('@playwright/test');

// Record
test('record API traffic for dashboard', async ({ page }) => {
  await page.routeFromHAR('tests/fixtures/dashboard.har', {
    url: '**/api/**',
    update: true,
  });

  await page.goto('/dashboard');
  await page.getByRole('tab', { name: 'Analytics' }).click();
  await page.getByRole('tab', { name: 'Users' }).click();
  await page.getByRole('button', { name: 'Load more' }).click();
});

// Replay
test('dashboard loads with recorded data', async ({ page }) => {
  await page.routeFromHAR('tests/fixtures/dashboard.har', {
    url: '**/api/**',
    update: false,
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(page.getByTestId('revenue-chart')).toBeVisible();
});
```

**HAR maintenance workflow:**
1. Record HAR files against a known-good staging environment.
2. Sanitize HAR files before version control; never commit real customer, order, payment, token, cookie or contact data.
3. Re-record monthly or when APIs change. Add a CI reminder or calendar event.
4. Use `update: true` in a dedicated test file to refresh recordings.
5. Scope HAR to specific URL patterns (`url: '**/api/v2/**'`) so unrelated requests still hit real servers.

### Blocking Unwanted Requests

**Use when**: Third-party scripts (analytics, ads, chat widgets) slow down tests and add no value. Block them outright.

**TypeScript**
```typescript
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Block analytics and tracking — they slow tests and add no coverage
  await page.route('**/{google-analytics,segment,hotjar,intercom}.{com,io}/**', (route) => {
    route.abort();
  });

  // Block all image requests in tests that don't need them
  // await page.route('**/*.{png,jpg,jpeg,gif,svg,webp}', (route) => route.abort());
});

test('page loads fast without third-party scripts', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

**JavaScript**
```javascript
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('**/{google-analytics,segment,hotjar,intercom}.{com,io}/**', (route) => {
    route.abort();
  });
});

test('page loads fast without third-party scripts', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

## Real Service Strategies

### Against Staging Environment

**Use when**: You have a shared staging environment that mirrors production. Best for integration confidence.

**TypeScript**
```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: process.env.CI
      ? 'https://staging.yourapp.com'
      : 'http://localhost:3000',
  },
  projects: [
    {
      name: 'integration',
      testMatch: '**/*.integration.spec.ts',
      use: { baseURL: 'https://staging.yourapp.com' },
    },
    {
      name: 'e2e',
      testMatch: '**/*.e2e.spec.ts',
      use: { baseURL: 'http://localhost:3000' },
    },
  ],
});
```

**JavaScript**
```javascript
// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  use: {
    baseURL: process.env.CI
      ? 'https://staging.yourapp.com'
      : 'http://localhost:3000',
  },
  projects: [
    {
      name: 'integration',
      testMatch: '**/*.integration.spec.js',
      use: { baseURL: 'https://staging.yourapp.com' },
    },
    {
      name: 'e2e',
      testMatch: '**/*.e2e.spec.js',
      use: { baseURL: 'http://localhost:3000' },
    },
  ],
});
```

### Against Local Dev Server

**Use when**: Fastest feedback loop. Run your backend locally and test against it.

**TypeScript**
```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI, // start fresh in CI, reuse locally
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
});
```

**JavaScript**
```javascript
// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
});
```

### Against Test Containers

**Use when**: You need a fully isolated environment with databases, caches, and services. Best for reproducible CI runs.

**TypeScript**
```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  webServer: {
    command: 'docker compose -f docker-compose.test.yml up --wait',
    url: 'http://localhost:3000/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // containers take longer to start
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
  // Global teardown to stop containers
  globalTeardown: './tests/global-teardown.ts',
});
```

```typescript
// tests/global-teardown.ts
import { execSync } from 'child_process';

export default function globalTeardown() {
  if (process.env.CI) {
    execSync('docker compose -f docker-compose.test.yml down -v');
  }
}
```

**JavaScript**
```javascript
// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  webServer: {
    command: 'docker compose -f docker-compose.test.yml up --wait',
    url: 'http://localhost:3000/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
  globalTeardown: './tests/global-teardown.js',
});
```

```javascript
// tests/global-teardown.js
const { execSync } = require('child_process');

module.exports = function globalTeardown() {
  if (process.env.CI) {
    execSync('docker compose -f docker-compose.test.yml down -v');
  }
};
```

## Hybrid Approach

The strongest test suites combine real and mocked services. The principle: **verify critical flows through your real API and persistence, default to mocked external boundaries in routine CI, and separately verify released third-party capabilities in approved environments.** Static/mocked contracts and deterministic UI states remain supplementary evidence.

### Fixture-Based Mock Control

Create a fixture that lets individual tests opt into mocking specific services while keeping everything else real.

**TypeScript**
```typescript
// tests/fixtures/mock-fixtures.ts
import { test as base } from '@playwright/test';

type MockOptions = {
  mockPayments: boolean;
  mockEmail: boolean;
  mockAnalytics: boolean;
};

export const test = base.extend<MockOptions>({
  mockPayments: [true, { option: true }],  // default: mock payments
  mockEmail: [true, { option: true }],     // default: mock email
  mockAnalytics: [true, { option: true }], // default: mock analytics

  page: async ({ page, mockPayments, mockEmail, mockAnalytics }, use) => {
    if (mockPayments) {
      await page.route('**/api/payments/**', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'succeeded', id: 'pay_mock_123' }),
        });
      });
    }

    if (mockEmail) {
      await page.route('**/api/send-email', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ messageId: 'msg_mock_456' }),
        });
      });
    }

    if (mockAnalytics) {
      await page.route('**/{segment,google-analytics,mixpanel}.**/**', (route) => {
        route.abort();
      });
    }

    await use(page);
  },
});

export { expect } from '@playwright/test';
```

```typescript
// tests/checkout.spec.ts
import { test, expect } from './fixtures/mock-fixtures';

// Uses defaults: payments mocked, email mocked, analytics blocked
test('checkout sends confirmation email', async ({ page }) => {
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay $99.00' }).click();
  await expect(page.getByText('Confirmation email sent')).toBeVisible();
});

// Override: test with real payment API (nightly integration test)
test.describe('nightly integration', () => {
  test.use({ mockPayments: false });

  test('real payment flow against Stripe test mode', async ({ page }) => {
    await page.goto('/checkout');
    // This hits the real Stripe test API
    await page.getByRole('button', { name: 'Pay $99.00' }).click();
    await expect(page.getByText('Payment successful')).toBeVisible();
  });
});
```

**JavaScript**
```javascript
// tests/fixtures/mock-fixtures.js
const { test: base } = require('@playwright/test');

const test = base.extend({
  mockPayments: [true, { option: true }],
  mockEmail: [true, { option: true }],
  mockAnalytics: [true, { option: true }],

  page: async ({ page, mockPayments, mockEmail, mockAnalytics }, use) => {
    if (mockPayments) {
      await page.route('**/api/payments/**', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'succeeded', id: 'pay_mock_123' }),
        });
      });
    }

    if (mockEmail) {
      await page.route('**/api/send-email', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ messageId: 'msg_mock_456' }),
        });
      });
    }

    if (mockAnalytics) {
      await page.route('**/{segment,google-analytics,mixpanel}.**/**', (route) => {
        route.abort();
      });
    }

    await use(page);
  },
});

module.exports = { test, expect: require('@playwright/test').expect };
```

```javascript
// tests/checkout.spec.js
const { test, expect } = require('./fixtures/mock-fixtures');

test('checkout sends confirmation email', async ({ page }) => {
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Pay $99.00' }).click();
  await expect(page.getByText('Confirmation email sent')).toBeVisible();
});

test.describe('nightly integration', () => {
  test.use({ mockPayments: false });

  test('real payment flow against Stripe test mode', async ({ page }) => {
    await page.goto('/checkout');
    await page.getByRole('button', { name: 'Pay $99.00' }).click();
    await expect(page.getByText('Payment successful')).toBeVisible();
  });
});
```

### Environment-Based Mocking

Split test projects by environment to run mocked tests in every CI push and real-integration tests on an approved schedule. The nightly examples below require approved test endpoints, identities, data and side effects; their frequency does not authorize those actions.

**TypeScript**
```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'fast-ci',
      testMatch: '**/*.spec.ts',
      use: {
        baseURL: 'http://localhost:3000',
        // All external services mocked via fixtures
      },
    },
    {
      name: 'nightly-integration',
      testMatch: '**/*.integration.spec.ts',
      use: {
        baseURL: 'https://staging.yourapp.com',
        // Real services, longer timeouts
      },
      timeout: 120_000,
    },
  ],
});
```

**JavaScript**
```javascript
// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  projects: [
    {
      name: 'fast-ci',
      testMatch: '**/*.spec.js',
      use: {
        baseURL: 'http://localhost:3000',
      },
    },
    {
      name: 'nightly-integration',
      testMatch: '**/*.integration.spec.js',
      use: {
        baseURL: 'https://staging.yourapp.com',
      },
      timeout: 120_000,
    },
  ],
});
```

### Verifying Mock Accuracy

Mock responses drift from real APIs over time. Guard against this.

**TypeScript**
```typescript
import { test, expect } from '@playwright/test';

// Run this weekly or when APIs change — validates that mocks match reality
test.describe('mock contract validation', () => {
  test('payment mock matches real Stripe test API shape', async ({ request }) => {
    // Hit the real API
    const realResponse = await request.post('/api/create-payment-intent', {
      data: { amount: 9900, currency: 'usd' },
    });
    const realBody = await realResponse.json();

    // Verify mock has the same shape
    const mockBody = {
      clientSecret: 'pi_mock_secret_123',
      amount: 9900,
      currency: 'usd',
    };

    // Same keys exist in both
    expect(Object.keys(mockBody).sort()).toEqual(Object.keys(realBody).sort());

    // Same types for each key
    for (const key of Object.keys(mockBody)) {
      expect(typeof mockBody[key]).toBe(typeof realBody[key]);
    }
  });
});
```

**JavaScript**
```javascript
const { test, expect } = require('@playwright/test');

test.describe('mock contract validation', () => {
  test('payment mock matches real Stripe test API shape', async ({ request }) => {
    const realResponse = await request.post('/api/create-payment-intent', {
      data: { amount: 9900, currency: 'usd' },
    });
    const realBody = await realResponse.json();

    const mockBody = {
      clientSecret: 'pi_mock_secret_123',
      amount: 9900,
      currency: 'usd',
    };

    expect(Object.keys(mockBody).sort()).toEqual(Object.keys(realBody).sort());

    for (const key of Object.keys(mockBody)) {
      expect(typeof mockBody[key]).toBe(typeof realBody[key]);
    }
  });
});
```

## Anti-Patterns

| Don't Do This | Problem | Do This Instead |
|---|---|---|
| Mock your own API and report the test as E2E integration | The frontend and backend may be incompatible even though the UI test passes. | Label it as mocked UI/visual/failure-state coverage and separately verify the real API and relevant persistence/read-back. |
| Mock everything for speed | Tests pass, app breaks. You have zero integration coverage. | Mock only external boundaries. Optimize your own services for test speed. |
| Never mock anything | Routine tests become slow and fail on unrelated provider outages. | Default to mocked third-party boundaries in routine CI; retain separate approved real integration checks for released capabilities. |
| Use outdated mocks that do not match the real API | Mock returns `{ status: "ok" }` but real API returns `{ status: "success", data: {...} }`. Tests pass, production breaks. | Run contract validation tests periodically. Re-record HAR files monthly. |
| Mock at the wrong layer (intercepting your own frontend HTTP client) | Bypasses request/response serialization, headers, error handling. | Mock at the network level with `page.route()`. This tests your full HTTP client code. |
| Copy-paste mock responses across dozens of test files | One API change requires updating 40 files. Mocks diverge. | Centralize mocks in fixtures or helper files. Single source of truth. |
| Mock with `page.evaluate()` to stub `fetch`/`XMLHttpRequest` | Fragile, does not survive navigation, misses service workers. | Use `page.route()` which intercepts at the network layer. |
| Block all network requests and whitelist | Extremely brittle. Every new API endpoint requires a whitelist update. Tests break on any backend change. | Allow all traffic by default. Selectively mock only the third-party services you need to. |

## Related

- [core/network-mocking.md](network-mocking.md) -- detailed network interception patterns and API
- [core/api-testing.md](api-testing.md) -- testing your API directly with `request` context
- [core/authentication.md](authentication.md) -- when to mock auth vs test real login flows
- [core/fixtures-and-hooks.md](fixtures-and-hooks.md) -- building reusable mock fixtures
- [core/configuration.md](configuration.md) -- `webServer`, `baseURL`, and project configuration
- [ci/ci-github-actions.md](../ci/ci-github-actions.md) -- CI setup for different test tiers
