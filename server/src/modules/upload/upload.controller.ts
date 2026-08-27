import {
  Controller, Post, Get, UseInterceptors, UploadedFiles, UploadedFile,
  UseGuards, Body, BadRequestException, Param, Req, Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { diskStorage, memoryStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import dayjs from 'dayjs';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import type { CustomerRequest } from '../../common/security/authenticated-principal';

const videoStorage = diskStorage({
  destination: (_req, _file, callback) => {
    const destination = join(process.cwd(), 'uploads', dayjs().format('YYYY/MM/DD'));
    if (!existsSync(destination)) mkdirSync(destination, { recursive: true });
    callback(null, destination);
  },
  filename: (_req, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
});

const imageMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const imageUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) => {
    if (!imageMimeTypes.includes(file.mimetype)) {
      return callback(new BadRequestException('仅支持 JPEG、PNG、WebP 或 GIF 图片'), false);
    }
    callback(null, true);
  },
};

@ApiTags('文件上传')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: '上传单张图片' })
  @UseGuards(JwtAuthGuard)
  @Post('image')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.uploadFile(file);
  }

  @Public()
  @UseGuards(CustomerAuthGuard, CustomerCommerceGuard)
  // 公开上传接口收紧行为限流(全局 60/min 偏宽),降低并发 10MB 内存存储的 DoS 风险
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('payment-proof')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  async uploadPaymentProof(@Req() request: CustomerRequest, @UploadedFile() file: Express.Multer.File) {
    return this.uploadService.uploadPrivatePaymentProof(request.customer.id, file);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('payment-proofs/:orderId')
  async getPaymentProof(
    @Req() request: CustomerRequest,
    @Param('orderId') orderId: string,
    @Res() response: Response,
  ) {
    const proof = await this.uploadService.getPaymentProofForCustomer(request.customer.id, +orderId);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.type(proof.mimeType).send(proof.buffer);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '上传首页视频（MP4 或 WebM，最大 100MB）' })
  @UseGuards(JwtAuthGuard)
  @Post('video')
  @UseInterceptors(FileInterceptor('file', {
    storage: videoStorage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      // 扩展名白名单:防止把 .html/.svg 等改名后仅靠声明 mimetype 绕过,
      // 进而被静态服务按扩展名当 HTML 渲染,造成存储型 XSS
      const ext = extname(file.originalname).toLowerCase();
      if (!['.mp4', '.webm'].includes(ext)) {
        return callback(new BadRequestException('仅支持 MP4 或 WebM 视频文件'), false);
      }
      if (!['video/mp4', 'video/webm'].includes(file.mimetype)) {
        return callback(new BadRequestException('仅支持 MP4 或 WebM 视频'), false);
      }
      callback(null, true);
    },
  }))
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.registerStoredVideo(file);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '批量上传图片（最多20张）' })
  @UseGuards(JwtAuthGuard)
  @Post('images')
  @UseInterceptors(FilesInterceptor('files', 20, imageUploadOptions))
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    return this.uploadService.uploadMultiple(files);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '上传商品图片到受控私有存储（支持分类标记）' })
  @UseGuards(JwtAuthGuard)
  @Post('product-images')
  @UseInterceptors(FilesInterceptor('files', 20, imageUploadOptions))
  async uploadProductImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('types') types: string,
  ) {
    // 受控产品库：商品图片写入私有目录，返回 storageKey 供 ProductImage 持久化（不返回公开 url）
    const typeArray = types ? types.split(',') : [];
    return this.uploadService.uploadPrivateProductImages(files, typeArray);
  }
}
