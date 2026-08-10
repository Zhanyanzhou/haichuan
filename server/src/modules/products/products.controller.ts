import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, BadRequestException, NotFoundException, ConflictException, MessageEvent, Sse } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { UploadService } from '../upload/upload.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateProductDto, UpdateProductDto } from './dto';
import { join } from 'path';
import { statSync } from 'fs';
import { Observable } from 'rxjs';
const sharp = require('sharp');

@ApiTags('产品管理')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
@Controller('products')
export class ProductsController {
  constructor(
    private productsService: ProductsService,
    private uploadService: UploadService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取产品列表', description: '支持分类/材质/状态/关键词筛选和分页' })
  @ApiQuery({ name: 'page', required: false, description: '页码' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页数量' })
  @ApiQuery({ name: 'categoryId', required: false, description: '分类ID' })
  @ApiQuery({ name: 'keyword', required: false, description: '搜索关键词' })
  findAll(@Query() query: Record<string, unknown>) {
    return this.productsService.findAll(query);
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: '获取前台可展示商品' })
  findPublic(@Query() query: Record<string, unknown>) {
    return this.productsService.findPublic(query);
  }

  @Public()
  @Sse('public/stream')
  publicChangeStream(): Observable<MessageEvent> {
    return this.productsService.publicChangeStream();
  }

  @Public()
  @Get('public/:id')
  @ApiOperation({ summary: '获取前台可展示商品详情' })
  async findPublicById(@Param('id') id: string) {
    const product = await this.productsService.findPublicById(+id);
    if (!product) throw new NotFoundException('商品当前不可浏览');
    return product;
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取产品详情' })
  findById(@Param('id') id: string) {
    return this.productsService.findById(+id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: '新增产品' })
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id')
  @ApiOperation({ summary: '编辑产品' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(+id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id/status')
  @ApiOperation({ summary: '更新产品状态' })
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    const validStatuses = ['DRAFT', 'PUBLISHED', 'OFFLINE', 'ARCHIVED'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException('商品状态不正确，请重新选择');
    }
    const data: any = { status };
    if (status === 'PUBLISHED') data.publishedAt = new Date();
    return this.productsService.update(+id, data);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/completeness')
  @ApiOperation({ summary: '检查产品完整性' })
  checkCompleteness(@Param('id') id: string) {
    return this.productsService.checkCompleteness(+id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: '下架产品（软删除）' })
  delete(@Param('id') id: string) {
    return this.productsService.delete(+id);
  }

  /* ═══ 产品图片管理 ═══ */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/images')
  @ApiOperation({ summary: '添加产品图片' })
  addImage(@Param('id') id: string, @Body() body: any) {
    return this.productsService.addImage(+id, body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id/images/:imageId')
  @ApiOperation({ summary: '更新图片信息（类型/排序）' })
  updateImage(@Param('imageId') imageId: string, @Body() body: any) {
    return this.productsService.updateImage(+imageId, body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id/images/:imageId')
  @ApiOperation({ summary: '删除产品图片' })
  deleteImage(@Param('imageId') imageId: string) {
    return this.productsService.deleteImage(+imageId);
  }

  /* ═══ 主图/列表图管理 ═══ */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id/images/primary')
  @ApiOperation({ summary: '设置详情主图' })
  setPrimaryImage(@Param('id') id: string, @Body() body: { imageId: number }) {
    return this.productsService.setPrimaryImage(+id, body.imageId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id/images/listing')
  @ApiOperation({ summary: '直接设置列表图（不裁切）' })
  setListingImage(@Param('id') id: string, @Body() body: { imageId: number }) {
    return this.productsService.setListingImage(+id, body.imageId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id/images/listing/reset')
  @ApiOperation({ summary: '恢复列表图为详情主图' })
  resetListingToPrimary(@Param('id') id: string) {
    return this.productsService.resetListingToPrimary(+id);
  }

  /* ═══ 列表图裁切 ═══ */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/images/:sourceImageId/crop-listing')
  @ApiOperation({ summary: '裁切生成1200×1200 WebP列表图' })
  async cropListingImage(
    @Param('id') id: string,
    @Param('sourceImageId') sourceImageId: string,
    @Body() body: { x: number; y: number; width: number; height: number },
  ) {
    const product = await this.productsService.findById(+id);
    if (!product) throw new NotFoundException('商品不存在');

    const sourceImg = product.images?.find((img: any) => img.id === +sourceImageId);
    if (!sourceImg) throw new NotFoundException('源图片不属于该商品');

    // 裁切：归一化坐标 → 实际像素 → sharp 处理
    const sourcePath = sourceImg.url.replace(/^\/uploads\//, '');
    const fullPath = join(this.uploadService['uploadDir'], sourcePath);
    
    // 读取原图尺寸
    const metadata = await sharp(fullPath).metadata();
    const imgW = metadata.width || 1;
    const imgH = metadata.height || 1;

    // 归一化矩形转实际像素（正方形裁切）
    const cropPx = {
      left: Math.round(body.x * imgW),
      top: Math.round(body.y * imgH),
      width: Math.round(body.width * imgW),
      height: Math.round(body.height * imgH),
    };

    // 验证裁切范围
    if (cropPx.left < 0 || cropPx.top < 0 ||
        cropPx.left + cropPx.width > imgW || cropPx.top + cropPx.height > imgH) {
      throw new BadRequestException('裁切区域超出图片范围');
    }

    // 生成 1200×1200 WebP
    const result = await this.uploadService.cropImage(
      sourcePath, cropPx, 1200, 'webp',
    );

    // 创建派生图记录
    const fileStat = statSync(join(this.uploadService['uploadDir'], result.url.replace(/^\/uploads\//, '')));
    
    const derived = await this.productsService.addImage(+id, {
      url: result.url,
      type: 'FRONT' as any,
      sortOrder: 0,
      sourceImageId: +sourceImageId,
      cropData: { x: body.x, y: body.y, width: body.width, height: body.height },
      width: 1200,
      height: 1200,
      mimeType: 'image/webp',
      fileSize: fileStat.size,
    });

    // 切换 listingImageId
    await this.productsService.setListingImage(+id, derived.id);

    return { id: derived.id, url: result.url, listingImageId: derived.id };
  }
}
