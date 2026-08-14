/**
 * 受控产品媒体迁移脚本（任务书第五节 B）
 *
 * 功能：
 * - 仅处理 ProductImage 表明确引用的图片；
 * - 支持当前 /uploads/ 与 /images/products/ 两类本地来源；
 * - 将有效原图复制到受控私有目录 private-media/products；
 * - 更新 ProductImage.storageKey；
 * - 验证新文件存在、大小非零、Sharp 可读取；
 * - 确认 DB 切换后，删除"仅被该 ProductImage 引用且无公开页面模块引用"的旧公开原文件；
 * - 如发现同一产品图还被公开页面模块直接引用，先将该引用替换为中性占位，再完成迁移；
 * - 不删除非 ProductImage 的站点素材；
 * - 幂等：可重复执行，已迁移（storageKey 且私有文件存在）的记录跳过。
 *
 * 运行方式（在 server 目录）：
 *   方式 A（推荐，先 prisma generate）：npx ts-node scripts/migrate-product-media.ts
 *   方式 B：npx tsc && node dist/scripts/migrate-product-media.js
 *   环境变量：PRODUCT_MEDIA_ROOT（私有根，默认 server/private-media/products）
 *
 * 默认不删除旧公开文件（--purge 才删除），分两阶段安全收尾。
 */
import { PrismaClient } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import { existsSync, mkdirSync, copyFileSync, statSync, unlinkSync } from 'fs';
import { join, resolve, dirname, sep } from 'path';

const prisma = new PrismaClient();

const PURGE = process.argv.includes('--purge');
const PLACEHOLDER_URL = '/images/product-placeholder.svg';

const privateRoot = resolve(
  process.env.PRODUCT_MEDIA_ROOT || join(process.cwd(), 'private-media', 'products'),
);
const uploadsRoot = resolve(process.cwd(), 'uploads');
const legacyRoot = resolve(
  process.env.PRODUCT_MEDIA_ROOT_LEGACY ||
    join(process.cwd(), '..', 'client', 'public', 'images', 'products'),
);

interface Stats {
  migrated: number;
  skipped: number;
  missing: number;
  conflict: number;
  neutralized: number;
  purged: number;
}
const stats: Stats = {
  migrated: 0,
  skipped: 0,
  missing: 0,
  conflict: 0,
  neutralized: 0,
  purged: 0,
};
const missingLog: string[] = [];

/** 把 ProductImage.url 解析为本地源文件绝对路径与相对键 */
function resolveSource(
  url: string,
): { abs: string; storageKey: string } | null {
  if (!url) return null;
  if (url.startsWith('/uploads/')) {
    const rel = url.slice('/uploads/'.length).replace(/\\/g, '/');
    const abs = resolveWithin(uploadsRoot, rel);
    if (!abs) return null;
    return { abs, storageKey: rel };
  }
  if (url.startsWith('/images/products/')) {
    const rel = url.slice('/images/products/'.length).replace(/\\/g, '/');
    const abs = resolveWithin(legacyRoot, rel);
    if (!abs) return null;
    // 加 legacy 前缀避免与 uploads 同名冲突
    return { abs, storageKey: `legacy/${rel}` };
  }
  // 已是 catalog:// 或 http 等非本地路径，跳过
  return null;
}

/** 路径穿越防护 */
function resolveWithin(root: string, requestedPath: string): string | null {
  const target = resolve(root, requestedPath);
  const rel = target.split(root)[1];
  if (!rel) return null;
  const cleaned = rel.replace(new RegExp(`^${sep === '\\' ? '\\\\' : sep}`), '');
  if (cleaned.startsWith('..') || cleaned === '..' || cleaned.startsWith(`..${sep}`)) {
    return null;
  }
  return target;
}

/** 收集公开页面模块/内容槽位中直接引用的产品图片 URL（用于冲突检查） */
async function collectPublicRefs(): Promise<Set<string>> {
  const refs = new Set<string>();
  const push = (v: unknown) => {
    if (typeof v === 'string' && (v.startsWith('/uploads/') || v.startsWith('/images/products/'))) {
      refs.add(v);
    }
  };
  const walk = (val: unknown) => {
    if (typeof val === 'string') push(val);
    else if (Array.isArray(val)) val.forEach(walk);
    else if (val && typeof val === 'object') Object.values(val).forEach(walk);
  };

  // PageDocument.puckData JSON 内引用
  const docs = await (prisma as any).pageDocument.findMany({ select: { puckData: true } });
  for (const d of docs) walk(d.puckData);

  // HomeSection / ContentSlot 的图片字段
  const sections = await (prisma as any).homeSection.findMany({
    select: { imageUrl: true, videoUrl: true },
  });
  for (const s of sections) {
    push(s.imageUrl);
    push(s.videoUrl);
  }
  const slots = await (prisma as any).contentSlot.findMany({
    select: { desktopAsset: true, mobileAsset: true },
  });
  for (const s of slots) {
    push(s.desktopAsset);
    push(s.mobileAsset);
  }
  return refs;
}

