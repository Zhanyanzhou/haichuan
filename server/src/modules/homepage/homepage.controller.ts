import { Controller, Get, Put, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HomepageService } from './homepage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('首页配置')
@Controller('homepage')
export class HomepageController {
  constructor(private homepageService: HomepageService) {}

  @Public()
  @Get('config')
  @ApiOperation({ summary: '获取首页配置' })
  getConfig() { return this.homepageService.getConfig(); }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('admin/config')
  @ApiOperation({ summary: '获取完整首页配置（含隐藏区块）' })
  getAdminConfig() { return this.homepageService.getAdminConfig(); }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put('config')
  @ApiOperation({ summary: '更新首页配置' })
  updateConfig(@Body() body: any) { return this.homepageService.updateConfig(body.sections); }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('section')
  @ApiOperation({ summary: '新增首页区块' })
  createSection(@Body() body: any) { return this.homepageService.createSection(body); }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('section/:id')
  @ApiOperation({ summary: '删除首页区块' })
  deleteSection(@Param('id') id: string) { return this.homepageService.deleteSection(+id); }
}
