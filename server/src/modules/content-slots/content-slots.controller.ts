import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ContentSlotsService } from './content-slots.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('内容插槽')
@Controller('content-slots')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
export class ContentSlotsController {
  constructor(private service: ContentSlotsService) {}

  @Public()
  @Get('published')
  @ApiOperation({ summary: '获取已发布插槽（前台）' })
  getPublished(@Query('pageKey') pageKey: string) {
    return this.service.getPublished(pageKey || 'home');
  }

  @ApiBearerAuth()
  @Get('admin')
  @ApiOperation({ summary: '获取全部插槽（后台，含草稿）' })
  getAdminAll(@Query('pageKey') pageKey: string) {
    return this.service.getAdminAll(pageKey || 'home');
  }
}
