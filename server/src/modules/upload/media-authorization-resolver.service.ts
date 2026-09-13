import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  evaluateMediaPublicEligibility,
  MediaPublicIneligibilityReason,
} from './media-public-eligibility';
import { resolveMediaStorageRoots } from './media-storage-paths';

export type MediaAuthorizationResolutionMode = 'SHADOW' | 'ENFORCE';

export type MediaReferenceContext = {
  path?: string;
  sourceType?: string;
  sourceId?: string;
};

export type MediaReferenceInput = MediaReferenceContext & { url: string };

export type MediaReferenceIssueCode =
  | 'DANGEROUS_URL'
  | 'EXTERNAL_UNMANAGED'
  | 'UNREGISTERED_MEDIA'
  | 'ASSET_FILE_UNAVAILABLE'
  | 'ASSET_INTEGRITY_MISMATCH'
  | MediaPublicIneligibilityReason;

export type MediaReferenceIssue = {
  url: string;
  path?: string;
  code: MediaReferenceIssueCode;
  severity: 'WARNING' | 'ERROR';
  message: string;
};

export type ResolvedMediaReferenceItem = {
  url: string;
  context: MediaReferenceContext;
  assetId?: number;
  storageKey?: string;
  assetStatus?: string;
  accessLevel?: string;
  lifecycleRevision?: number;
  authorizationRevision?: number | null;
  publicUseEpoch?: number | null;
  reviewStatus?: string | null;
  revocationStatus?: string | null;
  eligibility: {
    eligible: boolean;
    reasons: MediaReferenceIssueCode[];
  };
};

const AUTHORIZATION_REASONS = new Set<MediaReferenceIssueCode>([
  'AUTHORIZATION_MISSING',
  'AUTHORIZATION_NOT_APPROVED',
  'PUBLIC_WEB_USE_NOT_ALLOWED',
  'AUTHORIZATION_NOT_STARTED',
  'AUTHORIZATION_EXPIRED',
  'AUTHORIZATION_REVOKED',
]);

const ISSUE_MESSAGES: Record<MediaReferenceIssueCode, string> = {
  DANGEROUS_URL: '素材地址使用了不安全协议或格式',
  EXTERNAL_UNMANAGED: '外部素材尚未纳入受控媒体库',
  UNREGISTERED_MEDIA: '本站上传素材没有对应的媒体登记',
  ASSET_FILE_UNAVAILABLE: '素材文件不存在或不在受控公开目录内',
  ASSET_INTEGRITY_MISMATCH: '素材文件内容与登记校验和不一致',
  ASSET_NOT_READY: '素材文件当前不可公开读取',
  ASSET_NOT_PUBLIC: '素材访问级别不是公开',
  AUTHORIZATION_MISSING: '素材缺少集中授权记录',
  AUTHORIZATION_NOT_APPROVED: '素材授权尚未批准',
  PUBLIC_WEB_USE_NOT_ALLOWED: '素材授权未允许公网使用',
  AUTHORIZATION_NOT_STARTED: '素材授权尚未开始生效',
  AUTHORIZATION_EXPIRED: '素材授权已过期',
  AUTHORIZATION_REVOKED: '素材授权已撤销',
};

type ManagedReference = MediaReferenceInput & {
  lookup: { id: number } | { storageKey: string };
};

