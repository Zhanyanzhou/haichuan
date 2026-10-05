import { Module } from '@nestjs/common';
import { ReliableNotificationsModule } from '../../common/notifications/reliable-notifications.module';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';

@Module({
  imports: [PrismaModule, OutboxModule, ReliableNotificationsModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
