import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Kimi (月之暗面 Moonshot AI) 通用服务
 * 兼容 OpenAI Chat Completions API 格式
 */
@Injectable()
export class KimiService implements OnModuleInit {
  private readonly logger = new Logger(KimiService.name);
  private client: OpenAI;
  private model: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('KIMI_API_KEY');
    const baseURL = this.configService.get<string>('KIMI_BASE_URL');
    this.model = this.configService.get<string>('KIMI_MODEL', 'moonshot-v1-8k');

    if (!apiKey || apiKey === 'sk-your-kimi-api-key-here') {
      this.logger.warn('KIMI_API_KEY 未配置或为默认值，Kimi 服务将不可用');
      return;
    }

    this.client = new OpenAI({
      apiKey,
      baseURL,
    });

    this.logger.log(`Kimi 服务初始化成功，模型: ${this.model}`);
  }

  /**
   * 检查服务是否可用
   */
  isAvailable(): boolean {
    return !!this.client;
  }

  /**
   * 基础对话 - 发送消息给 Kimi 并获取回复
   */
  async chat(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    },
  ): Promise<{
    content: string;
    usage?: OpenAI.Completions.CompletionUsage;
  }> {
    this.ensureAvailable();

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
        response_format: options?.jsonMode ? { type: 'json_object' } : undefined,
      });

      return {
        content: response.choices[0]?.message?.content || '',
        usage: response.usage,
      };
    } catch (error) {
      this.logger.error('Kimi API 调用失败', error);
      throw new Error(`Kimi API 调用失败: ${error.message}`);
    }
  }

  /**
   * 图片识别/分类 - 通过图片 URL 分析图片内容
   * 注意：Kimi 支持通过 URL 传入图片（需使用 vision 模型 moonshot-v1-8k-vision-preview 等）
   */
  async analyzeImage(
    imageUrl: string,
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<{
    content: string;
    usage?: OpenAI.Completions.CompletionUsage;
  }> {
    this.ensureAvailable();

    try {
      const response = await this.client.chat.completions.create({
        model: 'moonshot-v1-8k-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 1000,
      });

      return {
        content: response.choices[0]?.message?.content || '',
        usage: response.usage,
      };
    } catch (error) {
      this.logger.error('Kimi 图片识别失败', error);
      throw new Error(`Kimi 图片识别失败: ${error.message}`);
    }
  }

  /**
   * JSON 格式结构化输出
   * 强制 Kimi 以 JSON 格式返回，适合分类、提取等场景
   */
  async chatJSON<T = any>(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<T> {
    const result = await this.chat(messages, {
      ...options,
      temperature: options?.temperature ?? 0.1,
      jsonMode: true,
    });

    try {
      // 尝试解析 JSON，处理可能的 markdown 代码块包装
      let jsonStr = result.content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      return JSON.parse(jsonStr.trim()) as T;
    } catch (error) {
      this.logger.error('Kimi JSON 解析失败', result.content);
      throw new Error(`Kimi 返回的内容无法解析为 JSON: ${result.content.substring(0, 200)}`);
    }
  }

  private ensureAvailable(): void {
    if (!this.client) {
      throw new Error('Kimi 服务未初始化，请检查 KIMI_API_KEY 环境变量配置');
    }
  }
}
