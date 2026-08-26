import { Module } from '@nestjs/common';
import { InquiriesService } from './inquiries.service';
import { InquiriesController } from './inquiries.controller';
import { CustomersModule } from '../customers/customers.module';
import { AuthModule } from '../auth/auth.module';
import { ProductsModule } from '../products/products.module';

@Module({ imports: [AuthModule, CustomersModule, ProductsModule], controllers: [InquiriesController], providers: [InquiriesService], exports: [InquiriesService] })
export class InquiriesModule {}
