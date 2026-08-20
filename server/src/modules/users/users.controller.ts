import { Controller, Get, Post, Put, Delete, Param, Query, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('用户管理')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: '获取用户列表' })
  findAll(@Query() query: any) {
    return this.usersService.findAll(query);
  }

  @Get('assignable')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
  @ApiOperation({ summary: '获取可分配员工轻量列表' })
  findAssignable() {
    return this.usersService.findAssignable();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: '获取用户详情' })
  findById(@Param('id') id: string) {
    return this.usersService.findById(+id);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '新增用户' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Put(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Request() req: any) {
    return this.usersService.update(+id, dto, req.user);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.usersService.delete(+id, req.user);
  }
}
