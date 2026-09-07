import {
  BeforeApplicationShutdown,
  Injectable,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../../modules/settings/settings.service";
import {
  ReleaseIdentity,
  resolveReleaseIdentity,
} from "./release-identity";

const LATENCY_BUCKETS_SECONDS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] as const;

type HttpMetric = {
  method: string;
  route: string;
  count: number;
  errorCount: number;
  sumSeconds: number;
  buckets: number[];
};

type GatewayCallbackMetric = {
  kind: "payment" | "refund";
  provider: "wechat" | "alipay";
  statusClass: "2xx" | "4xx" | "5xx";
  count: number;
  sumSeconds: number;
};

export type LifecycleSnapshot = {
  startupComplete: boolean;
  draining: boolean;
  startedAt: string;
  startupCompletedAt: string | null;
  uptimeSeconds: number;
  release: ReleaseIdentity;
};

type QueueSnapshot = {
  available: boolean;
  pending: number;
  processing: number;
  failed: number;
  oldestAvailableAgeSeconds: number;
};

type BackupSnapshot = {
  available: boolean;
  healthy: boolean;
  storageMounted: boolean;
  markerValid: boolean;
  lastSuccessTimestampSeconds: number;
  ageSeconds: number;
};

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function finiteMetric(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function timestampSeconds(value: unknown): number {
  if (typeof value !== "string") return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp / 1000 : 0;
}

@Injectable()
export class OperationalMetricsService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly processStartedAtMs = Date.now();
  private readonly releaseIdentity = resolveReleaseIdentity();
  private readonly httpMetrics = new Map<string, HttpMetric>();
  private readonly callbackMetrics = new Map<string, GatewayCallbackMetric>();
  private startupCompletedAtMs: number | null = null;
  private draining = false;
  private databaseUp = false;
  private databaseLatencySeconds = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  onApplicationBootstrap(): void {
    this.startupCompletedAtMs = Date.now();
  }

  beforeApplicationShutdown(): void {
    this.draining = true;
  }

  lifecycle(): LifecycleSnapshot {
    return {
      startupComplete: this.startupCompletedAtMs !== null,
      draining: this.draining,
      startedAt: new Date(this.processStartedAtMs).toISOString(),
      startupCompletedAt: this.startupCompletedAtMs === null
        ? null
        : new Date(this.startupCompletedAtMs).toISOString(),
      uptimeSeconds: Math.max(0, (Date.now() - this.processStartedAtMs) / 1000),
      release: this.releaseIdentity,
    };
  }

  recordDatabaseHealth(up: boolean, latencySeconds: number): void {
    this.databaseUp = up;
    this.databaseLatencySeconds = Math.max(0, finiteMetric(latencySeconds));
  }

  recordHttpRequest(input: {
    method: string;
    route: string;
    statusCode: number;
    durationSeconds: number;
  }): void {
    const key = `${input.method}\u0000${input.route}`;
    const metric = this.httpMetrics.get(key) ?? {
      method: input.method,
      route: input.route,
      count: 0,
      errorCount: 0,
      sumSeconds: 0,
      buckets: LATENCY_BUCKETS_SECONDS.map(() => 0),
    };
    const duration = Math.max(0, finiteMetric(input.durationSeconds));
    metric.count += 1;
    metric.sumSeconds += duration;
    if (input.statusCode >= 400) metric.errorCount += 1;
    LATENCY_BUCKETS_SECONDS.forEach((bucket, index) => {
      if (duration <= bucket) metric.buckets[index] += 1;
    });
    this.httpMetrics.set(key, metric);
  }

  recordGatewayCallback(input: {
    kind: "payment" | "refund";
    provider: "wechat" | "alipay";
    statusClass: "2xx" | "4xx" | "5xx";
    durationSeconds: number;
  }): void {
    const key = `${input.kind}\u0000${input.provider}\u0000${input.statusClass}`;
    const metric = this.callbackMetrics.get(key) ?? {
      kind: input.kind,
      provider: input.provider,
      statusClass: input.statusClass,
      count: 0,
      sumSeconds: 0,
    };
    metric.count += 1;
    metric.sumSeconds += Math.max(0, finiteMetric(input.durationSeconds));
    this.callbackMetrics.set(key, metric);
  }

  private async queueSnapshot(): Promise<QueueSnapshot> {
    try {
      const [pending, processing, failed, oldest] = await Promise.all([
        this.prisma.outboxEvent.count({ where: { status: "PENDING" } }),
        this.prisma.outboxEvent.count({ where: { status: "PROCESSING" } }),
        this.prisma.outboxEvent.count({ where: { status: "FAILED" } }),
        this.prisma.outboxEvent.findFirst({
          where: {
            status: { in: ["PENDING", "FAILED"] },
            availableAt: { lte: new Date() },
          },
          orderBy: { availableAt: "asc" },
          select: { availableAt: true },
        }),
      ]);
      return {
        available: true,
        pending,
        processing,
        failed,
        oldestAvailableAgeSeconds: oldest
          ? Math.max(0, (Date.now() - oldest.availableAt.getTime()) / 1000)
          : 0,
      };
    } catch {
      return {
        available: false,
        pending: 0,
        processing: 0,
        failed: 0,
        oldestAvailableAgeSeconds: 0,
      };
    }
  }

  private async backupSnapshot(): Promise<BackupSnapshot> {
    try {
      const status = await this.settings.getBackupStatus() as Record<string, unknown>;
      const lastSuccessTimestampSeconds = timestampSeconds(status.lastSuccessAt);
      return {
        available: true,
        healthy: status.autoBackup === true && status.isHealthy === true,
        storageMounted: status.storageMounted === true,
        markerValid: status.markerValid === true,
        lastSuccessTimestampSeconds,
        ageSeconds: lastSuccessTimestampSeconds > 0
          ? Math.max(0, Date.now() / 1000 - lastSuccessTimestampSeconds)
          : 0,
      };
    } catch {
      return {
        available: false,
        healthy: false,
        storageMounted: false,
        markerValid: false,
        lastSuccessTimestampSeconds: 0,
        ageSeconds: 0,
      };
    }
  }

  async renderPrometheus(): Promise<string> {
    const [queue, backup] = await Promise.all([
      this.queueSnapshot(),
      this.backupSnapshot(),
    ]);
    const lifecycle = this.lifecycle();
    const releaseLabels = [
      `revision="${escapeLabel(lifecycle.release.revision)}"`,
      `source="${escapeLabel(lifecycle.release.source)}"`,
      `migration_bundle_sha256="${escapeLabel(lifecycle.release.migrationBundleSha256)}"`,
      `complete="${lifecycle.release.complete}"`,
    ].join(",");
    const lines = [
      "# HELP haichuan_release_info Immutable release identity supplied by the release pipeline.",
      "# TYPE haichuan_release_info gauge",
      `haichuan_release_info{${releaseLabels}} 1`,
      "# HELP haichuan_process_uptime_seconds Process uptime in seconds.",
      "# TYPE haichuan_process_uptime_seconds gauge",
      `haichuan_process_uptime_seconds ${lifecycle.uptimeSeconds}`,
      "# HELP haichuan_startup_complete Whether Nest application bootstrap completed.",
      "# TYPE haichuan_startup_complete gauge",
      `haichuan_startup_complete ${lifecycle.startupComplete ? 1 : 0}`,
      "# HELP haichuan_draining Whether graceful shutdown has started.",
      "# TYPE haichuan_draining gauge",
      `haichuan_draining ${lifecycle.draining ? 1 : 0}`,
      "# HELP haichuan_dependency_up Last observed dependency health.",
      "# TYPE haichuan_dependency_up gauge",
      `haichuan_dependency_up{dependency="database"} ${this.databaseUp ? 1 : 0}`,
      "# HELP haichuan_dependency_latency_seconds Last observed dependency probe latency.",
      "# TYPE haichuan_dependency_latency_seconds gauge",
      `haichuan_dependency_latency_seconds{dependency="database"} ${this.databaseLatencySeconds}`,
      "# HELP haichuan_outbox_events Current durable queue depth by state.",
      "# TYPE haichuan_outbox_events gauge",
      `haichuan_outbox_events{status="pending"} ${queue.pending}`,
      `haichuan_outbox_events{status="processing"} ${queue.processing}`,
      `haichuan_outbox_events{status="failed"} ${queue.failed}`,
      "# HELP haichuan_outbox_oldest_available_age_seconds Age of the oldest dispatchable queue item.",
      "# TYPE haichuan_outbox_oldest_available_age_seconds gauge",
      `haichuan_outbox_oldest_available_age_seconds ${queue.oldestAvailableAgeSeconds}`,
      "# HELP haichuan_backup_healthy Whether the latest complete backup and execution marker are healthy.",
      "# TYPE haichuan_backup_healthy gauge",
      `haichuan_backup_healthy ${backup.healthy ? 1 : 0}`,
      "# HELP haichuan_backup_last_success_timestamp_seconds Unix timestamp of the last successful backup.",
      "# TYPE haichuan_backup_last_success_timestamp_seconds gauge",
      `haichuan_backup_last_success_timestamp_seconds ${backup.lastSuccessTimestampSeconds}`,
      "# HELP haichuan_backup_age_seconds Age of the last successful backup.",
      "# TYPE haichuan_backup_age_seconds gauge",
      `haichuan_backup_age_seconds ${backup.ageSeconds}`,
      "# HELP haichuan_backup_storage_mounted Whether backup storage is mounted.",
      "# TYPE haichuan_backup_storage_mounted gauge",
      `haichuan_backup_storage_mounted ${backup.storageMounted ? 1 : 0}`,
      "# HELP haichuan_backup_marker_valid Whether the backup execution marker is valid.",
      "# TYPE haichuan_backup_marker_valid gauge",
      `haichuan_backup_marker_valid ${backup.markerValid ? 1 : 0}`,
      "# HELP haichuan_metrics_source_available Whether a live metric source could be read.",
      "# TYPE haichuan_metrics_source_available gauge",
      `haichuan_metrics_source_available{source="outbox"} ${queue.available ? 1 : 0}`,
      `haichuan_metrics_source_available{source="backup"} ${backup.available ? 1 : 0}`,
    ];

    if (this.httpMetrics.size > 0) {
      lines.push(
        "# HELP haichuan_http_requests_total HTTP requests observed by method and route.",
        "# TYPE haichuan_http_requests_total counter",
        "# HELP haichuan_http_request_errors_total HTTP responses with status 4xx or 5xx.",
        "# TYPE haichuan_http_request_errors_total counter",
        "# HELP haichuan_http_request_duration_seconds HTTP request latency.",
        "# TYPE haichuan_http_request_duration_seconds histogram",
      );
      for (const metric of [...this.httpMetrics.values()].sort((left, right) =>
        `${left.method}:${left.route}`.localeCompare(`${right.method}:${right.route}`)
      )) {
        const labels = `method="${escapeLabel(metric.method)}",route="${escapeLabel(metric.route)}"`;
        lines.push(
          `haichuan_http_requests_total{${labels}} ${metric.count}`,
          `haichuan_http_request_errors_total{${labels}} ${metric.errorCount}`,
        );
        LATENCY_BUCKETS_SECONDS.forEach((bucket, index) => {
          lines.push(`haichuan_http_request_duration_seconds_bucket{${labels},le="${bucket}"} ${metric.buckets[index]}`);
        });
        lines.push(
          `haichuan_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${metric.count}`,
          `haichuan_http_request_duration_seconds_sum{${labels}} ${metric.sumSeconds}`,
          `haichuan_http_request_duration_seconds_count{${labels}} ${metric.count}`,
        );
      }
    }

    if (this.callbackMetrics.size > 0) {
      lines.push(
        "# HELP haichuan_gateway_callbacks_total Payment and refund gateway callback outcomes.",
        "# TYPE haichuan_gateway_callbacks_total counter",
        "# HELP haichuan_gateway_callback_duration_seconds Gateway callback handling latency.",
        "# TYPE haichuan_gateway_callback_duration_seconds summary",
      );
      for (const metric of [...this.callbackMetrics.values()].sort((left, right) =>
        `${left.kind}:${left.provider}:${left.statusClass}`.localeCompare(`${right.kind}:${right.provider}:${right.statusClass}`)
      )) {
        const labels = `kind="${metric.kind}",provider="${metric.provider}",status_class="${metric.statusClass}"`;
        lines.push(
          `haichuan_gateway_callbacks_total{${labels}} ${metric.count}`,
          `haichuan_gateway_callback_duration_seconds_sum{${labels}} ${metric.sumSeconds}`,
          `haichuan_gateway_callback_duration_seconds_count{${labels}} ${metric.count}`,
        );
      }
    }

    return `${lines.join("\n")}\n`;
  }
}

