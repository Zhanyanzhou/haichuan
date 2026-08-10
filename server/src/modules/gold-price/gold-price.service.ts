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
    const latest = await this.prisma.goldPrice.findFirst({
      orderBy: { recordDate: 'desc' },
    });

    if (latest) {
      return {
        price: Number(latest.price),
        source: latest.source,
        recordDate: latest.recordDate,
        change: this.currentPrice - this.previousPrice,
        changePercent: ((this.currentPrice - this.previousPrice) / this.previousPrice * 100).toFixed(2),
      };
    }

    throw new ServiceUnavailableException('暂无经过验证的金价数据');
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
    const products = await this.prisma.product.findMany({
      where: {
        status: { in: ['PUBLISHED', 'DRAFT'] },
        goldWeight: { gt: 0 },
      },
      select: { id: true, goldWeight: true, craftFee: true, price: true },
    });

    let adjustedCount = 0;
    const coefficient = 1.05; // Default markup coefficient

    for (const product of products) {
      const newPrice = Number(product.goldWeight) * goldPrice * coefficient + Number(product.craftFee || 0);
      const roundedPrice = Math.round(newPrice / 10) * 10; // Round to nearest 10

      if (Math.abs(roundedPrice - Number(product.price)) > 1) {
        await this.prisma.product.update({
          where: { id: product.id },
          data: { price: roundedPrice },
        });

        // Record price history
        await this.prisma.priceHistory.create({
          data: {
            productId: product.id,
            oldPrice: product.price || 0,
            newPrice: roundedPrice,
            goldPrice,
            operatorId: 0, // System
            reason: `金价变动 ¥${goldPrice}/克，自动调价`,
          },
        });

        adjustedCount++;
      }
    }

    this.logger.log(`Price adjustment complete: ${adjustedCount}/${products.length} products updated`);
    return { totalProducts: products.length, adjustedCount };
  }
}
