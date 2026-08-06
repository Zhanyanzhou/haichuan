import { Controller, Get, Put, Post, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PageModulesService } from './page-modules.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('页面模块')
@Controller('page-modules')
export class PageModulesController {
  constructor(private service: PageModulesService) {}

  @Public()
  @Get('published')
  @ApiOperation({ summary: '获取已发布模块（前台）' })
  getPublished(@Query('pageKey') pageKey: string) {
    return this.service.getPublished(pageKey || 'home');
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('admin')
  @ApiOperation({ summary: '获取全部模块（后台，含草稿）' })
  getAdminAll(@Query('pageKey') pageKey: string) {
    return this.service.getAdminAll(pageKey || 'home');
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put('draft')
  @ApiOperation({ summary: '保存模块草稿' })
  saveDraft(@Body() body: any) {
    return this.service.saveDraft(body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put('reorder')
  @ApiOperation({ summary: '更新模块排序' })
  reorder(@Body() body: { items: { id: number; sortOrder: number }[] }) {
    return this.service.reorder(body.items);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id/toggle')
  @ApiOperation({ summary: '切换可见性' })
  toggleVisibility(@Param('id') id: string, @Body('isVisible') isVisible: boolean) {
    return this.service.toggleVisibility(+id, isVisible);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/duplicate')
  @ApiOperation({ summary: '复制模块' })
  duplicate(@Param('id') id: string) {
    return this.service.duplicate(+id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: '删除模块' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put('publish')
  @ApiOperation({ summary: '发布全部草稿（含版本快照）' })
  publish(@Body('pageKey') pageKey: string, @Body('userId') userId?: number) {
    return this.service.publish(pageKey || 'home', userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('types')
  @ApiOperation({ summary: '获取可用模块类型列表' })
  getModuleTypes() {
    return this.service.getAvailableModules();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/versions')
  @ApiOperation({ summary: '获取模块版本历史' })
  getVersions(@Param('id') id: string) {
    return this.service.getVersions(+id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id/restore')
  @ApiOperation({ summary: '恢复模块到指定版本' })
  restoreVersion(@Param('id') id: string, @Body('version') version: number) {
    return this.service.restoreVersion(+id, +version);
  }
}
