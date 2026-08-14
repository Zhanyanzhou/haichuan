import { Module } from '@nestjs/common';
import { PartnerApplicationsController } from './partner-applications.controller';
import { PartnerApplicationsService } from './partner-applications.service';
import { CustomersModule } from '../customers/customers.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  // CustomerAuthGuard 由 CustomersModule 导出提供；AuthModule 提供 JwtService 供其解析客户令牌
  imports: [CustomersModule, AuthModule],
  controllers: [PartnerApplicationsController],
  providers: [PartnerApplicationsService],
})
export class PartnerApplicationsModule {}
