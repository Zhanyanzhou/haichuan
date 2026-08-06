import { Controller, Post, UseGuards, Request, Body, Get } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @UseGuards(AuthGuard('local'))
  @Post('login')
  @ApiOperation({ summary: '用户登录' })
  @ApiBody({ schema: { properties: { username: { type: 'string' }, password: { type: 'string' } } } })
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: '用户注册' })
  async register(@Body() body: { username: string; password: string; realName?: string; phone?: string }) {
    return this.authService.register(body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: '获取当前用户信息' })
  getProfile(@Request() req) {
    return req.user;
  }
}
