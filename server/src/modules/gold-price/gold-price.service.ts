import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class GoldPriceService {
  private readonly logger = new Logger(GoldPriceService.name);
  private currentPrice = 485.60; // Default gold price
  private previousPrice = 483.30;

  constructor(private prisma: PrismaService) {}

  /**
   * Get latest gold price
   */
  async getLatest() {
    // 取最近两条金价记录计算涨跌,避免依赖进程内存变量(重启/多实例下会失真)
    const [latest, previous] = await this.prisma.goldPrice.findMany({
      orderBy: { recordDate: 'desc' },
      take: 2,
    });

    if (!latest) {
      throw new ServiceUnavailableException('暂无经过验证的金价数据');
    }

    const price = Number(latest.price);
    const prevPrice = previous ? Number(previous.price) : price;
    const change = Number((price - prevPrice).toFixed(2));
    const changePercent =
      prevPrice !== 0 ? (((price - prevPrice) / prevPrice) * 100).toFixed(2) : '0.00';

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
      orderBy: { recordDate: 'asc' },
      select: { price: true, source: true, recordDate: true },
    });

    return records.map((r) => ({
      price: Number(r.price),
      source: r.source,
      date: r.recordDate,
    }));
  }

  /**
   * Manually update gold price
   */
  async updateManually(data: { price: number; operatorId: number; remark?: string }) {
    this.previousPrice = this.currentPrice;
    this.currentPrice = data.price;

    const record = await this.prisma.goldPrice.create({
      data: {
        price: data.price,
        source: 'MANUAL',
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
   * Get current gold price value
   */
  getCurrentPrice(): number {
    return this.currentPrice;
  }

  /**
   * Scheduled task: Fetch gold price automatically (twice daily)
   * In production, this would call Shanghai Gold Exchange API
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async fetchGoldPriceMorning() {
    await this.fetchAndUpdateGoldPrice('AUTO_MORNING');
  }

  @Cron(CronExpression.EVERY_DAY_AT_3PM)
  async fetchGoldPriceAfternoon() {
    await this.fetchAndUpdateGoldPrice('AUTO_AFTERNOON');
  }

  /**
   * 自动金价源尚未接入前禁止写入模拟报价，避免影响商品售价。
   */
  private async fetchAndUpdateGoldPrice(source: string) {
    this.logger.warn(`已跳过 ${source} 金价任务：尚未配置可信行情源`);
  }

  /**
   * Automatic price adjustment engine
   * Formula: product_price = gold_weight × gold_price × coefficient + craft_fee
   */
  private async adjustProductPrices(goldPrice: number) {
    const coefficient = 1.05; // 默认加价系数

    const result = await this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: {
          status: { in: ['PUBLISHED', 'DRAFT'] },
          goldWeight: { gt: 0 },
        },
        select: { id: true, goldWeight: true, craftFee: true, price: true },
      });

      let adjustedCount = 0;
      for (const product of products) {
        const craftFee = Number(product.craftFee || 0);
        const newPrice = Math.round((Number(product.goldWeight) * goldPrice * coefficient + craftFee) / 10) * 10;

        if (Math.abs(newPrice - Number(product.price)) > 1) {
          await tx.product.update({
            where: { id: product.id },
            data: { price: newPrice },
          });

          await tx.priceHistory.create({
            data: {
              productId: product.id,
              oldPrice: product.price || 0,
              newPrice,
              goldPrice,
              operatorId: 0, // 系统
              reason: `金价变动 ¥${goldPrice}/克，自动调价`,
            },
          });

          // 同步该商品下有金重的 SKU 价格：下单读 sku.price，否则仍是旧价导致实付金额错误
          const skus = await tx.productSKU.findMany({
            where: { productId: product.id, goldWeight: { gt: 0 } },
            select: { id: true, goldWeight: true, price: true },
          });
          for (const sku of skus) {
            const skuPrice = Math.round((Number(sku.goldWeight) * goldPrice * coefficient + craftFee) / 10) * 10;
            if (Math.abs(skuPrice - Number(sku.price)) > 1) {
              await tx.productSKU.update({ where: { id: sku.id }, data: { price: skuPrice } });
            }
          }

          adjustedCount++;
        }
      }

      return { totalProducts: products.length, adjustedCount };
    });

    this.logger.log(`Price adjustment complete: ${result.adjustedCount}/${result.totalProducts} products updated`);
    return result;
  }
}
