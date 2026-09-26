import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BoundedListQueryDto } from '../../common/dto/bounded-list-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';

@ApiTags('用户管理')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: '获取用户列表' })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  findAll(@Query() query: BoundedListQueryDto, @CurrentUser() actor: StaffPrincipal) {
    return this.usersService.findAll(query, actor);
  }

  @Get('assignable')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
  @ApiOperation({ summary: '获取可分配员工轻量列表' })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  findAssignable(@CurrentUser() actor: StaffPrincipal) {
    return this.usersService.findAssignable(actor);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: '获取用户详情' })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  findById(@Param('id') id: string, @CurrentUser() actor: StaffPrincipal) {
    return this.usersService.findById(+id, actor);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '新增用户' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: StaffPrincipal) {
    return this.usersService.create(dto, actor);
  }

  @Put(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: StaffPrincipal) {
    return this.usersService.update(+id, dto, actor);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '禁用员工账号（兼容原 DELETE 路由）' })
  delete(@Param('id') id: string, @CurrentUser() actor: StaffPrincipal) {
    return this.usersService.delete(+id, actor);
  }
}
