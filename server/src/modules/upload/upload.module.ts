import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { CustomersModule } from '../customers/customers.module';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { MediaAuthorizationService } from './media-authorization.service';
import { MediaAuthorizationResolverService } from './media-authorization-resolver.service';
import { PublicUploadsGateway } from './public-uploads.gateway';

@Module({
  imports: [
    AuthModule,
    CustomersModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [UploadController],
  providers: [
    UploadService,
    PublicUploadsGateway,
    MediaAuthorizationService,
    MediaAuthorizationResolverService,
    CustomerAuthGuard,
  ],
  exports: [UploadService, MediaAuthorizationService, MediaAuthorizationResolverService],
})
export class UploadModule {}
