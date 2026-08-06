import { Injectable, BadRequestException } from '@nestjs/common';
import { extname, join, relative } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import * as dayjs from 'dayjs';
const sharp = require('sharp');

@Injectable()
export class UploadService {
  private readonly uploadDir = join(process.cwd(), 'uploads');
  private readonly allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  private readonly maxSize = 10 * 1024 * 1024; // 10MB

  constructor() {
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

  async uploadFile(file: Express.Multer.File): Promise<{ url: string; filename: string; size: number }> {
    if (!file) throw new BadRequestException('未选择文件');

    if (!this.allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(`不支持的文件类型: ${file.mimetype}`);
    }

    if (file.size > this.maxSize) {
      throw new BadRequestException(`文件大小不能超过 10MB`);
    }

    const dateDir = this.getDateDir();
    if (!existsSync(dateDir)) {
      mkdirSync(dateDir, { recursive: true });
    }

    const filename = `${randomUUID()}${extname(file.originalname)}`;
    const filepath = join(dateDir, filename);
    writeFileSync(filepath, file.buffer);

    const relativePath = join(dayjs().format('YYYY/MM/DD'), filename).replace(/\\/g, '/');
    const url = `/uploads/${relativePath}`;

    return { url, filename, size: file.size };
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

  async registerStoredVideo(file: Express.Multer.File): Promise<{ url: string; filename: string; size: number }> {
    if (!file) throw new BadRequestException('未选择视频文件');
    if (!['video/mp4', 'video/webm'].includes(file.mimetype)) {
      throw new BadRequestException('仅支持 MP4 或 WebM 视频');
    }
    if (file.size > 100 * 1024 * 1024) {
      throw new BadRequestException('视频大小不能超过 100MB');
    }
    const relativePath = relative(this.uploadDir, file.path).replace(/\\/g, '/');
    return { url: `/uploads/${relativePath}`, filename: file.filename, size: file.size };
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
   * 裁切并保存图片（用于生成 LISTING 图）
   * @param sourcePath 原始文件路径（相对于 uploads 目录，如 2026/08/06/xxx.png）
   * @param crop 裁切区域 { left, top, width, height } 基于原图坐标
   * @param outputSize 输出正方形边长（默认 600px）
   */
  async cropImage(
    sourcePath: string,
    crop: { left: number; top: number; width: number; height: number },
    outputSize: number = 600,
  ): Promise<{ url: string }> {
    const fullSourcePath = join(this.uploadDir, sourcePath);
    if (!existsSync(fullSourcePath)) {
      throw new BadRequestException('原始图片不存在');
    }

    const dateDir = this.getDateDir();
    if (!existsSync(dateDir)) {
      mkdirSync(dateDir, { recursive: true });
    }

    const filename = `${randomUUID()}.jpg`;
    const outputPath = join(dateDir, filename);

    try {
      await sharp(fullSourcePath)
        .extract({ left: Math.round(crop.left), top: Math.round(crop.top), width: Math.round(crop.width), height: Math.round(crop.height) })
        .resize(outputSize, outputSize, { fit: 'cover' })
        .jpeg({ quality: 90 })
        .toFile(outputPath);
    } catch (err: any) {
      throw new BadRequestException(`图片裁切失败: ${err.message}`);
    }

    const relativePath = join(dayjs().format('YYYY/MM/DD'), filename).replace(/\\/g, '/');
    return { url: `/uploads/${relativePath}` };
  }
}
