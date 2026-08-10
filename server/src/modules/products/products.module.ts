import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { UploadModule } from '../upload/upload.module';
import { ProductMediaService } from './product-media.service';

@Module({
  imports: [UploadModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductMediaService],
  exports: [ProductsService],
})
export class ProductsModule {}
