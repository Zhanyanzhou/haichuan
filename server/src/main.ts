import { NestFactory, Reflector } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { resolveCorsOrigins } from "./common/config/cors-origins";

async function bootstrap() {
  // rawBody：保留请求体原始字节串——微信支付 APIv3 回调验签必须对原始报文（重新序列化会改变字段序/空白导致验签必败）。
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  // nestjs-pino：统一接管框架与业务日志（生产 JSON 单行，便于采集检索）
  app.useLogger(app.get(PinoLogger));
  const logger = new Logger("Bootstrap");

  app.setGlobalPrefix("api");

  // 信任单层 nginx 反向代理：让 req.ip / ThrottlerGuard 拿到真实客户端 IP。
  // express trust proxy=1 取 X-Forwarded-For 最右一项 = nginx 的 $remote_addr（真实客户端，不可被请求头伪造）；
  // 否则所有请求 IP 退化为 nginx 容器内网 IP，全站共享一个限流桶（连 /auth/login 5/min 都会全站共享）。
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", 1);

  // 安全头
  app.use(helmet({ contentSecurityPolicy: false }));

  // 访问日志已由 nestjs-pino（pino-http）统一记录，不再手写请求日志中间件。

  // 开发环境未配置时保留常用端口；显式配置时仅接受精确 loopback 来源。
  // 生产环境继续要求明确的正式来源，不使用代码内置域名回退。
  const corsOrigin = resolveCorsOrigins(
    process.env.NODE_ENV,
    process.env.CORS_ORIGIN,
  );

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = Number(process.env.PORT) || 3000;
  // 默认全接口：容器内 nginx 需经内网访问 server。
  // 宿主机直跑时应设 HOST=127.0.0.1 收敛局域网暴露（裸 API 无 nginx 防护层，2026-08-19 实测 192.168.1.x 可直达 /api/ready）。
  const host = process.env.HOST || "0.0.0.0";

  // Swagger API 文档（仅开发环境暴露）
  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("海川珠宝 API")
      .setDescription("海川珠宝电商平台后端接口文档")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
    logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }

  await app.listen(port, host);
  logger.log(`🚀 Jewelry Server running on http://localhost:${port}`);
}
bootstrap();
