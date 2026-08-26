import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { ResolveCategoryReferencesDto } from './dto/resolve-category-references.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { requirePublishedPublicContentLocale } from '../../common/content-locale';

@ApiTags('分类管理')
@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '获取分类列表' })
  findAll(@Query('locale') locale?: string) {
    requirePublishedPublicContentLocale(locale);
    return this.categoriesService.findAll();
  }

  @Public()
  @Get('tree')
  @ApiOperation({ summary: '获取四级分类树' })
  findTree(@Query('locale') locale?: string) {
    requirePublishedPublicContentLocale(locale);
    return this.categoriesService.findTree();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
  @Get('admin/tree')
  @ApiOperation({ summary: '获取管理端一级/二级分类树' })
  findManageTree() {
    return this.categoriesService.findManageTree();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
  @Post('admin/resolve-references')
  @ApiOperation({ summary: '按稳定 slug 解析店铺装修分类引用' })
  resolveReferences(@Body() dto: ResolveCategoryReferencesDto) {
    return this.categoriesService.resolveReferences(dto.slugs ?? []);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
  @Post()
  @ApiOperation({ summary: '新增分类' })
  create(@Body() body: CreateCategoryDto) {
    return this.categoriesService.create(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
  @Post('reorder')
  @ApiOperation({ summary: '批量调整分类排序' })
  reorder(@Body() dto: ReorderCategoriesDto) {
    return this.categoriesService.reorder(dto.items);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
  @Put(':id')
  @ApiOperation({ summary: '编辑分类' })
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCategoryDto) {
    return this.categoriesService.update(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
  @Delete(':id')
  @ApiOperation({ summary: '删除分类' })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.delete(id);
  }
}
