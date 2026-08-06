import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  // 请求日志中间件
  app.use((req: any, res: any, next: () => void) => {
    const start = Date.now();
    const { method, url } = req;

    res.on('finish', () => {
      const elapsed = Date.now() - start;
      const { statusCode } = res;
      logger.log(`${method} ${url} → ${statusCode} (${elapsed}ms)`);
    });

    next();
  });

  // CORS：开发环境宽松，生产环境限制 origin
  const corsOrigin = process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGIN || 'https://haichuanjewelry.com').split(',')
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];

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

  // Swagger API 文档
  const config = new DocumentBuilder()
    .setTitle('海川珠宝 API')
    .setDescription('海川珠宝电商平台后端接口文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(3000);
  logger.log('🚀 Jewelry Server running on http://localhost:3000');
  logger.log('📚 Swagger docs: http://localhost:3000/api/docs');
}
bootstrap();
