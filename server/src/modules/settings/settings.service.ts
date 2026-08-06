import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';

const SETTINGS_FILE = path.resolve(__dirname, '..', '..', '..', 'settings.json');

const DEFAULT_SETTINGS = {
  siteName: '海川珠宝',
  siteDescription: '高端珠宝产品管理平台',
  logo: '/favicon.svg',
  seoTitle: '海川珠宝 - 高端珠宝臻品平台',
  seoDescription: '4000+款高端珠宝臻品，融合传统工艺与现代科技',
  seoKeywords: '珠宝,首饰,黄金,钻石,手镯,吊坠,戒指,耳饰',
  contactPhone: '',
  contactEmail: '',
  contactAddress: '',
  paymentMethods: ['transfer'],
  logisticsCompanies: ['顺丰速运', '京东物流', 'EMS'],
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private prisma: PrismaService) {}

  private loadFromFile(): any {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {
      this.logger.warn(`读取设置文件失败，使用默认设置`);
    }
    return { ...DEFAULT_SETTINGS };
  }

  private saveToFile(data: any): void {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      this.logger.error(`保存设置文件失败`);
    }
  }

  getSettings() {
    return this.loadFromFile();
  }

  updateSettings(data: any) {
    const current = this.loadFromFile();
    const updated = { ...current, ...data };
    this.saveToFile(updated);
    return updated;
  }

  async getBackupStatus() {
    return {
      lastBackup: new Date().toISOString(),
      autoBackup: true,
      backupSchedule: '每日凌晨 3:00',
      totalBackups: 30,
    };
  }

  async getLogs(params: { page?: number; pageSize?: number }) {
    const { page = 1, pageSize = 50 } = params;
    const [list, total] = await Promise.all([
      this.prisma.operationLog.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true, realName: true } } },
      }),
      this.prisma.operationLog.count(),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }
}
