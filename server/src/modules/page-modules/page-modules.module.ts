import { Module } from '@nestjs/common';
import { PageModulesController } from './page-modules.controller';
import { PageModulesService } from './page-modules.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { DynamicTemplatesController } from './dynamic-templates.controller';
import { DynamicTemplatesService } from './dynamic-templates.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [PrismaModule, UploadModule],
  controllers: [PageModulesController, DynamicTemplatesController],
  providers: [PageModulesService, DynamicTemplatesService],
  // 动态模板版本服务只允许本模块控制器使用，不向其他业务模块暴露直接写入口。
  exports: [PageModulesService],
})
export class PageModulesModule {}
