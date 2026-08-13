import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

const SETTINGS_FILE = path.resolve(__dirname, '..', '..', '..', 'settings.json');
const SETTINGS_KEY = 'site';

const DEFAULT_SETTINGS = {
  siteName: '海川珠宝',
  siteDescription: '高端珠宝产品管理平台',
  logo: '',
  seoTitle: '海川珠宝 - 高端珠宝臻品平台',
  seoDescription: '4000+款高端珠宝臻品，融合传统工艺与现代科技',
  seoKeywords: '珠宝,首饰,黄金,钻石,手镯,吊坠,戒指,耳饰',
  contactPhone: '',
  contactEmail: '',
  contactAddress: '',
  paymentMethods: ['transfer'],
  logisticsCompanies: ['顺丰速运', '京东物流', 'EMS'],
};

const LEGACY_PLACEHOLDER_LOGOS = new Set(['/favicon.svg', '/images/brand-logo.svg']);

function normalizeSettings(settings: any) {
  const logo = typeof settings?.logo === 'string' ? settings.logo.trim() : '';
  return {
    ...settings,
    logo: LEGACY_PLACEHOLDER_LOGOS.has(logo.toLowerCase()) ? '' : logo,
  };
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 只在首次初始化时读取旧 JSON 文件，随后所有读写均以数据库为准。
   * Docker 镜像和重建容器不再依赖该文件，保留读取逻辑用于本地旧配置平滑迁移。
   */
  private loadLegacyFile(): Prisma.InputJsonObject {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        return normalizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) }) as Prisma.InputJsonObject;
      }
    } catch (e) {
      this.logger.warn(`读取设置文件失败，使用默认设置`);
    }
    return normalizeSettings({ ...DEFAULT_SETTINGS }) as Prisma.InputJsonObject;
  }

  async getSettings(): Promise<Record<string, unknown>> {
    const stored = await this.prisma.siteSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    if (stored) return normalizeSettings(stored.value) as Record<string, unknown>;

    const value = this.loadLegacyFile();
    const created = await this.prisma.siteSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value },
      update: {},
    });
    return normalizeSettings(created.value) as Record<string, unknown>;
  }

  async updateSettings(data: object, userId?: number) {
    const current = await this.getSettings();
    const updated = { ...current, ...data } as Prisma.InputJsonObject;
    const saved = await this.prisma.siteSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: updated, updatedBy: userId },
      update: {
        value: updated,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
    return normalizeSettings(saved.value) as Record<string, unknown>;
  }

  async getBackupStatus() {
    return {
      lastBackup: null,
      autoBackup: false,
      backupSchedule: null,
      totalBackups: 0,
      message: '当前未接入可验证的自动备份任务，请配置数据库备份后再启用自动备份状态。',
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
