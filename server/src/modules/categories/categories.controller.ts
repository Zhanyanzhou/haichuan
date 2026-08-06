import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: '新增分类' })
  create(@Body() body: any) {
    return this.categoriesService.create(body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id')
  @ApiOperation({ summary: '编辑分类' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.categoriesService.update(+id, body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: '删除分类' })
  delete(@Param('id') id: string) {
    return this.categoriesService.delete(+id);
  }
}