@Injectable()
export class MediaAuthorizationResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveReferences(
    references: readonly MediaReferenceInput[],
    options: {
      transaction?: Prisma.TransactionClient;
      mode?: MediaAuthorizationResolutionMode;
      now?: Date;
    } = {},
  ) {
    const mode = options.mode ?? 'ENFORCE';
    const client = options.transaction ?? this.prisma;
    const now = options.now ?? new Date();
    const managed: ManagedReference[] = [];
    const items: ResolvedMediaReferenceItem[] = [];
    const issues: MediaReferenceIssue[] = [];

    for (const reference of references) {
      const classification = this.classify(reference);
      if (classification.kind === 'MANAGED') {
        managed.push({ ...reference, lookup: classification.lookup });
      } else if (classification.kind === 'ISSUE') {
        issues.push(this.issue(reference, classification.code, 'ERROR'));
        items.push({
          url: reference.url,
          context: this.contextOf(reference),
          eligibility: { eligible: false, reasons: [classification.code] },
        });
      } else {
        items.push({
          url: reference.url,
          context: this.contextOf(reference),
          eligibility: { eligible: true, reasons: [] },
        });
      }
    }

    const ids = managed.flatMap((reference) => 'id' in reference.lookup ? [reference.lookup.id] : []);
    const storageKeys = managed.flatMap((reference) => 'storageKey' in reference.lookup ? [reference.lookup.storageKey] : []);
    const assets = managed.length === 0 ? [] : await client.mediaAsset.findMany({
      where: {
        OR: [
          ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
          ...(storageKeys.length > 0 ? [{ storageKey: { in: storageKeys } }] : []),
        ],
      },
      include: { authorization: true },
    });
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const byStorageKey = new Map(assets.map((asset) => [asset.storageKey, asset]));
    const fileIssueByAssetId = new Map<number, Promise<
      'ASSET_FILE_UNAVAILABLE' | 'ASSET_INTEGRITY_MISMATCH' | null
    >>();

    for (const reference of managed) {
      const asset = 'id' in reference.lookup
        ? byId.get(reference.lookup.id)
        : byStorageKey.get(reference.lookup.storageKey);
      if (!asset || !asset.storageKey.startsWith('page-assets/')) {
        issues.push(this.issue(reference, 'UNREGISTERED_MEDIA', 'ERROR'));
        items.push({
          url: reference.url,
          context: this.contextOf(reference),
          eligibility: { eligible: false, reasons: ['UNREGISTERED_MEDIA'] },
        });
        continue;
      }

      const authorizationEligibility = evaluateMediaPublicEligibility({
        assetStatus: asset.status,
        accessLevel: asset.accessLevel,
        authorization: asset.authorization,
      }, now);
      const fileIssue = authorizationEligibility.eligible
        ? await this.cachedFileIssue(fileIssueByAssetId, asset)
        : null;
      const eligibility = {
        eligible: authorizationEligibility.eligible && fileIssue === null,
        reasons: [
          ...authorizationEligibility.reasons,
          ...(fileIssue ? [fileIssue] : []),
        ] as MediaReferenceIssueCode[],
      };
      for (const reason of eligibility.reasons) {
        const severity = mode === 'SHADOW' && AUTHORIZATION_REASONS.has(reason) ? 'WARNING' : 'ERROR';
        issues.push(this.issue(reference, reason, severity));
      }
      items.push({
        url: reference.url,
        context: this.contextOf(reference),
        assetId: asset.id,
        storageKey: asset.storageKey,
        assetStatus: asset.status,
        accessLevel: asset.accessLevel,
        lifecycleRevision: asset.lifecycleRevision,
        authorizationRevision: asset.authorization?.revision ?? null,
        publicUseEpoch: asset.authorization?.publicUseEpoch ?? null,
        reviewStatus: asset.authorization?.reviewStatus ?? null,
        revocationStatus: asset.authorization?.revocationStatus ?? null,
        eligibility,
      });
    }

    return {
      items,
      issues,
      eligible: issues.every((issue) => issue.severity !== 'ERROR'),
      mode,
    };
  }

  private cachedFileIssue(
    cache: Map<number, Promise<'ASSET_FILE_UNAVAILABLE' | 'ASSET_INTEGRITY_MISMATCH' | null>>,
    asset: { id: number; storageKey: string; checksumSha256: string },
  ) {
    const cached = cache.get(asset.id);
    if (cached) return cached;
    const pending = this.verifyManagedFile(asset.storageKey, asset.checksumSha256);
    cache.set(asset.id, pending);
    return pending;
  }

  private async verifyManagedFile(
    storageKey: string,
    expectedChecksum: string,
  ): Promise<'ASSET_FILE_UNAVAILABLE' | 'ASSET_INTEGRITY_MISMATCH' | null> {
    try {
      const publicRoot = resolveMediaStorageRoots().publicRoot;
      const [physicalRoot, physicalTarget] = await Promise.all([
        realpath(publicRoot),
        realpath(resolve(publicRoot, storageKey)),
      ]);
      const pathFromRoot = relative(physicalRoot, physicalTarget);
      if (
        !pathFromRoot
        || pathFromRoot === '..'
        || pathFromRoot.startsWith(`..${sep}`)
        || isAbsolute(pathFromRoot)
      ) return 'ASSET_FILE_UNAVAILABLE';

      const actualChecksum = await new Promise<string>((resolveChecksum, reject) => {
        const hash = createHash('sha256');
        const stream = createReadStream(physicalTarget);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.once('error', reject);
        stream.once('end', () => resolveChecksum(hash.digest('hex')));
      });
      return actualChecksum === expectedChecksum.toLowerCase()
        ? null
        : 'ASSET_INTEGRITY_MISMATCH';
    } catch {
      return 'ASSET_FILE_UNAVAILABLE';
    }
  }

  private classify(reference: MediaReferenceInput):
    | { kind: 'MANAGED'; lookup: ManagedReference['lookup'] }
    | { kind: 'ISSUE'; code: 'DANGEROUS_URL' | 'EXTERNAL_UNMANAGED' }
    | { kind: 'PASSTHROUGH' } {
    const value = reference.url.trim();
    if (!value || /^(?:data|blob|javascript|vbscript|file):/i.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) {
      return { kind: 'ISSUE', code: 'DANGEROUS_URL' };
    }
    if (/^https?:\/\//i.test(value) || value.startsWith('//')) {
      return { kind: 'ISSUE', code: 'EXTERNAL_UNMANAGED' };
    }
    const controlled = value.match(/^\/api\/upload\/public-media\/(\d+)(?:[?#].*)?$/);
    if (controlled) return { kind: 'MANAGED', lookup: { id: Number(controlled[1]) } };
    const stored = value.match(/^\/uploads\/(page-assets\/[^?#]+)(?:[?#].*)?$/);
    if (stored) {
      let storageKey: string;
      try {
        storageKey = decodeURIComponent(stored[1]);
      } catch {
        return { kind: 'ISSUE', code: 'DANGEROUS_URL' };
      }
      const segments = storageKey.split('/');
      if (
        /[\u0000-\u001f\u007f]/u.test(storageKey) ||
        storageKey.includes('\\') ||
        segments.some((segment) => segment === '.' || segment === '..')
      ) {
        return { kind: 'ISSUE', code: 'DANGEROUS_URL' };
      }
      return { kind: 'MANAGED', lookup: { storageKey } };
    }
    return { kind: 'PASSTHROUGH' };
  }

  private contextOf(reference: MediaReferenceInput): MediaReferenceContext {
    return {
      ...(reference.path ? { path: reference.path } : {}),
      ...(reference.sourceType ? { sourceType: reference.sourceType } : {}),
      ...(reference.sourceId ? { sourceId: reference.sourceId } : {}),
    };
  }

  private issue(
    reference: MediaReferenceInput,
    code: MediaReferenceIssueCode,
    severity: 'WARNING' | 'ERROR',
  ): MediaReferenceIssue {
    return {
      url: reference.url,
      ...(reference.path ? { path: reference.path } : {}),
      code,
      severity,
      message: ISSUE_MESSAGES[code],
    };
  }
}
