import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DESIGN_FILE_MAX_BYTES } from '../upload/design-file-media';
import {
  CreateCooperationDesignFileDto,
  CreateCooperationDesignFileVersionDto,
  UploadCooperationDesignFileVersionDto,
} from './dto/quotation-commerce.dto';
import { QuotationConfigurationService } from './quotation-configuration.service';
import type { QuotationActor } from './quotations.service';

@ApiTags('合作 3D 文件管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('cooperation-design-files')
export class CooperationDesignFilesController {
  constructor(private readonly configuration: QuotationConfigurationService) {}

  @Get('customer/:customerId')
  @ApiOperation({ summary: '合作客户 3D 文件及版本列表' })
  list(@Param('customerId', ParseIntPipe) customerId: number) {
    return this.configuration.listDesignFiles(customerId);
  }

  @Post()
  @ApiOperation({ summary: '创建合作 3D 文件档案' })
  create(
    @Body() dto: CreateCooperationDesignFileDto,
    @CurrentUser() actor: QuotationActor,
  ) {
    return this.configuration.createDesignFile(dto, actor.id);
  }

  @Post(':id/versions')
  @ApiOperation({ summary: '追加待客户确认的 3D 文件版本' })
  createVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCooperationDesignFileVersionDto,
    @CurrentUser() actor: QuotationActor,
  ) {
    return this.configuration.createDesignFileVersion(id, dto, actor.id);
  }

  @Post(':id/versions/upload')
  @ApiOperation({ summary: '上传真实 3D 文件字节并原子登记待客户确认版本' })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: DESIGN_FILE_MAX_BYTES },
  }))
  createVersionFromUpload(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadCooperationDesignFileVersionDto,
    @CurrentUser() actor: QuotationActor,
  ) {
    return this.configuration.createDesignFileVersionFromUpload(id, file, dto, actor.id);
  }
}
