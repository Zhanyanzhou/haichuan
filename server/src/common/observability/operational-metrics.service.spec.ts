import assert from "node:assert/strict";
import test from "node:test";
import { OperationalMetricsService } from "./operational-metrics.service";

function buildService(options?: { queueFails?: boolean; backupFails?: boolean }) {
  const queueFails = options?.queueFails ?? false;
  const prisma = {
    outboxEvent: {
      count: async ({ where }: { where: { status: string } }) => {
        if (queueFails) throw new Error("database secret should not escape");
        return ({ PENDING: 4, PROCESSING: 2, FAILED: 1 } as Record<string, number>)[where.status];
      },
      findFirst: async () => {
        if (queueFails) throw new Error("database secret should not escape");
        return { availableAt: new Date(Date.now() - 10_000) };
      },
    },
  };
  const settings = {
    getBackupStatus: async () => {
      if (options?.backupFails) throw new Error("backup path should not escape");
      return {
        autoBackup: true,
        isHealthy: true,
        storageMounted: true,
        markerValid: true,
        lastSuccessAt: new Date(Date.now() - 20_000).toISOString(),
        latestManifest: "must-not-appear.sha256",
      };
    },
  };
  return new OperationalMetricsService(prisma as never, settings as never);
}

test("生命周期区分启动完成和优雅停机", () => {
  const service = buildService();
  assert.equal(service.lifecycle().startupComplete, false);
  assert.equal(service.lifecycle().draining, false);
  service.onApplicationBootstrap();
  assert.equal(service.lifecycle().startupComplete, true);
  service.beforeApplicationShutdown();
  assert.equal(service.lifecycle().draining, true);
});

test("Prometheus 输出包含请求、错误、回调、队列和备份事实", async () => {
  const service = buildService();
  service.onApplicationBootstrap();
  service.recordDatabaseHealth(true, 0.012);
  service.recordHttpRequest({
    method: "POST",
    route: "/api/payments/notify/:provider",
    statusCode: 500,
    durationSeconds: 0.2,
  });
  service.recordGatewayCallback({
    kind: "payment",
    provider: "wechat",
    statusClass: "5xx",
    durationSeconds: 0.2,
  });

  const output = await service.renderPrometheus();
  assert.match(output, /haichuan_dependency_up\{dependency="database"\} 1/);
  assert.match(output, /haichuan_http_request_errors_total\{method="POST",route="\/api\/payments\/notify\/:provider"\} 1/);
  assert.match(output, /haichuan_gateway_callbacks_total\{kind="payment",provider="wechat",status_class="5xx"\} 1/);
  assert.match(output, /haichuan_outbox_events\{status="pending"\} 4/);
  assert.match(output, /haichuan_outbox_events\{status="processing"\} 2/);
  assert.match(output, /haichuan_outbox_events\{status="failed"\} 1/);
  assert.match(output, /haichuan_backup_healthy 1/);
  assert.equal(output.includes("must-not-appear.sha256"), false);
});

test("指标来源失败时保持可抓取并显式标记不可用", async () => {
  const output = await buildService({ queueFails: true, backupFails: true })
    .renderPrometheus();
  assert.match(output, /haichuan_metrics_source_available\{source="outbox"\} 0/);
  assert.match(output, /haichuan_metrics_source_available\{source="backup"\} 0/);
  assert.equal(output.includes("secret"), false);
  assert.equal(output.includes("backup path"), false);
});

