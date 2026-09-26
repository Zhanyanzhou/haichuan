import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewMediaService } from './review-media.service';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';

@Module({
  imports: [AuthModule, CustomersModule, IdempotencyModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewMediaService],
})
export class ReviewsModule {}
