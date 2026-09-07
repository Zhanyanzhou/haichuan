import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { HealthController } from "./health.controller";

const release = {
  revision: "a".repeat(40),
  source: "https://github.com/example/jewelry",
  migrationBundleSha256: "b".repeat(64),
  complete: true,
};

function buildController(options?: { startup?: boolean; draining?: boolean; databaseFails?: boolean }) {
  let databaseChecks = 0;
  const databaseHealth: unknown[] = [];
  const lifecycle = {
    startupComplete: options?.startup ?? true,
    draining: options?.draining ?? false,
    startedAt: "2026-09-06T00:00:00.000Z",
    startupCompletedAt: "2026-09-06T00:00:01.000Z",
    uptimeSeconds: 10,
    release,
  };
  const prisma = {
    $queryRaw: async () => {
      databaseChecks += 1;
      if (options?.databaseFails) throw new Error("connection secret");
      return [{ one: 1 }];
    },
  };
  const metrics = {
    lifecycle: () => lifecycle,
    recordDatabaseHealth: (...args: unknown[]) => databaseHealth.push(args),
    renderPrometheus: async () => "haichuan_startup_complete 1\n",
  };
  return {
    controller: new HealthController(prisma as never, metrics as never),
    databaseChecks: () => databaseChecks,
    databaseHealth,
  };
}

test("liveness 不访问数据库并明确 draining 接流状态", () => {
  const harness = buildController({ draining: true });
  const response = harness.controller.health();
  assert.equal(response.status, "alive");
  assert.equal(response.acceptingTraffic, false);
  assert.equal(harness.databaseChecks(), 0);
});

test("startup 在生命周期完成前返回 503", () => {
  const harness = buildController({ startup: false });
  assert.throws(() => harness.controller.startup(), ServiceUnavailableException);
  assert.equal(harness.databaseChecks(), 0);
});

test("readiness 以数据库探测结果决定接流并记录依赖延迟", async () => {
  const harness = buildController();
  const response = await harness.controller.ready();
  assert.equal(response.status, "ready");
  assert.equal(response.dependencies.database.status, "up");
  assert.equal(harness.databaseChecks(), 1);
  assert.equal(harness.databaseHealth.length, 1);
  assert.equal((harness.databaseHealth[0] as unknown[])[0], true);
});

test("readiness 在 draining 或数据库失败时失败关闭", async () => {
  const draining = buildController({ draining: true });
  await assert.rejects(draining.controller.ready(), ServiceUnavailableException);
  assert.equal(draining.databaseChecks(), 0);

  const unavailable = buildController({ databaseFails: true });
  await assert.rejects(unavailable.controller.ready(), ServiceUnavailableException);
  assert.equal((unavailable.databaseHealth[0] as unknown[])[0], false);
});

test("指标端点使用 Prometheus 文本并直接结束响应", async () => {
  const harness = buildController();
  const state: Record<string, unknown> = {};
  const response = {
    status(code: number) {
      state.status = code;
      return this;
    },
    type(value: string) {
      state.type = value;
      return this;
    },
    send(value: string) {
      state.body = value;
      return this;
    },
  };
  await harness.controller.prometheus(response as never);
  assert.equal(state.status, 200);
  assert.equal(state.type, "text/plain; version=0.0.4; charset=utf-8");
  assert.equal(state.body, "haichuan_startup_complete 1\n");
});

test("探针公开而指标端点继续受全局员工认证", () => {
  assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.health), true);
  assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.startup), true);
  assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.ready), true);
  assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.prometheus), undefined);
});

test("应用入口启用 SIGTERM 和 SIGINT 优雅停机钩子", () => {
  const mainSource = readFileSync(resolve(__dirname, "../../main.ts"), "utf8");
  assert.match(mainSource, /enableShutdownHooks\(\["SIGTERM", "SIGINT"\]\)/);
});

