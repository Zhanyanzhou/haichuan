import { Module } from '@nestjs/common';
import { PageModulesController } from './page-modules.controller';
import { PageModulesService } from './page-modules.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PageModulesController],
  providers: [PageModulesService],
  exports: [PageModulesService],
})
export class PageModulesModule {}
