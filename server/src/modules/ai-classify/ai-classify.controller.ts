import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiClassifyService } from './ai-classify.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import {
  ClassifyImageDto,
  ClassifyBatchDto,
  ChatDto,
  GenerateDescriptionDto,
  ConfirmClassifyDto,
  AiClassifyListQueryDto,
} from './dto/ai-classify.dto';

@ApiTags('AI智能分类')
@ApiBearerAuth()
@Controller('ai-classify')
// AI 接口调用 Kimi 计费且接受外部 prompt/URL,收紧到管理员,防刷配额与滥用
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class AiClassifyController {
  constructor(private aiClassifyService: AiClassifyService) {}

  private setStaffPrivateNoStore(response: Response) {
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Vary', 'Cookie, Authorization');
  }

  // ========== 图片分类 ==========

  @Post('single')
  @ApiOperation({ summary: '单张图片AI分类' })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async classifySingle(
    @Body() dto: ClassifyImageDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.aiClassifyService.classifyImage(dto.imageUrl, actor);
  }

  @Post('batch')
  @ApiOperation({ summary: '批量图片AI分类' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async classifyBatch(
    @Body() dto: ClassifyBatchDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.aiClassifyService.batchClassify(dto.imageUrls, actor);
  }

  @Get('records')
  @ApiOperation({ summary: '获取分类记录' })
  async getRecords(
    @Query() query: AiClassifyListQueryDto,
    @CurrentUser() actor: StaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.setStaffPrivateNoStore(response);
    return this.aiClassifyService.getRecords(query, actor);
  }

  @Put('confirm/:id')
  async confirm(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmClassifyDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.aiClassifyService.confirmClassification(
      id,
      {
        status: dto.status,
        confirmedCategoryId: dto.confirmedCategoryId,
      },
      actor,
    );
  }

  @Get('report')
  async getReport(
    @CurrentUser() actor: StaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.setStaffPrivateNoStore(response);
    return this.aiClassifyService.getAccuracyReport(actor);
  }

  // ========== Kimi 通用 AI 对话 ==========

  /**
   * 通用 AI 对话 - 可用于产品文案生成、客户咨询、数据分析等
   */
  @Post('chat')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async chat(
    @Body() dto: ChatDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.aiClassifyService.chat(dto, actor);
  }

  /**
   * AI 生成产品描述文案
   */
  @Post('generate-description')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async generateDescription(
    @Body() dto: GenerateDescriptionDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.aiClassifyService.generateDescription(dto, actor);
  }

  /**
   * 检查 Kimi 服务是否可用
   */
  @Get('status')
  async getKimiStatus(
    @CurrentUser() actor: StaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.setStaffPrivateNoStore(response);
    return this.aiClassifyService.getKimiStatus(actor);
  }
}
