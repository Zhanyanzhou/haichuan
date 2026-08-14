import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

/**
 * 解析 Redis 连接配置：
 * - 优先 REDIS_URL（docker-compose / 平台即服务标准），支持 redis://[:password@]host:port[/db]
 * - REDIS_PASSWORD 可独立传入，避免强密码中的 URI 保留字符被错误解析
 * - 回退 REDIS_HOST/REDIS_PORT（本地开发），默认 localhost:6379
 * 修复 P0-7：原仅读 HOST/PORT，docker 只传 REDIS_URL 导致容器内 fallback localhost 连不上 redis。
 */
function parseRedisConfig() {
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      const cfg: { host: string; port: number; password?: string; db?: number } = {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
      };
      // 显式密码优先；未设置时兼容旧的 redis://:password@host 格式。
      const password = process.env.REDIS_PASSWORD || (parsed.password ? decodeURIComponent(parsed.password) : undefined);
      if (password) cfg.password = password;
      if (parsed.pathname && parsed.pathname.length > 1) {
        const db = parseInt(parsed.pathname.slice(1), 10);
        if (Number.isFinite(db)) cfg.db = db;
      }
      return cfg;
    } catch {
      // URL 解析失败则回退到 HOST/PORT
    }
  }
  const password = process.env.REDIS_PASSWORD;
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    ...(password ? { password } : {}),
  };
}

@Module({
  imports: [
    BullModule.forRoot({ redis: parseRedisConfig() }),
    BullModule.registerQueue(
      { name: 'ai-classify' },
      { name: 'notification' },
      { name: 'import' },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
