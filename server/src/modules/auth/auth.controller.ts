import {
  Controller,
  Post,
  UseGuards,
  Request,
  Body,
  Get,
  Res,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request as ExpressRequest, Response } from "express";
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
  extractRefreshCookieToken,
  extractBearerToken,
  requestSessionMetadata,
} from "../../common/security/session-security";
import { RefreshSessionService } from "../../common/security/refresh-session.service";
import type { StaffRequest } from "../../common/security/authenticated-principal";

@ApiTags("认证")
@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private refreshSessions: RefreshSessionService,
  ) {}

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
  async login(@Request() req: StaffRequest, @Res({ passthrough: true }) response: Response) {
    const session = await this.refreshSessions.issueAdmin(
      req.user.id,
      requestSessionMetadata(req),
    );
    let result;
    try {
      result = await this.authService.login(req.user, session.familyId);
    } catch (error) {
      await this.refreshSessions.revokeAdmin(session.refreshToken);
      throw error;
    }
    if (req.headers?.["x-session-mode"] === "cookie") {
      const cookie = buildSessionCookieHeaders(
        "admin",
        result.accessToken,
        session.refreshToken,
      );
      response.setHeader("Set-Cookie", cookie.headers);
      return { user: result.user };
    }
    return result;
  }

  @Public()
  @Post("session/refresh")
  async refresh(
    @Req() request: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = extractRefreshCookieToken(
      request.headers?.cookie,
      "admin",
    );
    if (!refreshToken) throw new UnauthorizedException("刷新会话不存在");
    const rotated = await this.refreshSessions.rotateAdmin(
      refreshToken,
      requestSessionMetadata(request),
    );
    const result = await this.authService.resume(
      rotated.userId,
      rotated.familyId,
    );
    response.setHeader(
      "Set-Cookie",
      buildSessionCookieHeaders(
        "admin",
        result.accessToken,
        rotated.refreshToken,
      ).headers,
    );
    return { user: result.user };
  }

  @Public()
  @Post(["logout", "session/logout"])
  async logout(
    @Req() request: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = extractRefreshCookieToken(
      request.headers?.cookie,
      "admin",
    );
    await this.refreshSessions.revokeAdmin(refreshToken);
    const bearerToken = extractBearerToken(request.headers?.authorization);
    if (bearerToken) {
      const accessSession =
        await this.authService.resolveRevocableAccessSession(bearerToken);
      if (accessSession) {
        await this.refreshSessions.revokeAdminFamilyForUser(
          accessSession.userId,
          accessSession.familyId,
        );
      }
    }
    response.setHeader("Set-Cookie", buildClearSessionCookieHeaders("admin"));
    return { success: true };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles("SUPER_ADMIN")
  @Post("register")
  @ApiOperation({ summary: "用户注册" })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get("profile")
  @ApiOperation({ summary: "获取当前用户信息" })
  getProfile(@Request() req: StaffRequest) {
    return req.user;
  }
}
