import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { KimiService } from "../../common/kimi/kimi.service";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import type OpenAI from "openai";

type AiClassifyActor = Pick<StaffPrincipal, "id" | "sessionFamilyId">;

type CategoryCandidate = { id: number; name: string; level: number };

type ClassifyPrediction = {
  categoryId: number;
  name: string;
  confidence: number;
};

type ClassifyResult = {
  predictedCategoryId: number | null;
  predictedCategoryName: string;
  confidence: number;
  allPredictions: ClassifyPrediction[];
};

type BatchClassifyResult = ClassifyResult & { imageUrl: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

@Injectable()
export class AiClassifyService {
  private readonly logger = new Logger(AiClassifyService.name);

  // 分类结果的结构化定义
  private readonly classifyOutputSchema = `请返回严格符合以下格式的JSON（不要包含其他文字）：
{
  "predictedCategoryName": "分类名称",
  "confidence": 85.5,
  "reason": "分类理由简述",
  "allPredictions": [
    { "name": "分类1", "confidence": 85.5 },
    { "name": "分类2", "confidence": 10.2 }
  ]
}`;

  constructor(
    private prisma: PrismaService,
    private kimiService: KimiService,
  ) {}

  private async lockAuthorizedActor(
    transaction: Prisma.TransactionClient,
    actor: AiClassifyActor,
    mode: "read" | "write",
  ): Promise<{ id: number }> {
    if (!actor || !Number.isSafeInteger(actor.id) || actor.id <= 0) {
      throw new ForbiddenException("当前员工已停用或无权使用 AI 分类");
    }
    const locked = mode === "read"
      ? await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR SHARE`,
        )
      : await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR UPDATE`,
        );
    if (locked.length !== 1) {
      throw new ForbiddenException("当前员工已停用或无权使用 AI 分类");
    }
    if (actor.sessionFamilyId) {
      const sessions = mode === "read"
        ? await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
          )
        : await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
          );
      if (sessions.length !== 1) {
        throw new ForbiddenException("当前员工会话已失效，不能使用 AI 分类");
      }
    }
    return locked[0];
  }

  private withAuthorizedActor<T>(
    actor: AiClassifyActor,
    mode: "read" | "write",
    work: (
      transaction: Prisma.TransactionClient,
      lockedActor: { id: number },
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      const lockedActor = await this.lockAuthorizedActor(transaction, actor, mode);
      return work(transaction, lockedActor);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private assertKimiAvailable() {
    if (!this.kimiService.isAvailable()) {
      throw new ServiceUnavailableException(
        "AI 服务未配置，请先设置 KIMI_API_KEY 环境变量",
      );
    }
  }

  /**
   * AI 图片分类 - 优先使用 Kimi Vision API，不可用时回退到 mock
   */
  async classifyImage(
    imageUrl: string,
    actor: AiClassifyActor,
  ): Promise<ClassifyResult> {
    this.logger.log(`开始分类图片: ${imageUrl}`);

    // 外部调用前先在短事务内复核员工与会话，并读取当前候选分类。
    const categories = await this.withAuthorizedActor(
      actor,
      "read",
      (transaction) => transaction.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true, level: true },
      }),
    );

    const categoryNames = categories.map((c) => c.name).join("、");
    this.assertKimiAvailable();
    try {
      const classified = await this.realClassify(
        imageUrl,
        categories,
        categoryNames,
      );
      // 外部结果返回后再次复核，旧会话的迟到结果不得写回分类记录。
      await this.withAuthorizedActor(actor, "write", (transaction) =>
        transaction.aIClassifyRecord.create({ data: classified.record }),
      );
      this.logger.log(
        `分类完成: ${classified.result.predictedCategoryName} (${classified.result.confidence}%)`,
      );
      return classified.result;
    } catch (error: unknown) {
      this.logger.warn(
        `Kimi API 调用或分类结果落库失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * 使用 Kimi Vision API 进行真实图片分类
   */
  private async realClassify(
    imageUrl: string,
    categories: CategoryCandidate[],
    categoryNames: string,
  ): Promise<{
    result: ClassifyResult;
    record: {
      imageUrl: string;
      predictedCategoryId: number | null;
      confidence: number;
      status: string;
    };
  }> {
    const prompt = `你是一个专业的珠宝首饰分类专家。请仔细观察这张珠宝图片，从以下候选分类中选择最匹配的分类：

可选的分类有：${categoryNames}

${this.classifyOutputSchema}`;

    this.logger.log("正在调用 Kimi Vision API 进行图片分类...");
    const result = await this.kimiService.analyzeImage(imageUrl, prompt, {
      temperature: 0.1,
      maxTokens: 1000,
    });

    this.logger.log(`Kimi 返回结果: ${result.content.substring(0, 300)}`);

    // 解析 Kimi 返回的 JSON
    const parsed = this.parseClassifyResult(result.content, categories);
    const finalResult = {
      predictedCategoryId: parsed.predictedCategoryId,
      predictedCategoryName: parsed.predictedCategoryName,
      confidence: parsed.confidence,
      allPredictions: parsed.allPredictions.slice(0, 3),
    };

    // 确定状态
    let status = "pending_review";
    if (finalResult.confidence >= 90) status = "auto_confirmed";
    else if (finalResult.confidence >= 70) status = "pending_confirm";

    return {
      result: finalResult,
      record: {
        imageUrl,
        predictedCategoryId: finalResult.predictedCategoryId,
        confidence: finalResult.confidence,
        status,
      },
    };
  }

  /**
   * 解析 Kimi 返回的分类结果 JSON
   */
  private parseClassifyResult(
    rawContent: string,
    categories: CategoryCandidate[],
  ): ClassifyResult {
    try {
      // 清理可能的 markdown 代码块包装
      let jsonStr = rawContent.trim();
      if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
      else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);

      const parsed: unknown = JSON.parse(jsonStr.trim());
      if (!isRecord(parsed)) throw new Error("分类结果不是 JSON 对象");

      // 匹配分类名称到数据库分类
      const matchCategory = (name: string) => {
        const found = categories.find(
          (c) =>
            c.name === name || c.name.includes(name) || name.includes(c.name),
        );
        return found ? { categoryId: found.id, name: found.name } : null;
      };

      const predictedCategoryName = stringValue(parsed.predictedCategoryName);
      const top = matchCategory(predictedCategoryName);
      const rawPredictions = Array.isArray(parsed.allPredictions)
        ? parsed.allPredictions
        : [];
      const allPredictions = rawPredictions
        .filter(isRecord)
        .map((prediction): ClassifyPrediction => {
        const predictionName = stringValue(prediction.name);
        const matched = matchCategory(predictionName);
        return {
          categoryId: matched?.categoryId || 0,
          name: matched?.name || predictionName || "未知",
          confidence: finiteNumber(prediction.confidence),
        };
      });

      return {
        predictedCategoryId: top?.categoryId || null,
        predictedCategoryName:
          top?.name || predictedCategoryName || "未知",
        confidence: finiteNumber(parsed.confidence),
        allPredictions:
          allPredictions.length > 0
            ? allPredictions
            : [
                {
                  categoryId: top?.categoryId || 0,
                  name: top?.name || predictedCategoryName || "未知",
                  confidence: finiteNumber(parsed.confidence),
                },
              ],
      };
    } catch (error) {
      this.logger.error(
        "解析 Kimi 返回结果失败，使用原始文本作为分类名",
        error,
      );
      return {
        predictedCategoryId: null,
        predictedCategoryName: rawContent.substring(0, 50) || "未能识别",
        confidence: 0,
        allPredictions: [],
      };
    }
  }

  /**
   * Batch classify multiple images
   */
  async batchClassify(
    imageUrls: string[],
    actor: AiClassifyActor,
  ): Promise<BatchClassifyResult[]> {
    const results: BatchClassifyResult[] = [];
    for (const url of imageUrls) {
      const result = await this.classifyImage(url, actor);
      results.push({ imageUrl: url, ...result });
    }
    return results;
  }

  /**
   * Get classification records
   */
  async getRecords(params: {
    page?: number;
    pageSize?: number;
    status?: string;
  }, actor: AiClassifyActor) {
    return this.withAuthorizedActor(actor, "read", async (transaction) => {
      const { page = 1, pageSize = 20, status } = params;
      const where: Prisma.AIClassifyRecordWhereInput = {};
      if (status && status !== "all") where.status = status;

      const [list, total] = await Promise.all([
        transaction.aIClassifyRecord.findMany({
          where,
          skip: (+page - 1) * +pageSize,
          take: +pageSize,
          orderBy: { createdAt: "desc" },
          include: {
            operator: { select: { id: true, username: true, realName: true } },
          },
        }),
        transaction.aIClassifyRecord.count({ where }),
      ]);

      return { list, total, page: +page, pageSize: +pageSize };
    });
  }

  /**
   * Confirm or correct classification
   */
  async confirmClassification(
    id: number,
    data: {
      status: "confirmed" | "rejected";
      confirmedCategoryId?: number;
    },
    actor: AiClassifyActor,
  ) {
    return this.withAuthorizedActor(actor, "write", async (transaction, lockedActor) => {
      // 驳回：仅落驳回状态，不写人工确认分类
      if (data.status === "rejected") {
        return transaction.aIClassifyRecord.update({
          where: { id },
          data: {
            status: "rejected",
            operatorId: lockedActor.id,
          },
        });
      }

      // 确认：未显式传人工分类时沿用预测分类，保证 confirmedCategoryId 有值
      const confirmedCategoryId =
        data.confirmedCategoryId ??
        (
          await transaction.aIClassifyRecord.findUnique({
            where: { id },
            select: { predictedCategoryId: true },
          })
        )?.predictedCategoryId;

      if (!confirmedCategoryId) {
        throw new BadRequestException("无法确认：请先选择有效分类");
      }

      const record = await transaction.aIClassifyRecord.update({
        where: { id },
        data: {
          confirmedCategoryId,
          operatorId: lockedActor.id,
          status: "confirmed",
        },
      });

      if (
        record.predictedCategoryId != null &&
        record.predictedCategoryId !== confirmedCategoryId
      ) {
        this.logger.log(
          `Classification corrected: ${record.predictedCategoryId} → ${confirmedCategoryId}. Feedback recorded.`,
        );
      }

      return record;
    });
  }

  /**
   * Get accuracy report
   */
  async getAccuracyReport(actor: AiClassifyActor) {
    return this.withAuthorizedActor(actor, "read", async (transaction) => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [total, autoConfirmed, confirmed, todayCount, correctRows] =
        await Promise.all([
        transaction.aIClassifyRecord.count(),
        transaction.aIClassifyRecord.count({
          where: { status: "auto_confirmed" },
        }),
        transaction.aIClassifyRecord.count({ where: { status: "confirmed" } }),
        transaction.aIClassifyRecord.count({
          where: { createdAt: { gte: todayStart } },
        }),
        transaction.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM ai_classify_records
        WHERE status = 'confirmed' AND predicted_category_id IS NOT NULL
          AND predicted_category_id = confirmed_category_id
      `,
      ]);

      const correctPredictions = Number(correctRows[0]?.count ?? 0);

      return {
        total,
        autoConfirmed,
        autoConfirmRate:
          total > 0 ? ((autoConfirmed / total) * 100).toFixed(1) : "0",
        accuracy:
          confirmed > 0
            ? ((correctPredictions / confirmed) * 100).toFixed(1)
            : "N/A",
        todayCount,
      };
    });
  }

  async chat(
    data: { message: string; systemPrompt?: string },
    actor: AiClassifyActor,
  ) {
    await this.withAuthorizedActor(actor, "read", async () => undefined);
    this.assertKimiAvailable();
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (data.systemPrompt) {
      messages.push({ role: "system", content: data.systemPrompt });
    }
    messages.push({ role: "user", content: data.message });
    return this.kimiService.chat(messages);
  }

  async generateDescription(
    data: {
      productName: string;
      category: string;
      material: string;
      style?: string;
    },
    actor: AiClassifyActor,
  ) {
    await this.withAuthorizedActor(actor, "read", async () => undefined);
    this.assertKimiAvailable();
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "你是一位专业的珠宝首饰文案策划师，擅长撰写精美的产品描述。请用优雅、专业的语言描述产品。",
      },
      {
        role: "user",
        content: `请为一款名为"${data.productName}"的${data.category}撰写一段产品描述文案（150字左右）。材质：${data.material}。${data.style ? `风格：${data.style}。` : ""}请包含：设计灵感、材质特点、适合场合。`,
      },
    ];
    return this.kimiService.chat(messages, { temperature: 0.8, maxTokens: 600 });
  }

  getKimiStatus(actor: AiClassifyActor) {
    return this.withAuthorizedActor(actor, "read", async () => ({
      available: this.kimiService.isAvailable(),
      message: this.kimiService.isAvailable()
        ? "Kimi API 已连接"
        : "AI 服务未配置，请设置 KIMI_API_KEY",
    }));
  }
}
