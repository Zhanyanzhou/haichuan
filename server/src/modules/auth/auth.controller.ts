import {
  Controller,
  Post,
  UseGuards,
  Request,
  Body,
  Get,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { Public } from "../../common/decorators/public.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RegisterDto } from "./dto/register.dto";
import {
  buildClearSessionCookieHeaders,
  buildSessionCookieHeaders,
} from "../../common/security/session-security";

@ApiTags("认证")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  // 限流说明：ThrottlerGuard 已由 APP_GUARD 全局注册（先于方法级 guard 执行），此处无需重复
  // @UseGuards——此前写法会让同一请求被全局+方法级各计数一次，5/min 实际约 2 次/分钟即触发 429。
  // 保留 @Throttle 元数据（全局 Guard 读取），AuthGuard 单独挂载即可。
  @UseGuards(AuthGuard("local"))
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("login")
  @ApiOperation({ summary: "用户登录" })
  @ApiBody({
    schema: {
      properties: {
        username: { type: "string" },
        password: { type: "string" },
      },
    },
  })
  async login(@Request() req: any, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(req.user);
    if (req.headers?.["x-session-mode"] === "cookie") {
      const cookie = buildSessionCookieHeaders("admin", result.accessToken, 7 * 24 * 60 * 60);
      response.setHeader("Set-Cookie", cookie.headers);
    }
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  logout(@Res({ passthrough: true }) response: Response) {
    response.setHeader("Set-Cookie", buildClearSessionCookieHeaders("admin"));
    return { success: true };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN")
  @Post("register")
  @ApiOperation({ summary: "用户注册" })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get("profile")
  @ApiOperation({ summary: "获取当前用户信息" })
  getProfile(@Request() req: any) {
    return req.user;
  }
}
