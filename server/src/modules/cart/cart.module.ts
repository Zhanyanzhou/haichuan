import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OptionalCustomerAuthGuard } from '../customers/optional-customer-auth.guard';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { ProductsModule } from '../products/products.module';

@Module({
  // AuthModule 提供 JwtService，供 OptionalCustomerAuthGuard 解析客户令牌
  imports: [AuthModule, ProductsModule],
  controllers: [CartController],
  providers: [CartService, OptionalCustomerAuthGuard],
  exports: [CartService],
})
export class CartModule {}
