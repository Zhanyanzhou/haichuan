import { Module } from '@nestjs/common';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { ProductsModule } from '../products/products.module';
import { CustomersModule } from '../customers/customers.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  // ProductsModule 导出 ProductsService + ProductAccessService；
  // CustomersModule 导出 CustomerAuthGuard；AuthModule 提供 JwtService 供其解析客户令牌。
  imports: [ProductsModule, CustomersModule, AuthModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}
