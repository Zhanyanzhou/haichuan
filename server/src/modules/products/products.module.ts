import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { UploadModule } from '../upload/upload.module';
import { CustomersModule } from '../customers/customers.module';
import { AuthModule } from '../auth/auth.module';
import { ProductMediaService } from './product-media.service';
import { ProductAccessService } from './product-access.service';
import { CustomerOrStaffGuard } from './customer-or-staff.guard';

@Module({
  // AuthModule 提供 JwtService，供 CustomerOrStaffGuard 解析客户/员工令牌
  imports: [UploadModule, CustomersModule, AuthModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductMediaService, ProductAccessService, CustomerOrStaffGuard],
  exports: [ProductsService, ProductAccessService],
})
export class ProductsModule {}
