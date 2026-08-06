import { Controller, Get, Put, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('通知管理')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @ApiOperation({ summary: '获取当前用户通知列表' })
  @Get() findByUser(@CurrentUser() user: any, @Query('isRead') isRead?: string) {
    return this.notificationsService.findByUser(user.id, isRead !== undefined ? isRead === 'true' : undefined);
  }

  @ApiOperation({ summary: '获取未读通知数量' })
  @Get('count') getUnreadCount(@CurrentUser() user: any) { return this.notificationsService.getUnreadCount(user.id); }

  @ApiOperation({ summary: '标记单条通知为已读' })
  @Put(':id/read') markAsRead(@Param('id') id: string) { return this.notificationsService.markAsRead(+id); }

  @ApiOperation({ summary: '标记全部通知为已读' })
  @Put('read-all') markAllAsRead(@CurrentUser() user: any) { return this.notificationsService.markAllAsRead(user.id); }
}
