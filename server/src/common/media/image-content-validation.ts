import { BadRequestException } from '@nestjs/common';

const sharp = require('sharp');

export const MAX_IMAGE_INPUT_PIXELS = 25_000_000;
export const MAX_IMAGE_DIMENSION = 12_000;
export const MAX_ANIMATED_IMAGE_PAGES = 100;

export type ValidatedImageMetadata = {
  format?: string;
  width?: number;
  height?: number;
  pages?: number;
};

/** 统一验证图片头、尺寸、动画总像素，并完整解码像素流以拒绝截断内容。 */
export async function validateImageContent(
  buffer: Buffer,
  expectedFormat: string,
): Promise<ValidatedImageMetadata> {
  try {
    const image = sharp(buffer, {
      failOn: 'error',
      animated: true,
      limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
    });
    const metadata = await image.metadata();
    if (metadata.format !== expectedFormat) {
      throw new BadRequestException('文件内容与声明的图片类型不一致');
    }
    if (
      !metadata.width
      || !metadata.height
      || metadata.width > MAX_IMAGE_DIMENSION
      || metadata.height > MAX_IMAGE_DIMENSION
    ) {
      throw new BadRequestException('图片尺寸无效或超出限制');
    }
    const pages = metadata.pages || 1;
    if (
      pages > MAX_ANIMATED_IMAGE_PAGES
      || metadata.width * metadata.height * pages > MAX_IMAGE_INPUT_PIXELS
    ) {
      throw new BadRequestException('动画图片帧数或总像素超出限制');
    }
    await image.clone().raw().toBuffer();
    return metadata;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('文件内容不是有效图片');
  }
}
