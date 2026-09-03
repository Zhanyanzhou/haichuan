import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { join, relative, resolve, sep, extname } from 'path';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { readFile, stat, unlink, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import { PrismaService } from '../../common/prisma/prisma.service';
const sharp = require('sharp');

@Injectable()
export class UploadService {
  private readonly uploadDir = join(process.cwd(), 'uploads');
  private readonly paymentProofRoot = resolve(process.cwd(), 'private-media', 'payment-proofs');
  private readonly allowedTypes = new Map([
    ['image/jpeg', { format: 'jpeg', extension: '.jpg' }],
    ['image/png', { format: 'png', extension: '.png' }],
    ['image/webp', { format: 'webp', extension: '.webp' }],
    ['image/gif', { format: 'gif', extension: '.gif' }],
  ]);
  private readonly maxSize = 10 * 1024 * 1024; // 10MB

  constructor(private readonly prisma: PrismaService) {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
    // Create subdirectories by date
    const dateDir = this.getDateDir();
    if (!existsSync(dateDir)) {
      mkdirSync(dateDir, { recursive: true });
    }
  }

  private getDateDir(): string {
    return join(this.uploadDir, dayjs().format('YYYY/MM/DD'));
  }

  async uploadFile(file: Express.Multer.File): Promise<{ url: string; filename: string; size: number; width?: number; height?: number; format?: string }> {
    if (!file) throw new BadRequestException('未选择文件');

    const expectedType = this.allowedTypes.get(file.mimetype);
    if (!expectedType) {
      throw new BadRequestException(`不支持的文件类型: ${file.mimetype}`);
    }

    if (file.size > this.maxSize) {
      throw new BadRequestException(`文件大小不能超过 10MB`);
    }

    const dateDir = this.getDateDir();
    if (!existsSync(dateDir)) {
      mkdirSync(dateDir, { recursive: true });
    }

    let metadata: { format?: string; width?: number; height?: number };
    try {
      metadata = await sharp(file.buffer).metadata();
    } catch {
      throw new BadRequestException('文件内容不是有效图片');
    }
    if (metadata.format !== expectedType.format) {
      throw new BadRequestException('文件内容与声明的图片类型不一致');
    }

    const filename = `${randomUUID()}${expectedType.extension}`;
    const filepath = join(dateDir, filename);
    await writeFile(filepath, file.buffer);

    const relativePath = join(dayjs().format('YYYY/MM/DD'), filename).replace(/\\/g, '/');
    const url = `/uploads/${relativePath}`;

    return {
      url,
      filename,
      size: file.size,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  }

  async uploadMultiple(files: Express.Multer.File[]): Promise<{ url: string; filename: string; size: number }[]> {
    if (!files || files.length === 0) throw new BadRequestException('未选择文件');
    const results: { url: string; filename: string; size: number }[] = [];
    for (const file of files) {
      const result = await this.uploadFile(file);
      results.push(result);
    }
    return results;
  }

  /**
   * 付款凭证属于交易敏感资料：新文件只能保存到服务端私有目录，
   * 上传完成后仅返回存储键，禁止生成 /uploads 公共 URL。
   */
  async uploadPrivatePaymentProof(customerId: number, file: Express.Multer.File): Promise<{
    storageKey: string;
    width?: number;
    height?: number;
    mimeType: string;
    fileSize: number;
  }> {
    if (!file) throw new BadRequestException('未选择文件');
    const expectedType = this.allowedTypes.get(file.mimetype);
    if (!expectedType) throw new BadRequestException(`不支持的文件类型: ${file.mimetype}`);
    if (file.size > this.maxSize) throw new BadRequestException('文件大小不能超过 10MB');

    let metadata: { format?: string; width?: number; height?: number };
    try {
      metadata = await sharp(file.buffer).metadata();
    } catch {
      throw new BadRequestException('文件内容不是有效图片');
    }
    if (metadata.format !== expectedType.format) {
      throw new BadRequestException('文件内容与声明的图片类型不一致');
    }

    const dateSeg = dayjs().format('YYYY/MM/DD');
    const dir = join(this.paymentProofRoot, String(customerId), dateSeg);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const filename = `${randomUUID()}${expectedType.extension}`;
    await writeFile(join(dir, filename), file.buffer);
    return {
      storageKey: join(String(customerId), dateSeg, filename).replace(/\\/g, '/'),
      width: metadata.width,
      height: metadata.height,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  }

  async getPaymentProofForStaff(paymentId: number) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { proofUrl: true },
    });
    if (!payment?.proofUrl) throw new NotFoundException('付款凭证不存在');
    return this.readPaymentProof(payment.proofUrl);
  }

  async getPaymentProofForCustomer(customerId: number, orderId: number) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId,
        order: { customerId },
        proofUrl: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { proofUrl: true },
    });
    if (!payment?.proofUrl) throw new NotFoundException('付款凭证不存在');
    return this.readPaymentProof(payment.proofUrl);
  }

  /** 仅被已完成权限校验的接口调用；凭证只存于私有目录 private-media/payment-proofs。 */
  private async readPaymentProof(proofReference: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const filePath = this.resolveWithinRoot(this.paymentProofRoot, proofReference);
    if (!filePath || !existsSync(filePath)) throw new NotFoundException('付款凭证不存在');

    const extension = extname(filePath).toLowerCase();
    const mimeType = new Map([
      ['.jpg', 'image/jpeg'],
      ['.jpeg', 'image/jpeg'],
      ['.png', 'image/png'],
      ['.webp', 'image/webp'],
      ['.gif', 'image/gif'],
    ]).get(extension);
    if (!mimeType) throw new NotFoundException('付款凭证不存在');

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new NotFoundException('付款凭证不存在');
      return { buffer: await readFile(filePath), mimeType };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException('付款凭证不存在');
    }
  }

  async registerStoredVideo(file: Express.Multer.File): Promise<{ url: string; filename: string; size: number }> {
    if (!file) throw new BadRequestException('未选择视频文件');
    if (!['video/mp4', 'video/webm'].includes(file.mimetype)) {
      throw new BadRequestException('仅支持 MP4 或 WebM 视频');
    }
    if (file.size > 100 * 1024 * 1024) {
      throw new BadRequestException('视频大小不能超过 100MB');
    }
    const relativePath = file.path.slice(this.uploadDir.length).replace(/^[\\/]+/, '').replace(/\\/g, '/');
    if (!relativePath || relativePath.startsWith('..')) {
      throw new BadRequestException('视频存储路径无效');
    }
    // 内容魔数校验（与图片的 sharp 校验对齐）：MP4 头部 offset 4-7 为 "ftyp"，
    // WebM/EBML 前 4 字节为 0x1A45DFA3。伪装视频的任意字节不再进入公开存储。
    const header = await this.readLeadingBytes(file.path, 12);
    const isMp4 =
      header.length >= 8 &&
      header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70;
    const isWebm =
      header.length >= 4 &&
      header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
    if (!isMp4 && !isWebm) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException('文件内容不是有效的 MP4 或 WebM 视频');
    }
    return { url: `/uploads/${relativePath}`, filename: file.filename, size: file.size };
  }

  private readLeadingBytes(path: string, count: number): Promise<Buffer> {
    return new Promise((resolvePromise) => {
      const stream = createReadStream(path, { start: 0, end: count - 1 });
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
      stream.on('error', () => resolvePromise(Buffer.alloc(0)));
      stream.on('end', () => resolvePromise(Buffer.concat(chunks)));
    });
  }

  async uploadProductImages(
    files: Express.Multer.File[],
    imageTypes: string[],
  ): Promise<{ url: string; type: string }[]> {
    if (!files || files.length === 0) throw new BadRequestException('未选择图片');
    const results: { url: string; type: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const result = await this.uploadFile(files[i]);
      results.push({ url: result.url, type: imageTypes[i] || 'FRONT' });
    }
    return results;
  }

  /**
   * 上传产品图片到受控私有目录（server/private-media/products），不写入公开 uploads。
   * 受控产品库要求：新上传产品图片直接进入私有存储，仅通过鉴权媒体端点访问。
   * 返回 storageKey（相对私有根的安全键）与图片元数据，供 ProductImage 持久化。
   */
  async uploadPrivateImage(file: Express.Multer.File): Promise<{
    storageKey: string;
    width?: number;
    height?: number;
    mimeType: string;
    fileSize: number;
  }> {
    if (!file) throw new BadRequestException('未选择文件');
    const expectedType = this.allowedTypes.get(file.mimetype);
    if (!expectedType) throw new BadRequestException(`不支持的文件类型: ${file.mimetype}`);
    if (file.size > this.maxSize) throw new BadRequestException('文件大小不能超过 10MB');

    let metadata: { format?: string; width?: number; height?: number };
    try {
      metadata = await sharp(file.buffer).metadata();
    } catch {
      throw new BadRequestException('文件内容不是有效图片');
    }
    if (metadata.format !== expectedType.format) {
      throw new BadRequestException('文件内容与声明的图片类型不一致');
    }

    const privateRoot = resolve(
      process.env.PRODUCT_MEDIA_ROOT || join(process.cwd(), 'private-media', 'products'),
    );
    const dateSeg = dayjs().format('YYYY/MM/DD');
    const dir = join(privateRoot, dateSeg);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const filename = `${randomUUID()}${expectedType.extension}`;
    await writeFile(join(dir, filename), file.buffer);

    // storageKey 仅保存相对私有根的安全键，禁止包含绝对路径或 ../
    const storageKey = join(dateSeg, filename).replace(/\\/g, '/');
    return {
      storageKey,
      width: metadata.width,
      height: metadata.height,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  }

  /** 批量上传产品图片到受控私有目录 */
  async uploadPrivateProductImages(
    files: Express.Multer.File[],
    imageTypes: string[],
  ): Promise<
    {
      storageKey: string;
      type: string;
      width?: number;
      height?: number;
      mimeType: string;
      fileSize: number;
    }[]
  > {
    if (!files || files.length === 0) throw new BadRequestException('未选择图片');
    const results: Array<{
      storageKey: string;
      type: string;
      width?: number;
      height?: number;
      mimeType: string;
      fileSize: number;
    }> = [];
    for (let i = 0; i < files.length; i++) {
      const result = await this.uploadPrivateImage(files[i]);
      results.push({ ...result, type: imageTypes[i] || 'FRONT' });
    }
    return results;
  }

  /**
   * 裁切并保存图片（用于生成 LISTING 图）
   * @param sourcePath 原始文件路径（相对于 uploads 目录）
   * @param crop 裁切区域（像素坐标）
   * @param outputSize 输出正方形边长（默认 1200px）
   * @param format 输出格式（默认 webp）
   */
  async cropImage(
    sourcePath: string,
    crop: { left: number; top: number; width: number; height: number },
    outputSize: number = 1200,
    format: 'webp' | 'jpeg' = 'webp',
  ): Promise<{ url: string }> {
    const uploadRoot = resolve(this.uploadDir);
    const fullSourcePath = resolve(uploadRoot, sourcePath);
    if (fullSourcePath !== uploadRoot && !fullSourcePath.startsWith(`${uploadRoot}${sep}`)) {
      throw new BadRequestException('图片路径无效');
    }
    if (!existsSync(fullSourcePath)) {
      throw new BadRequestException('原始图片不存在');
    }

    // 派生图存入 products/derived/ 子目录
    const derivedDir = join(this.uploadDir, 'products', 'derived');
    if (!existsSync(derivedDir)) {
      mkdirSync(derivedDir, { recursive: true });
    }

    const filename = `${randomUUID()}.${format === 'webp' ? 'webp' : 'jpg'}`;
    const outputPath = join(derivedDir, filename);

    try {
      const pipeline = sharp(fullSourcePath)
        .extract({ left: Math.round(crop.left), top: Math.round(crop.top), width: Math.round(crop.width), height: Math.round(crop.height) })
        .resize(outputSize, outputSize, { fit: 'cover' });

      if (format === 'webp') {
        await pipeline.webp({ quality: 85 }).toFile(outputPath);
      } else {
        await pipeline.jpeg({ quality: 90 }).toFile(outputPath);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      throw new BadRequestException(`图片裁切失败: ${message}`);
    }

    const relativePath = join('products', 'derived', filename).replace(/\\/g, '/');
    return { url: `/uploads/${relativePath}` };
  }

  /**
   * 裁切私有存储的产品图片（生成 LISTING 图等派生图）。
   * 源图与派生图都写入受控私有目录，不进入公开 uploads。
   * @param storageKey 源图相对私有根的安全键
   */
  async cropPrivateImage(
    storageKey: string,
    crop: { left: number; top: number; width: number; height: number },
    outputSize = 1200,
    format: 'webp' | 'jpeg' = 'webp',
  ): Promise<{
    storageKey: string;
    width: number;
    height: number;
    mimeType: string;
    fileSize: number;
  }> {
    const privateRoot = resolve(
      process.env.PRODUCT_MEDIA_ROOT || join(process.cwd(), 'private-media', 'products'),
    );
    const fullSource = this.resolveWithinRoot(privateRoot, storageKey);
    if (!fullSource || !existsSync(fullSource)) {
      throw new BadRequestException('原始图片不存在');
    }

    const dateSeg = dayjs().format('YYYY/MM/DD');
    const derivedDir = join(privateRoot, 'derived', dateSeg);
    if (!existsSync(derivedDir)) mkdirSync(derivedDir, { recursive: true });
    const filename = `${randomUUID()}.${format === 'webp' ? 'webp' : 'jpg'}`;
    const outputPath = join(derivedDir, filename);

    try {
      const pipeline = sharp(fullSource)
        .extract({
          left: Math.round(crop.left),
          top: Math.round(crop.top),
          width: Math.round(crop.width),
          height: Math.round(crop.height),
        })
        .resize(outputSize, outputSize, { fit: 'cover' });
      if (format === 'webp') {
        await pipeline.webp({ quality: 85 }).toFile(outputPath);
      } else {
        await pipeline.jpeg({ quality: 90 }).toFile(outputPath);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      throw new BadRequestException(`图片裁切失败: ${message}`);
    }

    const outStat = await stat(outputPath);
    const outKey = join('derived', dateSeg, filename).replace(/\\/g, '/');
    return {
      storageKey: outKey,
      width: outputSize,
      height: outputSize,
      mimeType: format === 'webp' ? 'image/webp' : 'image/jpeg',
      fileSize: outStat.size,
    };
  }

  /** 解析相对根目录的路径，严格防止 ../ 路径穿越 */
  private resolveWithinRoot(root: string, requestedPath: string): string | null {
    const normalized = requestedPath.replace(/\\/g, '/');
    const target = resolve(root, normalized);
    const rel = relative(root, target);
    if (rel.startsWith('..') || rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('../')) {
      return null;
    }
    return target;
  }
}
