import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

const SETTINGS_FILE = path.resolve(__dirname, '..', '..', '..', 'settings.json');
const SETTINGS_KEY = 'site';

const DEFAULT_SETTINGS = {
  siteName: '海川珠宝',
  siteDescription: '珠宝作品与顾问服务',
  logo: '',
  seoTitle: '海川珠宝',
  seoDescription: '浏览珠宝作品，了解定制与顾问服务。',
  seoKeywords: '珠宝,首饰,黄金,钻石,手镯,吊坠,戒指,耳饰',
  contactPhone: '',
  contactEmail: '',
  contactAddress: '',
  storeName: '',
  businessHours: '',
  storeMapUrl: '',
  paymentMethods: ['transfer'],
  logisticsCompanies: ['顺丰速运', '京东物流', 'EMS'],
};

const LEGACY_PLACEHOLDER_LOGOS = new Set(['/favicon.svg', '/images/brand-logo.svg']);
const MIN_DATABASE_BACKUP_BYTES = 1024;
const DEFAULT_BACKUP_INTERVAL_SECONDS = 86400;
const DEFAULT_BACKUP_HEALTH_GRACE_SECONDS = 3600;

type BackupArtifact = { name: string; size: number; mtime: Date };

type BackupSet = {
  timestamp: string;
  database: BackupArtifact;
  uploads: BackupArtifact;
  privateMedia: BackupArtifact;
  manifest: BackupArtifact;
};

