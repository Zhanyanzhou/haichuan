import {
  Controller, Post, UseInterceptors, UploadedFiles, UploadedFile,
  UseGuards, Body, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import * as dayjs from 'dayjs';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const videoStorage = diskStorage({
  destination: (_req, _file, callback) => {
    const destination = join(process.cwd(), 'uploads', dayjs().format('YYYY/MM/DD'));
    if (!existsSync(destination)) mkdirSync(destination, { recursive: true });
    callback(null, destination);
  },
  filename: (_req, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
});

@ApiTags('文件上传')
@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: '上传单张图片' })
  @UseGuards(JwtAuthGuard)
  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.uploadFile(file);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '上传首页视频（MP4 或 WebM，最大 100MB）' })
  @UseGuards(JwtAuthGuard)
  @Post('video')
  @UseInterceptors(FileInterceptor('file', {
    storage: videoStorage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
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
  @UseInterceptors(FilesInterceptor('files', 20))
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    return this.uploadService.uploadMultiple(files);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '上传商品图片（支持分类标记）' })
  @UseGuards(JwtAuthGuard)
  @Post('product-images')
  @UseInterceptors(FilesInterceptor('files', 20))
  async uploadProductImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('types') types: string,
  ) {
    const typeArray = types ? types.split(',') : [];
    return this.uploadService.uploadProductImages(files, typeArray);
  }
}
