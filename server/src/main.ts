import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger("Bootstrap");

  app.setGlobalPrefix("api");

  // 信任单层 nginx 反向代理：让 req.ip / ThrottlerGuard 拿到真实客户端 IP。
  // express trust proxy=1 取 X-Forwarded-For 最右一项 = nginx 的 $remote_addr（真实客户端，不可被请求头伪造）；
  // 否则所有请求 IP 退化为 nginx 容器内网 IP，全站共享一个限流桶（连 /auth/login 5/min 都会全站共享）。
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", 1);

  // 安全头
  app.use(helmet({ contentSecurityPolicy: false }));

  // 请求日志中间件
  app.use((req: any, res: any, next: () => void) => {
    const start = Date.now();
    const { method, url } = req;

    res.on("finish", () => {
      const elapsed = Date.now() - start;
      const { statusCode } = res;
      logger.log(`${method} ${url} → ${statusCode} (${elapsed}ms)`);
    });

    next();
  });

  // CORS：开发环境宽松，生产环境只接受显式配置的正式来源。
  // 不使用代码内置域名作为回退值，避免在域名变更或未确认时静默开放错误站点。
  const corsOrigin =
    process.env.NODE_ENV === "production"
      ? getProductionCorsOrigins()
      : [
          "http://localhost:5173",
          "http://localhost:5174",
          "http://localhost:5175",
          "http://localhost:5176",
          "http://localhost:5177",
          "http://127.0.0.1:5173",
          "http://127.0.0.1:5174",
          "http://127.0.0.1:5175",
          "http://127.0.0.1:5176",
          "http://127.0.0.1:5177",
          "http://localhost:3000",
        ];

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

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = Number(process.env.PORT) || 3000;

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

  await app.listen(port);
  logger.log(`🚀 Jewelry Server running on http://localhost:${port}`);
}
bootstrap();

function getProductionCorsOrigins(): string[] {
  const configuredOrigins = process.env.CORS_ORIGIN;
  if (!configuredOrigins?.trim()) {
    throw new Error(
      "CORS_ORIGIN 在生产环境为必填项；请配置已确认的正式前端来源。",
    );
  }

  const origins = configuredOrigins.split(",").map((origin) => origin.trim());
  if (origins.some((origin) => !origin)) {
    throw new Error("CORS_ORIGIN 不能包含空白来源。");
  }

  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.origin !== origin
      ) {
        throw new Error();
      }
    } catch {
      throw new Error(
        "CORS_ORIGIN 必须为一个或多个以逗号分隔的 HTTP(S) 来源（不含路径、查询参数或尾随斜杠）。",
      );
    }
  }

  return origins;
}