export type BackupExecutionStatus = {
  markerPresent: boolean;
  markerValid: boolean;
  executionStatus: 'SUCCESS' | 'WARNING' | 'FAILED' | 'UNKNOWN' | 'INVALID';
  lastAttemptStartedAt: string | null;
  lastAttemptFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastExitCode: number | null;
  errorCode: string | null;
  warningCode: string | null;
  latestManifest: string | null;
  isFresh: boolean;
  isHealthy: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

export function evaluateBackupExecutionMarker(
  source: string | null,
  intervalSeconds: number,
  graceSeconds: number,
  now = new Date(),
): BackupExecutionStatus {
  const empty: BackupExecutionStatus = {
    markerPresent: false,
    markerValid: false,
    executionStatus: 'UNKNOWN',
    lastAttemptStartedAt: null,
    lastAttemptFinishedAt: null,
    lastSuccessAt: null,
    lastExitCode: null,
    errorCode: null,
    warningCode: null,
    latestManifest: null,
    isFresh: false,
    isHealthy: false,
  };
  if (source === null) return empty;

  const values = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    if (!line) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  const result = values.get('RESULT') ?? '';
  const startedAt = values.get('LAST_ATTEMPT_STARTED_AT') ?? '';
  const finishedAt = values.get('LAST_ATTEMPT_FINISHED_AT') ?? '';
  const lastSuccessAt = values.get('LAST_SUCCESS_AT') ?? '';
  const exitCodeText = values.get('LAST_EXIT_CODE') ?? '';
  const latestManifest = values.get('LATEST_MANIFEST') ?? '';
  const exitCode = /^\d+$/.test(exitCodeText) ? Number(exitCodeText) : null;
  const valid = values.get('SCHEMA_VERSION') === '1'
    && ['SUCCESS', 'WARNING', 'FAILED'].includes(result)
    && isIsoTimestamp(startedAt)
    && isIsoTimestamp(finishedAt)
    && (lastSuccessAt === '' || isIsoTimestamp(lastSuccessAt))
    && exitCode !== null
    && (latestManifest === '' || /^jewelry_db_\d{8}_\d{6}\.sha256$/.test(latestManifest));
  if (!valid) {
    return { ...empty, markerPresent: true, executionStatus: 'INVALID' };
  }

  const normalizedInterval = Number.isFinite(intervalSeconds) && intervalSeconds > 0
    ? intervalSeconds
    : DEFAULT_BACKUP_INTERVAL_SECONDS;
  const normalizedGrace = Number.isFinite(graceSeconds) && graceSeconds >= 0
    ? graceSeconds
    : DEFAULT_BACKUP_HEALTH_GRACE_SECONDS;
  const ageMs = lastSuccessAt ? now.getTime() - Date.parse(lastSuccessAt) : Number.POSITIVE_INFINITY;
  const isFresh = ageMs >= 0 && ageMs <= (normalizedInterval + normalizedGrace) * 1000;
  const executionStatus = result as BackupExecutionStatus['executionStatus'];
  return {
    markerPresent: true,
    markerValid: true,
    executionStatus,
    lastAttemptStartedAt: startedAt,
    lastAttemptFinishedAt: finishedAt,
    lastSuccessAt: lastSuccessAt || null,
    lastExitCode: exitCode,
    errorCode: values.get('ERROR_CODE') || null,
    warningCode: values.get('WARNING_CODE') || null,
    latestManifest: latestManifest || null,
    isFresh,
    isHealthy: executionStatus === 'SUCCESS' && exitCode === 0 && isFresh,
  };
}

export function summarizeBackupArtifacts(
  files: BackupArtifact[],
  intervalSeconds: number,
  now = new Date(),
) {
  const databasePattern = /^jewelry_db_(\d{8}_\d{6})\.sql\.gz$/;
  const artifactsByName = new Map(files.map((file) => [file.name, file]));
  const completeSets: BackupSet[] = [];
  const consumedArtifacts = new Set<string>();

  for (const database of files) {
    const match = databasePattern.exec(database.name);
    if (!match || database.size < MIN_DATABASE_BACKUP_BYTES) continue;
    const timestamp = match[1];
    const uploads = artifactsByName.get(`jewelry_media_${timestamp}_uploads.tar.gz`);
    const privateMedia = artifactsByName.get(`jewelry_media_${timestamp}_private-media.tar.gz`);
    const manifest = artifactsByName.get(`jewelry_db_${timestamp}.sha256`);
    if (
      !uploads || uploads.size <= 0
      || !privateMedia || privateMedia.size <= 0
      || !manifest || manifest.size <= 0
    ) continue;
    completeSets.push({ timestamp, database, uploads, privateMedia, manifest });
    consumedArtifacts.add(database.name);
    consumedArtifacts.add(uploads.name);
    consumedArtifacts.add(privateMedia.name);
    consumedArtifacts.add(manifest.name);
  }

  completeSets.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const latest = completeSets[0] ?? null;
  const normalizedInterval = Number.isFinite(intervalSeconds) && intervalSeconds > 0
    ? intervalSeconds
    : DEFAULT_BACKUP_INTERVAL_SECONDS;
  const freshnessWindowMs = normalizedInterval * 2 * 1000;
  const latestTime = latest
    ? latest.manifest.mtime.getTime()
    : 0;
  const isFresh = latestTime > 0 && now.getTime() - latestTime <= freshnessWindowMs;

  return {
    completeSets,
    latest,
    isFresh,
    incompleteArtifactCount: files.filter((file) => !consumedArtifacts.has(file.name)).length,
  };
}

function normalizeSettings(settings: unknown): Record<string, unknown> {
  const source = isRecord(settings) ? settings : {};
  const logo = typeof source.logo === 'string' ? source.logo.trim() : '';
  return {
    ...source,
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

    // GET（包括公开 settings）必须保持只读。首次持久化只发生在显式 PUT；
    // 这样目标环境的只读盘点不会因为空库读取而创建 SiteSetting 记录。
    return normalizeSettings(this.loadLegacyFile()) as Record<string, unknown>;
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
    // OR-1 备份容器产物目录（compose 将宿主 ./backups 只读挂载到 server 容器 /backups）。
    // 本地开发未挂载该目录时诚实说明，不返回误导性的"未接入"。
    const dir = process.env.BACKUP_DIR || '/backups';
    try {
      const entries = await fs.promises.readdir(dir);
      const configuredInterval = Number(process.env.BACKUP_INTERVAL_SECONDS || DEFAULT_BACKUP_INTERVAL_SECONDS);
      const intervalSeconds = Number.isFinite(configuredInterval) && configuredInterval > 0
        ? configuredInterval
        : DEFAULT_BACKUP_INTERVAL_SECONDS;
      const configuredGrace = Number(
        process.env.BACKUP_HEALTH_GRACE_SECONDS || DEFAULT_BACKUP_HEALTH_GRACE_SECONDS,
      );
      const graceSeconds = Number.isFinite(configuredGrace) && configuredGrace >= 0
        ? configuredGrace
        : DEFAULT_BACKUP_HEALTH_GRACE_SECONDS;
      let markerSource: string | null = null;
      try {
        markerSource = await fs.promises.readFile(
          path.join(dir, '.health', 'backup-status.env'),
          'utf8',
        );
      } catch (error: unknown) {
        const code = isRecord(error) && typeof error.code === 'string' ? error.code : null;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
      }
      const execution = evaluateBackupExecutionMarker(
        markerSource,
        intervalSeconds,
        graceSeconds,
      );
      const files: BackupArtifact[] = [];
      for (const name of entries) {
        // 只识别 backup.sh 的数据库、媒体与批次 SHA-256 完成清单。
        if (!/\.(sql\.gz|tar\.gz|sha256)$/.test(name)) continue;
        const stat = await fs.promises.stat(path.join(dir, name));
        if (stat.isFile()) files.push({ name, size: stat.size, mtime: stat.mtime });
      }
      const intervalHours = Math.max(1, Math.round(intervalSeconds / 3600));
      const schedule = `backup 容器目标每 ${intervalHours} 小时一轮（保留 7 天）`;
      const summary = summarizeBackupArtifacts(files, intervalSeconds);
      if (files.length === 0) {
        return {
          lastBackup: null,
          autoBackup: false,
          storageMounted: true,
          backupSchedule: schedule,
          totalBackups: 0,
          ...execution,
          message: execution.executionStatus === 'FAILED'
            ? `最近一次备份失败（${execution.errorCode || 'UNKNOWN'}），且暂无完整备份产物。`
            : `备份目录已挂载（${dir}），但暂无备份产物；请确认 backup 容器已启动，详见 docker logs jewelry-backup。`,
        };
      }
      if (!summary.latest) {
        return {
          lastBackup: null,
          autoBackup: false,
          storageMounted: true,
          backupSchedule: schedule,
          totalBackups: 0,
          incompleteArtifactCount: summary.incompleteArtifactCount,
          ...execution,
          message: `备份目录中有 ${files.length} 个产物，但没有数据库、uploads 与 private-media 同批且有效的完整备份组。`,
        };
      }
      const latestFiles = [
        summary.latest.database,
        summary.latest.uploads,
        summary.latest.privateMedia,
        summary.latest.manifest,
      ];
      const markerMatchesLatest = execution.latestManifest === summary.latest.manifest.name;
      const autoBackup = summary.isFresh && execution.isHealthy && markerMatchesLatest;
      let message: string;
      if (!execution.markerPresent) {
        message = `最近完整备份批次 ${summary.latest.timestamp} 存在，但缺少执行状态标记，无法证明定时任务最近一次成功。`;
      } else if (!execution.markerValid) {
        message = `最近完整备份批次 ${summary.latest.timestamp} 存在，但执行状态标记无效。`;
      } else if (execution.executionStatus !== 'SUCCESS' || execution.lastExitCode !== 0) {
        message = `最近一次备份执行状态为 ${execution.executionStatus}（${execution.errorCode || 'UNKNOWN'}），请检查 backup 容器日志。`;
      } else if (!execution.isFresh) {
        message = `最近一次成功备份已超过计划周期与宽限时间，请检查 backup 容器。`;
      } else if (!markerMatchesLatest) {
        message = `状态标记与最近完整备份清单不一致，请核对备份目录完整性。`;
      } else if (!summary.isFresh) {
        message = `最近完整备份批次 ${summary.latest.timestamp} 已超过产物新鲜度窗口。`;
      } else {
        message = `最近完整备份批次：${summary.latest.timestamp}，共 ${summary.completeSets.length} 组；执行状态与产物一致。`;
      }
      return {
        lastBackup: new Date(Math.max(...latestFiles.map((file) => file.mtime.getTime()))).toISOString(),
        autoBackup,
        storageMounted: true,
        backupSchedule: schedule,
        totalBackups: summary.completeSets.length,
        incompleteArtifactCount: summary.incompleteArtifactCount,
        latestFiles: latestFiles.map((file) => ({ name: file.name, size: file.size })),
        ...execution,
        markerMatchesLatest,
        message,
      };
    } catch (error: unknown) {
      const code = isRecord(error) && typeof error.code === 'string' ? error.code : null;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return {
          lastBackup: null,
          autoBackup: false,
          storageMounted: false,
          backupSchedule: null,
          totalBackups: 0,
          ...evaluateBackupExecutionMarker(null, DEFAULT_BACKUP_INTERVAL_SECONDS, DEFAULT_BACKUP_HEALTH_GRACE_SECONDS),
          message: '备份目录未挂载到 server 容器（本地开发环境属正常）；生产部署请确认 ./backups 已只读挂载。',
        };
      }
      throw error;
    }
  }

  async getLogs(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    module?: string;
    action?: string;
  }) {
    const page = Math.max(1, Math.trunc(Number(params.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(params.pageSize) || 50)));
    const keyword = params.keyword?.trim();
    const module = params.module?.trim();
    const action = params.action?.trim();
    const where: Prisma.OperationLogWhereInput = {};
    if (module) where.module = module;
    if (action) where.action = action;
    if (keyword) {
      where.OR = [
        { action: { contains: keyword } },
        { module: { contains: keyword } },
        { user: { username: { contains: keyword } } },
        { user: { realName: { contains: keyword } } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.operationLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true, realName: true } } },
      }),
      this.prisma.operationLog.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }
}
