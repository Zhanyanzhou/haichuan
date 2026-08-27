import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  ServiceUnavailableException,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiClassifyService } from './ai-classify.service';
import { KimiService } from '../../common/kimi/kimi.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import type OpenAI from 'openai';
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
  constructor(
    private aiClassifyService: AiClassifyService,
    private kimiService: KimiService,
  ) {}

  // ========== 图片分类 ==========

  @Post('single')
  @ApiOperation({ summary: '单张图片AI分类' })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async classifySingle(@Body() dto: ClassifyImageDto) {
    if (!this.kimiService.isAvailable()) {
      throw new ServiceUnavailableException(
        'AI 服务未配置，请先设置 KIMI_API_KEY 环境变量',
      );
    }
    return this.aiClassifyService.classifyImage(dto.imageUrl);
  }

  @Post('batch')
  @ApiOperation({ summary: '批量图片AI分类' })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async classifyBatch(@Body() dto: ClassifyBatchDto) {
    if (!this.kimiService.isAvailable()) {
      throw new ServiceUnavailableException(
        'AI 服务未配置，请先设置 KIMI_API_KEY 环境变量',
      );
    }
    return this.aiClassifyService.batchClassify(dto.imageUrls);
  }

  @Get('records')
  @ApiOperation({ summary: '获取分类记录' })
  async getRecords(@Query() query: AiClassifyListQueryDto) {
    return this.aiClassifyService.getRecords(query);
  }

  @Put('confirm/:id')
  async confirm(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmClassifyDto,
    @CurrentUser() user: StaffPrincipal,
  ) {
    return this.aiClassifyService.confirmClassification(id, {
      status: dto.status,
      confirmedCategoryId: dto.confirmedCategoryId,
      operatorId: user.id,
    });
  }

  @Get('report')
  async getReport() {
    return this.aiClassifyService.getAccuracyReport();
  }

  // ========== Kimi 通用 AI 对话 ==========

  /**
   * 通用 AI 对话 - 可用于产品文案生成、客户咨询、数据分析等
   */
  @Post('chat')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async chat(@Body() dto: ChatDto) {
    if (!this.kimiService.isAvailable()) {
      throw new ServiceUnavailableException('AI 服务未配置，请先设置 KIMI_API_KEY 环境变量');
    }
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (dto.systemPrompt) {
      messages.push({ role: 'system', content: dto.systemPrompt });
    }
    messages.push({ role: 'user', content: dto.message });

    return this.kimiService.chat(messages);
  }

  /**
   * AI 生成产品描述文案
   */
  @Post('generate-description')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async generateDescription(@Body() dto: GenerateDescriptionDto) {
    if (!this.kimiService.isAvailable()) {
      throw new ServiceUnavailableException('AI 服务未配置，请先设置 KIMI_API_KEY 环境变量');
    }
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: '你是一位专业的珠宝首饰文案策划师，擅长撰写精美的产品描述。请用优雅、专业的语言描述产品。',
      },
      {
        role: 'user',
        content: `请为一款名为"${dto.productName}"的${dto.category}撰写一段产品描述文案（150字左右）。材质：${dto.material}。${dto.style ? `风格：${dto.style}。` : ''}请包含：设计灵感、材质特点、适合场合。`,
      },
    ];
    return this.kimiService.chat(messages, { temperature: 0.8, maxTokens: 600 });
  }

  /**
   * 检查 Kimi 服务是否可用
   */
  @Get('status')
  async getKimiStatus() {
    return {
      available: this.kimiService.isAvailable(),
      message: this.kimiService.isAvailable() ? 'Kimi API 已连接' : 'AI 服务未配置，请设置 KIMI_API_KEY',
    };
  }
}
