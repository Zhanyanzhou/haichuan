import { Module } from '@nestjs/common';
import { InquiriesService } from './inquiries.service';
import { InquiriesController } from './inquiries.controller';

@Module({ controllers: [InquiriesController], providers: [InquiriesService], exports: [InquiriesService] })
export class InquiriesModule {}
