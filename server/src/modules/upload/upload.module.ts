import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { CustomersModule } from '../customers/customers.module';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { AuthModule } from '../auth/auth.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    AuthModule,
    CustomersModule,
    MulterModule.register({ storage: memoryStorage() }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: { index: false },
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService, CustomerAuthGuard],
  exports: [UploadService],
})
export class UploadModule {}