/** 将公开模块中对某 url 的引用替换为中性占位（任务书第五节 B1） */
async function neutralizePublicRefs(url: string): Promise<void> {
  const docs = await (prisma as any).pageDocument.findMany();
  for (const d of docs) {
    const raw = JSON.stringify(d.puckData);
    if (!raw.includes(url)) continue;
    const replaced = raw.split(url).join(PLACEHOLDER_URL);
    try {
      await (prisma as any).pageDocument.update({
        where: { id: d.id },
        data: { puckData: JSON.parse(replaced) },
      });
      stats.neutralized++;
    } catch (err: any) {
      console.warn(`[neutralize] PageDocument ${d.id} 替换失败: ${err.message}`);
    }
  }
  const sections = await (prisma as any).homeSection.findMany({ where: { OR: [{ imageUrl: url }, { videoUrl: url }] } });
  for (const s of sections) {
    await (prisma as any).homeSection.update({
      where: { id: s.id },
      data: { imageUrl: s.imageUrl === url ? PLACEHOLDER_URL : s.imageUrl, videoUrl: s.videoUrl === url ? null : s.videoUrl },
    });
    stats.neutralized++;
  }
  const slots = await (prisma as any).contentSlot.findMany({
    where: { OR: [{ desktopAsset: url }, { mobileAsset: url }] },
  });
  for (const s of slots) {
    await (prisma as any).contentSlot.update({
      where: { id: s.id },
      data: {
        desktopAsset: s.desktopAsset === url ? PLACEHOLDER_URL : s.desktopAsset,
        mobileAsset: s.mobileAsset === url ? PLACEHOLDER_URL : s.mobileAsset,
      },
    });
    stats.neutralized++;
  }
}

async function main() {
  console.log('=== 受控产品媒体迁移 ===');
  console.log(`私有根目录: ${privateRoot}`);
  console.log(`uploads 源: ${uploadsRoot}`);
  console.log(`legacy 源 : ${legacyRoot}`);
  console.log(`删除旧公开文件 (--purge): ${PURGE ? '是' : '否（仅复制，不删除，分阶段安全收尾）'}`);
  mkdirSync(privateRoot, { recursive: true });

  const publicRefs = await collectPublicRefs();
  console.log(`公开模块引用的产品图片 URL 数: ${publicRefs.size}`);

  const images = await (prisma as any).productImage.findMany();
  console.log(`ProductImage 总数: ${images.length}`);

  // 按 url 分组：用于"无其他 ProductImage 引用才删除"判断
  const urlCount = new Map<string, number>();
  for (const img of images) {
    if (!img.url) continue;
    urlCount.set(img.url, (urlCount.get(img.url) || 0) + 1);
  }

  for (const img of images) {
    // 幂等：已迁移且私有文件存在
    if (img.storageKey) {
      const dest = resolve(privateRoot, img.storageKey);
      if (existsSync(dest)) {
        stats.skipped++;
        continue;
      }
      // storageKey 存在但文件缺失：尝试重新从 url 迁移
    }

    const source = resolveSource(img.url);
    if (!source || !existsSync(source.abs)) {
      stats.missing++;
      missingLog.push(`ProductImage ${img.id} (productId=${img.productId}) url=${img.url}`);
      continue;
    }

    // 冲突：同一 url 被公开页面模块引用 → 先替换为占位
    if (publicRefs.has(img.url)) {
      await neutralizePublicRefs(img.url);
      stats.conflict++;
    }

    const dest = resolve(privateRoot, source.storageKey);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(source.abs, dest);

    // 验证：大小非零 + Sharp 可读
    const destStat = statSync(dest);
    if (destStat.size === 0) {
      missingLog.push(`ProductImage ${img.id} 复制后大小为 0`);
      stats.missing++;
      continue;
    }
    try {
      await sharp(dest).metadata();
    } catch (err: any) {
      missingLog.push(`ProductImage ${img.id} Sharp 无法读取: ${err.message}`);
      stats.missing++;
      continue;
    }

    // 确认 DB 切换成功：storageKey + url 统一回填为受控媒体端点。
    // url 是订单/选款快照的来源值，必须是 SecureImage 可渲染的 mediaUrl，
    // 否则 purge 删除旧 /uploads 文件后，历史快照图全部失效。
    await (prisma as any).productImage.update({
      where: { id: img.id },
      data: {
        storageKey: source.storageKey,
        url: `/products/catalog/${img.productId}/media/${img.id}`,
      },
    });
    stats.migrated++;

    // 删除旧公开原文件：仅当 --purge + 无其他 ProductImage 引用 + 无公开页面引用
    if (PURGE) {
      if ((urlCount.get(img.url) || 0) > 1) {
        // 多个 ProductImage 共用该文件，跳过删除（迁移完所有引用后下次运行才会删）
        continue;
      }
      if (publicRefs.has(img.url)) {
        continue;
      }
      try {
        unlinkSync(source.abs);
        stats.purged++;
      } catch (err: any) {
        // 删除失败不阻断迁移
        console.warn(`删除旧文件失败 ${source.abs}: ${err.message}`);
      }
    }
  }

  console.log('\n=== 迁移结果 ===');
  console.log(JSON.stringify(stats, null, 2));
  if (missingLog.length > 0) {
    console.log(`\n缺失/异常记录 (${missingLog.length}):`);
    missingLog.slice(0, 50).forEach((line) => console.log('  - ' + line));
    if (missingLog.length > 50) console.log(`  ...（其余 ${missingLog.length - 50} 条省略）`);
  }
  if (!PURGE) {
    console.log('\n提示：本次仅复制到私有存储，未删除旧公开文件。');
    console.log('确认前端全部迁移到受控媒体端点后，重新运行加 --purge 完成安全收尾。');
  }
}

main()
  .catch((err) => {
    console.error('迁移脚本失败:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
