import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    BullModule.registerQueue(
      { name: 'ai-classify' },
      { name: 'notification' },
      { name: 'import' },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
