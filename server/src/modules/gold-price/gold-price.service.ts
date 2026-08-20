import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "../products/products.service";

@Injectable()
export class GoldPriceService {
  private readonly logger = new Logger(GoldPriceService.name);

  constructor(
    private prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  /**
   * Get latest gold price
   */
  async getLatest() {
    // 取最近两条金价记录计算涨跌,避免依赖进程内存变量(重启/多实例下会失真)
    const [latest, previous] = await this.prisma.goldPrice.findMany({
      orderBy: { recordDate: "desc" },
      take: 2,
    });

    if (!latest) {
      throw new ServiceUnavailableException("暂无经过验证的金价数据");
    }

    const price = Number(latest.price);
    const prevPrice = previous ? Number(previous.price) : price;
    const change = Number((price - prevPrice).toFixed(2));
    const changePercent =
      prevPrice !== 0
        ? (((price - prevPrice) / prevPrice) * 100).toFixed(2)
        : "0.00";

    return {
      price,
      source: latest.source,
      recordDate: latest.recordDate,
      change,
      changePercent,
    };
  }

  /**
   * Get price history
   */
  async getHistory(params: { days?: number }) {
    const { days = 30 } = params;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const records = await this.prisma.goldPrice.findMany({
      where: { recordDate: { gte: since } },
      orderBy: { recordDate: "asc" },
      select: { price: true, source: true, recordDate: true },
    });

    return records.map((r) => ({
      price: Number(r.price),
      source: r.source,
      date: r.recordDate,
    }));
  }

  /** 仅供后台提示自动行情能力，绝不返回行情源地址或其他配置值。 */
  getAutomationStatus() {
    return {
      autoFetchConfigured: Boolean(process.env.GOLD_PRICE_API_URL?.trim()),
    };
  }

  /**
   * Manually update gold price
   */
  async updateManually(data: {
    price: number;
    operatorId: number;
    remark?: string;
  }) {
    const record = await this.prisma.goldPrice.create({
      data: {
        price: data.price,
        source: "MANUAL",
        operatorId: data.operatorId,
        remark: data.remark,
        recordDate: new Date(),
      },
    });

    // Trigger price adjustment for all products
    await this.adjustProductPrices(data.price);

    this.logger.log(`Gold price manually updated to ¥${data.price}/g`);

    return {
      price: Number(record.price),
      source: record.source,
      recordDate: record.recordDate,
    };
  }

  /**
   * Scheduled task: Fetch gold price automatically (twice daily)
   * In production, this would call Shanghai Gold Exchange API
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async fetchGoldPriceMorning() {
    await this.fetchAndUpdateGoldPrice("AUTO_MORNING");
  }

  @Cron(CronExpression.EVERY_DAY_AT_3PM)
  async fetchGoldPriceAfternoon() {
    await this.fetchAndUpdateGoldPrice("AUTO_AFTERNOON");
  }

  /**
   * 自动金价采集：从 GOLD_PRICE_API_URL 拉取行情并写库、触发全店调价。
   * - 未配置数据源时诚实跳过（不写模拟报价，避免污染商品售价）；
   * - 价格越界（<100 或 >2000 元/克）视为脏数据丢弃；
   * - 失败仅记录日志，不影响商品价格与既有金价记录。
   */
  private async fetchAndUpdateGoldPrice(source: string) {
    const apiUrl = process.env.GOLD_PRICE_API_URL?.trim();
    if (!apiUrl) {
      this.logger.warn(`已跳过 ${source} 金价任务：未配置 GOLD_PRICE_API_URL`);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(apiUrl, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`行情源返回 HTTP ${res.status}`);
      }
      const data: unknown = await res.json();
      const price = this.extractPrice(data);
      if (!price || price < 100 || price > 2000) {
        throw new Error(`行情源价格越界：${price}`);
      }

      await this.prisma.goldPrice.create({
        // GoldPriceSource 仅 AUTO / MANUAL：自动采集统一记 AUTO，remark 记录早盘/午盘时段
        data: { price, source: "AUTO", remark: source, recordDate: new Date() },
      });
      await this.adjustProductPrices(price);

      this.logger.log(`金价自动更新成功：¥${price}/g（${source}）`);
    } catch (e: any) {
      this.logger.error(`金价自动更新失败（${source}）：${e?.message || e}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 从行情源响应中提取价格（元/克）。
   * 契约：优先读取 price；兼容 {data:{price}}、数组 [{price}] 与常见别名
   * （goldPrice/latestPrice/au9999/Au9999）。数据源字段映射可按实际返回调整。
   */
  private extractPrice(data: unknown): number | null {
    const pick = (obj: any): number | null => {
      for (const key of [
        "price",
        "goldPrice",
        "latestPrice",
        "au9999",
        "Au9999",
      ]) {
        const n = Number(obj?.[key]);
        if (Number.isFinite(n) && n > 0) return n;
      }
      return null;
    };

    if (Array.isArray(data)) {
      for (const item of data) {
        const p = pick(item);
        if (p) return p;
      }
      return null;
    }

    const direct = pick(data);
    if (direct) return direct;

    const inner = (data as any)?.data;
    if (inner && typeof inner === "object") {
      return this.extractPrice(inner);
    }
    return null;
  }

  /**
   * 自动调价引擎（P1-2/P1-3）：
   * - 仅作用于 PUBLISHED 商品（不再改动 DRAFT 草稿价）
   * - 只更新 SKU.price；Product.price（起价）由 ProductsService.syncProductStartingPrice 统一维护为 min 活跃 SKU 价
   *   （原来 gold-price 直接覆盖 Product.price 会破坏 syncProductStartingPrice 的单一真相源）
   * - 调价后通知前台 SSE 刷新（原来不触发 notifyPublicChange，前台价格不更新）
   * - 加价系数 1.05 暂硬编码（DECISIONS D.10 待决策：按 MaterialType 分级并参数化）
   * Formula: sku_price = sku_gold_weight × gold_price × coefficient + craft_fee（取整到 10 元）
   */
  private async adjustProductPrices(goldPrice: number) {
    const COEFFICIENT = 1.05;
    const products = await this.prisma.product.findMany({
      where: { status: "PUBLISHED", goldWeight: { gt: 0 } },
      select: { id: true, goldWeight: true, craftFee: true, price: true },
    });

    const affectedProductIds: number[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      for (const product of products) {
        const craftFee = Number(product.craftFee || 0);
        const refPrice =
          Math.round(
            (Number(product.goldWeight) * goldPrice * COEFFICIENT + craftFee) /
              10,
          ) * 10;
        if (Math.abs(refPrice - Number(product.price)) <= 1) continue;

        // 同步该商品下有金重的 SKU 售价（下单读 sku.price，否则实付金额错误）
        const skus = await tx.productSKU.findMany({
          where: { productId: product.id, goldWeight: { gt: 0 } },
          select: { id: true, goldWeight: true, price: true },
        });
        let skuChanged = false;
        for (const sku of skus) {
          const skuPrice =
            Math.round(
              (Number(sku.goldWeight) * goldPrice * COEFFICIENT + craftFee) /
                10,
            ) * 10;
          if (Math.abs(skuPrice - Number(sku.price)) > 1) {
            await tx.productSKU.update({
              where: { id: sku.id },
              data: { price: skuPrice },
            });
            skuChanged = true;
          }
        }
        if (!skuChanged) continue;

        affectedProductIds.push(product.id);
      }
      return {
        totalProducts: products.length,
        adjustedCount: affectedProductIds.length,
      };
    });

    // 事务提交后：重算起价（Product.price = min 活跃 SKU 价）并通知前台 SSE 刷新（P1-2）
    for (const pid of affectedProductIds) {
      await this.productsService.refreshStartingPriceAndNotify(pid);
    }

    this.logger.log(
      `Price adjustment complete: ${result.adjustedCount}/${result.totalProducts} products updated`,
    );
    return result;
  }
}
