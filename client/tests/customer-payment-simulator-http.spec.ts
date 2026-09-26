import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { devices, expect, test, type Page } from "@playwright/test";

// 本用例启动真实 Nest HTTP 候选（ts-node + server 源码），依赖 server/node_modules。
// 确定性 CI 分区只安装 client 依赖，按既有真实闭环约定在本地或含 server 依赖的环境执行。
const serverDepsAvailable = existsSync(fileURLToPath(new URL(
  "../../server/node_modules/ts-node/register/transpile-only.js",
  import.meta.url,
)));

type CandidateDescriptor = {
  type: "ready";
  baseUrl: string;
  simulatorBaseUrl: string;
  token: string;
};

type UpstreamRequest = {
  method: string;
  path: string;
  status: number;
  body: unknown;
};

let candidateProcess: ChildProcessWithoutNullStreams | undefined;
let candidate: CandidateDescriptor;

function startCandidate(): Promise<CandidateDescriptor> {
  const script = fileURLToPath(new URL(
    "../../server/scripts/start-customer-payment-http-candidate.cjs",
    import.meta.url,
  ));
  const serverDirectory = fileURLToPath(new URL("../../server/", import.meta.url));
  candidateProcess = spawn(process.execPath, [script], {
    cwd: serverDirectory,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error(`支付 HTTP 候选启动超时：${stderr || stdout}`));
    }, 20_000);

    candidateProcess!.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    candidateProcess!.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      const lines = stdout.split(/\r?\n/);
      const readyLine = lines.find((line) =>
        line.startsWith("PAYMENT_HTTP_CANDIDATE_READY "),
      );
      if (!readyLine) return;
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(
          readyLine.slice("PAYMENT_HTTP_CANDIDATE_READY ".length),
        ) as CandidateDescriptor);
      } catch (error) {
        reject(new Error(`支付 HTTP 候选描述无效：${String(error)}；${stdout}`));
      }
    });
    candidateProcess!.once("exit", (code) => {
      if (!candidate) {
        clearTimeout(timeout);
        reject(new Error(`支付 HTTP 候选提前退出（${code}）：${stderr || stdout}`));
      }
    });
  });
}

async function connectBrowserToCandidate(page: Page) {
  const requests: UpstreamRequest[] = [];
  await page.context().addCookies([{
    name: "hc_customer_access",
    value: candidate.token,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  }]);
  await page.route("**/api/customers/me/**", async (route) => {
    const request = route.request();
    const original = new URL(request.url());
    const upstreamUrl = `${candidate.baseUrl}${original.pathname.slice(4)}${original.search}`;
    const response = await route.fetch({
      url: upstreamUrl,
      headers: {
        ...request.headers(),
        cookie: `hc_customer_access=${candidate.token}`,
      },
    });
    const body = await response.body();
    let parsedBody: unknown = body.toString("utf8");
    try {
      parsedBody = JSON.parse(parsedBody as string);
    } catch {
      // 非 JSON 响应保持原始文本，便于失败诊断。
    }
    requests.push({
      method: request.method(),
      path: original.pathname,
      status: response.status(),
      body: parsedBody,
    });
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body,
    });
  });
  return requests;
}

test.describe("客户付款弹窗连接本机真实 Nest HTTP 候选", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    test.skip(
      !serverDepsAvailable,
      "需要 server 端依赖（真实 Nest HTTP 候选）；确定性 CI 分区不安装 server 依赖，本用例在本地或含 server 依赖的环境执行",
    );
    candidate = await startCandidate();
  });

  test.afterAll(async () => {
    if (!candidateProcess || candidateProcess.killed) return;
    candidateProcess.kill();
  });

  test("390px 手机缺少真实代理客户 IP 时由服务端失败关闭且不展示付款入口", async ({ browser }) => {
    const context = await browser.newContext({
      ...devices["Pixel 5"],
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    try {
      const requests = await connectBrowserToCandidate(page);

      await page.goto("/tests/fixtures/customer-payment-simulator-http.html");

      const dialog = page.getByRole("dialog", { name: "微信支付" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("微信 H5 支付无法识别真实客户 IP，请检查反向代理配置")).toBeVisible();
      await expect(dialog.getByText("本次支付请求未被受理", { exact: true })).toBeVisible();
      await expect(dialog.locator("canvas")).toHaveCount(0);
      await expect.poll(() => requests).toMatchObject([{
        method: "POST",
        path: "/api/customers/me/orders/9/payment",
        status: 400,
      }]);
      expect(await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )).toBe(false);
    } finally {
      await context.close();
    }
  });

  test("桌面端经真实 Guard 与支付服务创建二维码并查单收口为已支付", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const requests = await connectBrowserToCandidate(page);

    await page.goto("/tests/fixtures/customer-payment-simulator-http.html");

    const dialog = page.getByRole("dialog", { name: "微信支付" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("ORD-HTTP-SIM-9")).toBeVisible();
    await expect(dialog.getByText("本期应付（全款）", { exact: true })).toBeVisible();
    await expect(dialog.getByText("¥88.8", { exact: true })).toHaveCount(2);
    await expect(dialog.locator("canvas")).toBeVisible();
    await expect(dialog.getByText("请使用微信扫描二维码完成支付")).toBeVisible();

    const createRequest = requests.find((request) => request.method === "POST");
    expect(createRequest).toMatchObject({
      path: "/api/customers/me/orders/9/payment",
      status: 201,
      body: {
        data: {
          provider: "wechat",
          scene: "native",
          reused: false,
          payment: { amount: 88.8, type: "FULL" },
        },
      },
    });
    expect(
      (createRequest?.body as { data?: { qrCode?: string } })?.data?.qrCode,
    ).toMatch(new RegExp(`^${candidate.simulatorBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/checkout/wechat/`));

    await dialog.getByRole("button", { name: "我已完成支付，查询结果" }).click();
    await expect(page.getByRole("status").getByText("支付已确认")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => requests.filter((request) => request.method === "GET")).toMatchObject([{
      path: "/api/customers/me/orders/9/payment",
      status: 200,
      body: {
        data: {
          state: "PAID",
          gatewayState: "SUCCESS",
        },
      },
    }]);
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )).toBe(false);
  });
});
