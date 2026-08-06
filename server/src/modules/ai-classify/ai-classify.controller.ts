import { Controller, Post, Get, Put, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AiClassifyService } from './ai-classify.service';
import { KimiService } from '../../common/kimi/kimi.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('AI智能分类')
@ApiBearerAuth()
@Controller('ai-classify')
@UseGuards(JwtAuthGuard)
export class AiClassifyController {
  constructor(
    private aiClassifyService: AiClassifyService,
    private kimiService: KimiService,
  ) {}

  // ========== 图片分类 ==========

  @Post('single')
  @ApiOperation({ summary: '单张图片AI分类' })
  async classifySingle(@Body('imageUrl') imageUrl: string) {
    return this.aiClassifyService.classifyImage(imageUrl);
  }

  @Post('batch')
  @ApiOperation({ summary: '批量图片AI分类' })
  async classifyBatch(@Body('imageUrls') imageUrls: string[]) {
    return this.aiClassifyService.batchClassify(imageUrls);
  }

  @Get('records')
  @ApiOperation({ summary: '获取分类记录' })
  async getRecords(@Query() query: any) {
    return this.aiClassifyService.getRecords(query);
  }

  @Put('confirm/:id')
  async confirm(
    @Param('id') id: string,
    @Body('confirmedCategoryId') confirmedCategoryId: number,
    @CurrentUser() user: any,
  ) {
    return this.aiClassifyService.confirmClassification(+id, {
      confirmedCategoryId,
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
  async chat(
    @Body('message') message: string,
    @Body('systemPrompt') systemPrompt?: string,
  ) {
    if (!this.kimiService.isAvailable()) {
      throw new Error('AI 服务未配置，请先设置 KIMI_API_KEY 环境变量');
    }
    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: message });

    return this.kimiService.chat(messages);
  }

  /**
   * AI 生成产品描述文案
   */
  @Post('generate-description')
  async generateDescription(@Body() body: { productName: string; category: string; material: string; style?: string }) {
    if (!this.kimiService.isAvailable()) {
      throw new Error('AI 服务未配置，请先设置 KIMI_API_KEY 环境变量');
    }
    const messages: any[] = [
      {
        role: 'system',
        content: '你是一位专业的珠宝首饰文案策划师，擅长撰写精美的产品描述。请用优雅、专业的语言描述产品。',
      },
      {
        role: 'user',
        content: `请为一款名为"${body.productName}"的${body.category}撰写一段产品描述文案（150字左右）。材质：${body.material}。${body.style ? `风格：${body.style}。` : ''}请包含：设计灵感、材质特点、适合场合。`,
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
