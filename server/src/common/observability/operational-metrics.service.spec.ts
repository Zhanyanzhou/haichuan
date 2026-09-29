import assert from "node:assert/strict";
import test from "node:test";
import { OperationalMetricsService } from "./operational-metrics.service";

function buildService(options?: {
  queueFails?: boolean;
  backupFails?: boolean;
  onQueueAgeQuery?: (query: QueueAgeQuery) => void;
}) {
  const queueFails = options?.queueFails ?? false;
  const prisma = {
    outboxEvent: {
      count: async ({ where }: { where: { status: string } }) => {
        if (queueFails) throw new Error("database secret should not escape");
        return ({ PENDING: 4, PROCESSING: 2, FAILED: 1 } as Record<string, number>)[where.status];
      },
      findFirst: async (query: QueueAgeQuery) => {
        if (queueFails) throw new Error("database secret should not escape");
        options?.onQueueAgeQuery?.(query);
        return query.orderBy.lockedAt === "asc"
          ? { lockedAt: new Date(Date.now() - 400_000) }
          : { availableAt: new Date(Date.now() - 10_000) };
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

type QueueAgeQuery = {
  where: {
    status: string;
    availableAt?: { lte: Date };
    lockedAt?: { not: null };
  };
  orderBy: { availableAt?: string; lockedAt?: string };
};

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
  service.recordHttpRequest({
    method: "POST",
    route: "/api/inquiries",
    statusCode: 400,
    durationSeconds: 0.03,
  });
  service.recordHttpRequest({
    method: "POST",
    route: "/api/inquiries",
    statusCode: 503,
    durationSeconds: 0.04,
  });

  const output = await service.renderPrometheus();
  assert.match(output, /haichuan_dependency_up\{dependency="database"\} 1/);
  assert.match(output, /haichuan_http_request_errors_total\{method="POST",route="\/api\/payments\/notify\/:provider"\} 1/);
  assert.match(output, /haichuan_http_request_errors_total\{method="POST",route="\/api\/inquiries"\} 2/);
  assert.match(output, /haichuan_http_server_errors_total\{method="POST",route="\/api\/inquiries"\} 1/);
  assert.match(output, /haichuan_gateway_callbacks_total\{kind="payment",provider="wechat",status_class="5xx"\} 1/);
  assert.match(output, /haichuan_outbox_events\{status="pending"\} 4/);
  assert.match(output, /haichuan_outbox_events\{status="processing"\} 2/);
  assert.match(output, /haichuan_outbox_events\{status="failed"\} 1/);
  assert.match(output, /haichuan_outbox_oldest_processing_age_seconds 4\d{2}(?:\.\d+)?/);
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

test("积压年龄区分到期 PENDING 与持有锁的 PROCESSING", async () => {
  const capturedQueries: QueueAgeQuery[] = [];
  await buildService({
    onQueueAgeQuery: (query) => {
      capturedQueries.push(query);
    },
  }).renderPrometheus();

  assert.equal(capturedQueries.length, 2);
  const available = capturedQueries.find((query) => query.orderBy.availableAt === "asc");
  const processing = capturedQueries.find((query) => query.orderBy.lockedAt === "asc");
  assert.ok(available);
  assert.equal(available.where.status, "PENDING");
  assert.ok(available.where.availableAt?.lte instanceof Date);
  assert.deepEqual(available.orderBy, { availableAt: "asc" });
  assert.ok(processing);
  assert.equal(processing.where.status, "PROCESSING");
  assert.deepEqual(processing.where.lockedAt, { not: null });
  assert.deepEqual(processing.orderBy, { lockedAt: "asc" });
});

test("Worker 指标区分启用、运行、成功心跳和失败累计", async () => {
  const service = buildService();
  service.registerWorker("notification_delivery", true);
  service.registerWorker("password_reset_delivery", true);

  service.recordWorkerRunStarted("notification_delivery");
  let output = await service.renderPrometheus();
  assert.match(output, /haichuan_worker_enabled\{worker="notification_delivery"\} 1/);
  assert.match(output, /haichuan_worker_running\{worker="notification_delivery"\} 1/);
  assert.match(output, /haichuan_worker_last_started_timestamp_seconds\{worker="notification_delivery"\} [1-9]\d*(?:\.\d+)?/);
  assert.match(output, /haichuan_worker_last_completed_timestamp_seconds\{worker="notification_delivery"\} 0/);

  service.recordWorkerRunCompleted("notification_delivery", "failure");
  service.registerWorker("notification_delivery", true);
  service.recordWorkerRunStarted("password_reset_delivery");
  service.recordWorkerRunCompleted("password_reset_delivery", "success");
  output = await service.renderPrometheus();
  assert.match(output, /haichuan_worker_running\{worker="notification_delivery"\} 0/);
  assert.match(output, /haichuan_worker_failures_total\{worker="notification_delivery"\} 1/);
  assert.match(output, /haichuan_worker_last_success_timestamp_seconds\{worker="notification_delivery"\} 0/);
  assert.match(output, /haichuan_worker_last_completed_timestamp_seconds\{worker="notification_delivery"\} [1-9]\d*(?:\.\d+)?/);
  assert.match(output, /haichuan_worker_last_success_timestamp_seconds\{worker="password_reset_delivery"\} [1-9]\d*(?:\.\d+)?/);
});
