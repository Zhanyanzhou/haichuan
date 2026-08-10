import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('分类管理')
@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '获取分类列表' })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Public()
  @Get('tree')
  @ApiOperation({ summary: '获取四级分类树' })
  findTree() {
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
  @Post()
  @ApiOperation({ summary: '新增分类' })
  create(@Body() body: any) {
    return this.categoriesService.create(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
  @Put(':id')
  @ApiOperation({ summary: '编辑分类' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.categoriesService.update(+id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
  @Delete(':id')
  @ApiOperation({ summary: '删除分类' })
  delete(@Param('id') id: string) {
    return this.categoriesService.delete(+id);
  }
}
