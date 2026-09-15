import {
  Controller, Post, Put, Get, Delete, Query, UseInterceptors, UploadedFiles, UploadedFile,
  UseGuards, Body, BadRequestException, Param, ParseIntPipe, Req, Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { UploadService } from './upload.service';
import { PageMediaQueryDto } from './dto/page-media-query.dto';
import {
  ExpectedMediaAuthorizationRevisionDto,
  MediaAuthorizationImpactPreviewDto,
  RejectMediaAuthorizationDto,
  RenewMediaAuthorizationDto,
  RevokeMediaAuthorizationDto,
  ReviewMediaAuthorizationDto,
  SaveMediaAuthorizationDraftDto,
} from './dto/media-authorization.dto';
import { MediaAuthorizationService } from './media-authorization.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import type { CustomerRequest, StaffRequest } from '../../common/security/authenticated-principal';

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
  constructor(
    private readonly uploadService: UploadService,
    private readonly mediaAuthorizationService: MediaAuthorizationService,
  ) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: '上传单张图片' })
  @UseGuards(JwtAuthGuard)
  @Post('image')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  async uploadImage(@Req() request: StaffRequest, @UploadedFile() file: Express.Multer.File) {
    return this.uploadService.uploadFile(file, request.user.id);
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
    storage: memoryStorage(),
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
  async uploadVideo(@Req() request: StaffRequest, @UploadedFile() file: Express.Multer.File) {
    return this.uploadService.registerStoredVideo(file, request.user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '批量上传图片（最多20张）' })
  @UseGuards(JwtAuthGuard)
  @Post('images')
  @UseInterceptors(FilesInterceptor('files', 20, imageUploadOptions))
  async uploadImages(@Req() request: StaffRequest, @UploadedFiles() files: Express.Multer.File[]) {
    return this.uploadService.uploadMultiple(files, request.user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '列出已登记的页面素材' })
  @Get('media')
  async listPageMedia(@Query() query: PageMediaQueryDto) {
    return this.uploadService.listPageMedia({
      page: query.page,
      pageSize: query.pageSize,
      type: query.type,
      includeArchived: query.includeArchived === 'true',
      status: query.status,
      keyword: query.keyword?.trim() || undefined,
    });
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '预览素材授权对公开使用的影响（页面清单由页面域另行补全）' })
  @Post('media/authorization/impact-preview')
  async previewMediaAuthorizationImpact(@Body() dto: MediaAuthorizationImpactPreviewDto) {
    return this.mediaAuthorizationService.impactPreview(dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '按正式存储键在后台预览页面素材' })
  @Get('media/preview-by-storage-key')
  async previewPageMediaByStorageKey(
    @Query('storageKey') storageKey: string,
    @Res() response: Response,
  ) {
    if (typeof storageKey !== 'string' || !storageKey.trim() || storageKey.length > 512) {
      throw new BadRequestException('素材存储键无效');
    }
    const media = await this.uploadService.getPageMediaContentByStorageKey(storageKey, false);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.type(media.mimeType).send(media.buffer);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '读取素材授权详情及内部证明链' })
  @Get('media/:id/authorization')
  async getMediaAuthorization(@Param('id', ParseIntPipe) id: number) {
    return this.mediaAuthorizationService.getDetail(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '保存素材授权草稿' })
  @Put('media/:id/authorization/draft')
  async saveMediaAuthorizationDraft(
    @Req() request: StaffRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveMediaAuthorizationDraftDto,
  ) {
    return this.mediaAuthorizationService.saveDraft(id, request.user.id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '提交素材授权审核' })
  @Post('media/:id/authorization/submit')
  async submitMediaAuthorization(
    @Req() request: StaffRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExpectedMediaAuthorizationRevisionDto,
  ) {
    return this.mediaAuthorizationService.submit(id, request.user.id, dto.expectedRevision);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '批准素材公开授权' })
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('media/:id/authorization/approve')
  async approveMediaAuthorization(
    @Req() request: StaffRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewMediaAuthorizationDto,
  ) {
    return this.mediaAuthorizationService.approve(id, request.user.id, dto.expectedRevision, dto.reviewNote);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '拒绝素材公开授权' })
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('media/:id/authorization/reject')
  async rejectMediaAuthorization(
    @Req() request: StaffRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectMediaAuthorizationDto,
  ) {
    return this.mediaAuthorizationService.reject(id, request.user.id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '撤销素材公开授权' })
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('media/:id/authorization/revoke')
  async revokeMediaAuthorization(
    @Req() request: StaffRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevokeMediaAuthorizationDto,
  ) {
    return this.mediaAuthorizationService.revoke(id, request.user.id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '续期素材公开授权' })
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('media/:id/authorization/renew')
  async renewMediaAuthorization(
    @Req() request: StaffRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenewMediaAuthorizationDto,
  ) {
    return this.mediaAuthorizationService.renew(id, request.user.id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '后台读取素材预览（不代表公开资格）' })
  @Get('media/:id/preview')
  async previewPageMedia(@Param('id', ParseIntPipe) id: number, @Res() response: Response) {
    const media = await this.uploadService.getPageMediaContent(id, false);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.type(media.mimeType).send(media.buffer);
  }

  @Public()
  @ApiOperation({ summary: '按当前集中授权资格读取公开素材' })
  @Get('public-media/:id')
  async getPublicPageMedia(@Param('id', ParseIntPipe) id: number, @Res() response: Response) {
    const media = await this.uploadService.getPageMediaContent(id, true);
    response.setHeader('Cache-Control', 'public, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.type(media.mimeType).send(media.buffer);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '归档页面素材并立即停止公开访问' })
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete('media/:id')
  async archivePageMedia(@Param('id', ParseIntPipe) id: number) {
    return this.uploadService.archivePageMedia(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '恢复已归档的页面素材' })
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('media/:id/restore')
  async restorePageMedia(@Param('id', ParseIntPipe) id: number) {
    return this.uploadService.restorePageMedia(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '上传商品图片到受控私有存储（支持分类标记）' })
  @UseGuards(JwtAuthGuard)
  @Post('product-images')
  @UseInterceptors(FilesInterceptor('files', 20, imageUploadOptions))
  async uploadProductImages(
    @Req() request: StaffRequest,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('types') types: string,
  ) {
    // 受控产品库：商品图片写入私有目录，返回 storageKey 供 ProductImage 持久化（不返回公开 url）
    const typeArray = types ? types.split(',') : [];
    return this.uploadService.uploadPrivateProductImages(files, typeArray, request.user.id);
  }
}
