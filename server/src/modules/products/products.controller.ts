import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CreateProductDto, UpdateProductDto } from './dto';

@ApiTags('产品管理')
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '获取产品列表', description: '支持分类/材质/状态/关键词筛选和分页' })
  @ApiQuery({ name: 'page', required: false, description: '页码' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页数量' })
  @ApiQuery({ name: 'categoryId', required: false, description: '分类ID' })
  @ApiQuery({ name: 'keyword', required: false, description: '搜索关键词' })
  findAll(@Query() query: Record<string, unknown>) {
    return this.productsService.findAll(query);
  }

  @Public()
  @Get(':id')
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id/images/:imageId/cover')
  @ApiOperation({ summary: '设为封面图' })
  setCoverImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.productsService.setCoverImage(+id, +imageId);
  }
}
