import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, relative, resolve, sep } from 'path';

interface CacheEntry {
  available: boolean;
  expiresAt: number;
}

interface ReadResult {
  buffer: Buffer;
  mimeType: string;
  isVideo: boolean;
}

/**
 * 产品媒体受控存储服务
 *
 * 安全模型：
 * - 新上传的产品图片写入私有目录 server/private-media/products（不被 ServeStaticModule 公开映射）；
 * - 客户商品接口只返回受保护媒体端点 mediaUrl，不返回 storageKey 或真实磁盘路径；
 * - 受控媒体端点验证访问者身份与商品可见范围后才读取文件；
 * - 对 PARTNER 商品面向客户的响应叠加可见水印，限制最大输出尺寸，不返回原始高清文件。
 */
@Injectable()
export class ProductMediaService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs = 10_000;

  // 受控媒体私有根目录（仅服务端可读，禁止放入 client/public、server/uploads 等公开静态目录）
  private readonly privateRoot = resolve(
    process.env.PRODUCT_MEDIA_ROOT || join(process.cwd(), 'private-media', 'products'),
  );
  private readonly uploadsRoot = resolve(process.cwd(), 'uploads');

  isAvailable(url?: string | null): boolean {
    if (!url) return false;
    if (/^(https?:|data:image\/)/i.test(url)) return true;
    // 受控媒体端点：可用性由媒体服务在请求时判定，此处视为可用（避免被误过滤）
    if (url.startsWith("/products/catalog/") && url.includes("/media/")) return true;

    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.available;

    const filePath = this.resolveLocalPath(url);
    const available = filePath ? existsSync(filePath) : false;
    this.cache.set(url, { available, expiresAt: Date.now() + this.cacheTtlMs });
    return available;
  }

  invalidate(): void {
    this.cache.clear();
  }

  /**
   * 读取一张产品图片的字节。
   * 优先按 storageKey 从私有目录读取；无 storageKey 时仅回退历史 uploads 路径。
   * 防止 ../ 路径穿越。
   */
  async readProductImage(image: {
    storageKey?: string | null;
    url?: string | null;
    isVideo?: boolean;
    mimeType?: string | null;
    mediaAsset?: {
      status?: string;
      checksumSha256?: string | null;
    } | null;
  }): Promise<ReadResult> {
    const mediaPath = this.resolveProductMediaPath(image);
    if (mediaPath) {
      if (image.mediaAsset && image.mediaAsset.status !== 'READY') {
        throw new NotFoundException('媒体文件暂不可用');
      }
      const buffer = await readFile(mediaPath);
      if (
        image.mediaAsset?.checksumSha256 &&
        createHash('sha256').update(buffer).digest('hex') !== image.mediaAsset.checksumSha256
      ) {
        throw new NotFoundException('媒体文件暂不可用');
      }
      return {
        buffer,
        mimeType: image.mimeType || this.guessMime(mediaPath),
        isVideo: !!image.isVideo,
      };
    }
    throw new NotFoundException('媒体文件暂不可用');
  }

  /** 写入和公开序列化共用同一可读性事实，避免生成必然 404 的受控媒体地址。 */
  isProductMediaReadable(image: {
    storageKey?: string | null;
    url?: string | null;
  }): boolean {
    const cacheKey = `product-media:${image.storageKey || ""}|${image.url || ""}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.available;

    const available = this.resolveProductMediaPath(image) !== null;
    this.cache.set(cacheKey, {
      available,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    return available;
  }

  /** 返回私有根目录（上传/裁切/迁移脚本复用） */
  getPrivateRoot(): string {
    return this.privateRoot;
  }

  /**
   * 为合作商家可见商品叠加可见水印并限制最大输出尺寸。
   * label 为可识别但不过度泄露的标识（公司名或手机号掩码）。
   */
  async applyPartnerWatermark(inputBuffer: Buffer, label: string): Promise<{ buffer: Buffer; mimeType: string }> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sharp = require('sharp');
    const meta = await sharp(inputBuffer).metadata();
    const w = meta.width || 1200;
    const h = meta.height || 1200;

    // 限制最大输出尺寸，不返回原始高清下载文件
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const watermarkSvg = this.buildWatermarkSvg(w, h, label);
    const svgBuffer = Buffer.from(watermarkSvg);

    const pipeline = sharp(inputBuffer)
      .resize(outW, outH, { fit: 'inside', withoutEnlargement: true })
      .composite([{ input: svgBuffer, blend: 'over' }]);

    // 输出 JPEG（统一格式，避免 PNG 体积过大）；视频不进此函数
    const buffer = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    return { buffer, mimeType: 'image/jpeg' };
  }

  /** 手机号掩码：138****1234 */
  maskPhone(phone?: string | null): string {
    if (!phone || phone.length < 7) return '合作商家';
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }

  /** 生成稳定但不可逆的短标识（用于水印标签，避免直接暴露完整手机号） */
  shortFingerprint(value: string): string {
    return createHash('sha1').update(value).digest('hex').slice(0, 6).toUpperCase();
  }

  private buildWatermarkSvg(w: number, h: number, label: string): string {
    const fontSize = Math.max(18, Math.round(Math.min(w, h) / 26));
    const line = `海川珠宝·合作资料  ${label}`;
    // 斜置平铺：每隔一定步长重复一行水印，覆盖图片关键区域
    const stepX = w * 0.6;
    const stepY = h * 0.35;
    const texts: string[] = [];
    for (let y = -h; y < h * 2; y += stepY) {
      for (let x = -w; x < w * 2; x += stepX) {
        texts.push(
          `<text x="${x}" y="${y}" font-size="${fontSize}" fill="rgba(255,255,255,0.32)" font-family="sans-serif" transform="rotate(-28 ${x} ${y})">${this.escapeXml(line)}</text>`,
        );
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${texts.join('')}</svg>`;
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private guessMime(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    return 'image/jpeg';
  }

  private resolveLocalPath(url: string): string | null {
    if (url.startsWith('/uploads/')) {
      return this.resolveWithin(this.uploadsRoot, url.slice('/uploads/'.length));
    }
    return null;
  }

  private resolveProductMediaPath(image: {
    storageKey?: string | null;
    url?: string | null;
  }): string | null {
    if (image.storageKey) {
      const privatePath = this.resolveWithin(this.privateRoot, image.storageKey);
      if (privatePath && existsSync(privatePath)) return privatePath;
    }
    if (image.url) {
      const legacyPath = this.resolveLocalPath(image.url);
      if (legacyPath && existsSync(legacyPath)) return legacyPath;
    }
    return null;
  }

  /** 解析相对根目录的路径，严格防止 ../ 路径穿越 */
  resolveWithin(root: string, requestedPath: string): string | null {
    // 规范化反斜杠（Windows），防止 \.. 绕过
    const normalized = requestedPath.replace(/\\/g, '/');
    const target = resolve(root, normalized);
    const relativePath = relative(root, target);
    if (
      relativePath.startsWith('..') ||
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      relativePath.startsWith('../')
    ) {
      return null;
    }
    return target;
  }
}
