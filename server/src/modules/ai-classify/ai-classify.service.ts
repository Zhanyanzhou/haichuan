import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { KimiService } from "../../common/kimi/kimi.service";

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

  /**
   * AI 图片分类 - 优先使用 Kimi Vision API，不可用时回退到 mock
   */
  async classifyImage(imageUrl: string): Promise<ClassifyResult> {
    this.logger.log(`开始分类图片: ${imageUrl}`);

    // 获取所有启用的分类作为候选
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true, level: true },
    });

    const categoryNames = categories.map((c) => c.name).join("、");

    // 尝试使用 Kimi 真实 API
    if (this.kimiService.isAvailable()) {
      try {
        return await this.realClassify(imageUrl, categories, categoryNames);
      } catch (error: unknown) {
        this.logger.warn(
          `Kimi API 调用失败: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }

    // Kimi 未配置，不静默回退 mock
    this.logger.warn("AI 分类服务不可用：Kimi API Key 未配置");
    throw new Error("AI 分类服务未配置，请先设置 KIMI_API_KEY 环境变量");
  }

  /**
   * 使用 Kimi Vision API 进行真实图片分类
   */
  private async realClassify(
    imageUrl: string,
    categories: CategoryCandidate[],
    categoryNames: string,
  ): Promise<ClassifyResult> {
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

    // 保存记录
    await this.prisma.aIClassifyRecord.create({
      data: {
        imageUrl,
        predictedCategoryId: finalResult.predictedCategoryId,
        confidence: finalResult.confidence,
        status,
      },
    });

    this.logger.log(
      `分类完成: ${finalResult.predictedCategoryName} (${finalResult.confidence}%)`,
    );

    return finalResult;
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
  async batchClassify(imageUrls: string[]): Promise<BatchClassifyResult[]> {
    const results: BatchClassifyResult[] = [];
    for (const url of imageUrls) {
      const result = await this.classifyImage(url);
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
  }) {
    const { page = 1, pageSize = 20, status } = params;
    const where: Prisma.AIClassifyRecordWhereInput = {};
    if (status && status !== "all") where.status = status;

    const [list, total] = await Promise.all([
      this.prisma.aIClassifyRecord.findMany({
        where,
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          operator: { select: { id: true, username: true, realName: true } },
        },
      }),
      this.prisma.aIClassifyRecord.count({ where }),
    ]);

    return { list, total, page: +page, pageSize: +pageSize };
  }

  /**
   * Confirm or correct classification
   */
  async confirmClassification(
    id: number,
    data: {
      status: "confirmed" | "rejected";
      confirmedCategoryId?: number;
      operatorId: number;
    },
  ) {
    // 驳回：仅落驳回状态，不写人工确认分类
    if (data.status === "rejected") {
      return this.prisma.aIClassifyRecord.update({
        where: { id },
        data: {
          status: "rejected",
          operatorId: data.operatorId,
        },
      });
    }

    // 确认：未显式传人工分类时沿用预测分类，保证 confirmedCategoryId 有值
    const confirmedCategoryId =
      data.confirmedCategoryId ??
      (
        await this.prisma.aIClassifyRecord.findUnique({
          where: { id },
          select: { predictedCategoryId: true },
        })
      )?.predictedCategoryId;

    if (!confirmedCategoryId) {
      throw new BadRequestException("无法确认：请先选择有效分类");
    }

    const record = await this.prisma.aIClassifyRecord.update({
      where: { id },
      data: {
        confirmedCategoryId,
        operatorId: data.operatorId,
        status: "confirmed",
      },
    });

    // Feedback loop: if the confirmed category differs from prediction,
    // this data could be used to retrain the model in production
    if (
      record.predictedCategoryId != null &&
      record.predictedCategoryId !== confirmedCategoryId
    ) {
      this.logger.log(
        `Classification corrected: ${record.predictedCategoryId} → ${confirmedCategoryId}. Feedback recorded.`,
      );
    }

    return record;
  }

  /**
   * Get accuracy report
   */
  async getAccuracyReport() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [total, autoConfirmed, confirmed, todayCount, correctRows] =
      await Promise.all([
        this.prisma.aIClassifyRecord.count(),
        this.prisma.aIClassifyRecord.count({
          where: { status: "auto_confirmed" },
        }),
        this.prisma.aIClassifyRecord.count({ where: { status: "confirmed" } }),
        this.prisma.aIClassifyRecord.count({
          where: { createdAt: { gte: todayStart } },
        }),
        // P1-21：准确率必须比较 predictedCategoryId === confirmedCategoryId（Prisma 不支持列间比较，用参数化 raw SQL）
        this.prisma.$queryRaw<{ count: bigint }[]>`
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
  }
}
