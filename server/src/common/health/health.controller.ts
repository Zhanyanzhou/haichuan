import {
  Controller,
  Get,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../decorators/public.decorator";
import { OperationalMetricsService } from "../observability/operational-metrics.service";
import { PrismaService } from "../prisma/prisma.service";

const DATABASE_PROBE_TIMEOUT_MS = 2_000;
const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: OperationalMetricsService,
  ) {}

  /** 进程存活不依赖外部服务；draining 期间仍存活，但不再视为可接流量。 */
  @Public()
  @Get("health")
  health() {
    const lifecycle = this.metrics.lifecycle();
    return {
      status: "alive",
      acceptingTraffic: !lifecycle.draining,
      lifecycle,
      timestamp: new Date().toISOString(),
    };
  }

  /** 启动探针只表达 Nest 生命周期已完成，不把数据库瞬时波动误判为启动失败。 */
  @Public()
  @Get("startup")
  startup() {
    const lifecycle = this.metrics.lifecycle();
    if (!lifecycle.startupComplete) {
      throw new ServiceUnavailableException("应用仍在启动");
    }
    return {
      status: "started",
      lifecycle,
      timestamp: new Date().toISOString(),
    };
  }

  /** 就绪探针拒绝 draining 进程，并以有界数据库探测决定是否接收业务流量。 */
  @Public()
  @Get("ready")
  async ready() {
    const lifecycle = this.metrics.lifecycle();
    if (lifecycle.draining) {
      throw new ServiceUnavailableException("应用正在优雅停机");
    }

    const startedAt = process.hrtime.bigint();
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error("DATABASE_PROBE_TIMEOUT")),
            DATABASE_PROBE_TIMEOUT_MS,
          );
          timeout.unref();
        }),
      ]);
      const latencySeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      this.metrics.recordDatabaseHealth(true, latencySeconds);
      return {
        status: "ready",
        lifecycle,
        dependencies: {
          database: {
            status: "up",
            latencyMs: Math.round(latencySeconds * 100_000) / 100,
          },
        },
        timestamp: new Date().toISOString(),
      };
    } catch {
      const latencySeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      this.metrics.recordDatabaseHealth(false, latencySeconds);
      throw new ServiceUnavailableException("数据库暂不可用");
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  /** 指标端点沿用全局员工认证；不公开业务计数或内部运行详情。 */
  @Get("metrics")
  async prometheus(@Res() response: Response): Promise<void> {
    const body = await this.metrics.renderPrometheus();
    response.status(200).type(PROMETHEUS_CONTENT_TYPE).send(body);
  }
}
