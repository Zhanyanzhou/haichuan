import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put, Query, Req, Res, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService } from '../orders/orders.service';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CustomersService } from './customers.service';
import { Throttle } from '@nestjs/throttler';
import { CheckoutDto } from './dto/checkout.dto';
import { CustomerAddressDto } from './dto/customer-address.dto';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import {
  CloseCustomerAccountDto,
  CustomerLoginDto,
  CustomerRegisterDto,
  ForgotPasswordDto,
  RequestSmsCodeDto,
  ResetPasswordDto,
} from './dto/customer-auth.dto';
import {
  buildClearSessionCookieHeaders,
  buildSessionCookieHeaders,
  extractBearerToken,
  extractRefreshCookieToken,
  requestSessionMetadata,
} from '../../common/security/session-security';
import { RefreshSessionService } from '../../common/security/refresh-session.service';
import { CustomerNotificationsService } from './customer-notifications.service';
import { MarketingService } from '../marketing/marketing.service';
import { CustomerNotificationQueryDto } from './dto/customer-notification-query.dto';
import { UpdateCustomerNotificationPreferenceDto } from './dto/customer-notification-preference.dto';
import { CustomerInquiryQueryDto } from './dto/customer-inquiry-query.dto';
import type {
  CustomerRequest,
  StaffRequest,
} from '../../common/security/authenticated-principal';
import { CustomerAvatarService } from './customer-avatar.service';
import { CustomerProfileService } from './customer-profile.service';
import { IdempotencyKey } from '../../common/idempotency/idempotency-key';
import {
  ChangeCustomerPasswordDto,
  ConfirmCustomerContactChangeDto,
  StartCustomerContactChangeDto,
  UpdateCustomerNameDto,
} from './dto/customer-profile.dto';

// 交易域认证说明（P0 修复）：
// JwtAuthGuard 已被注册为全局守卫（见 app.module.ts APP_GUARD），
// 而 JwtStrategy.validate 会拒绝 payload.type === 'customer' 的客户令牌。
// 因此所有用 CustomerAuthGuard 保护的前台接口必须显式标注 @Public()，
// 让全局 JwtAuthGuard / RolesGuard 旁通，再由方法级 CustomerAuthGuard 完成客户鉴权。
// 这样既不弱化后台 admin 认证，也不会把客户私有数据暴露给匿名访问。

function setCustomerPrivateNoStore(response: Response) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.vary('Cookie');
  response.vary('Authorization');
}

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly ordersService: OrdersService,
    private readonly customerNotifications: CustomerNotificationsService,
    private readonly refreshSessions: RefreshSessionService,
    private readonly marketingService: MarketingService,
    private readonly customerProfile: CustomerProfileService,
    private readonly customerAvatars: CustomerAvatarService,
  ) {}

  // 游客下单已关闭（DECISIONS D.7）：checkout 必须先 login/register，不再签发 access token
  @Public()
  @UseGuards(CustomerAuthGuard, CustomerCommerceGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('checkout')
  checkout(
    @Req() request: CustomerRequest,
    @Body() dto: CheckoutDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.customersService.checkout(request.customer, dto, idempotencyKey);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() dto: CustomerRegisterDto) {
    const cookieMode = request.headers?.['x-session-mode'] === 'cookie';
    const result = await this.customersService.register(
      dto,
      requestSessionMetadata(request),
    );
    if (cookieMode) {
      if (!result.refreshSession) throw new UnauthorizedException('客户会话未建立');
      response.setHeader(
        'Set-Cookie',
        buildSessionCookieHeaders(
          'customer',
          result.accessToken,
          result.refreshSession.refreshToken,
        ).headers,
      );
      return { customer: result.customer };
    }
    const { refreshSession: _, ...bearerResult } = result;
    return bearerResult;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() dto: CustomerLoginDto) {
    const { sessionAuthVersion: _, refreshSession, ...result } = await this.customersService.login(
      dto,
      requestSessionMetadata(request),
    );
    if (request.headers?.['x-session-mode'] === 'cookie') {
      if (!refreshSession) throw new UnauthorizedException('客户会话未建立');
      response.setHeader(
        'Set-Cookie',
        buildSessionCookieHeaders('customer', result.accessToken, refreshSession.refreshToken).headers,
      );
      return { customer: result.customer };
    }
    return result;
  }

  @Public()
  @Post('session/refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = extractRefreshCookieToken(request.headers?.cookie, 'customer');
    if (!refreshToken) throw new UnauthorizedException('刷新会话不存在');
    const rotated = await this.refreshSessions.rotateCustomer(
      refreshToken,
      requestSessionMetadata(request),
    );
    const result = await this.customersService.resume(rotated.customerId, rotated.familyId);
    response.setHeader(
      'Set-Cookie',
      buildSessionCookieHeaders('customer', result.accessToken, rotated.refreshToken).headers,
    );
    return { customer: result.customer };
  }

  @Public()
  @Post(['logout', 'session/logout'])
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const bearerToken = extractBearerToken(request.headers?.authorization);
    if (bearerToken) {
      const accessSession = await this.customersService.resolveRevocableAccessSession(bearerToken);
      if (!accessSession) throw new UnauthorizedException('客户会话无效');
      await this.refreshSessions.revokeCustomerFamilyForCustomer(
        accessSession.customerId,
        accessSession.familyId,
      );
    } else {
      await this.refreshSessions.revokeCustomer(
        extractRefreshCookieToken(request.headers?.cookie, 'customer'),
      );
    }
    response.setHeader('Set-Cookie', buildClearSessionCookieHeaders('customer'));
    return { success: true };
  }

  // 密码找回：3/min 收紧——防止用找回流程轰炸他人邮箱
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    return this.customersService.requestPasswordReset(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.customersService.resetPassword(dto.token, dto.password);
  }

  // ===== 手机验真（短信验证码，开关式强制）=====

  /** 注册是否需要验证码（前端据此动态渲染验证码字段） */
  @Public()
  @Get('sms-requirements')
  smsRequirements() {
    return this.customersService.smsRequirements();
  }

  // 发码：IP 级 3/min + 库级同号 60s 冷却/日 10 条上限（多层防短信轰炸）
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('sms-code')
  requestSmsCode(@Body() dto: RequestSmsCodeDto) {
    return this.customersService.requestSmsCode(dto.phone);
  }

  // ===== 登录分级挑战（防低速爆破；永不锁号，真实客户可用短信验证继续）=====

  // ===== 结算可用券（客户侧只读试算；核销仍在建单事务内原子完成）=====

  @Public()
  @UseGuards(CustomerAuthGuard, CustomerCommerceGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('me/coupons/usable')
  usableCoupons(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
    @Query('amountCents') amountCents: string,
  ) {
    setCustomerPrivateNoStore(response);
    return this.marketingService.listUsableCoupons(
      Number(amountCents) || 0,
      request.customer,
    );
  }

  /** 查询手机号当前需要的挑战等级（无副作用；仅按失败计数，与账号是否存在无关） */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('login/challenge')
  loginChallenge(@Query('phone') phone: string) {
    return this.customersService.loginChallenge(phone);
  }

  /** 一次性图形验证码（内存 5 分钟时效；点击/过期可重取） */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('login/captcha')
  loginCaptcha() {
    return this.customersService.issueLoginCaptcha();
  }

  /** 登录挑战短信验证码（purpose=LOGIN，与注册码互不通用） */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('login/sms-code')
  loginSmsCode(@Body() dto: RequestSmsCodeDto) {
    return this.customersService.requestSmsCode(dto.phone, 'LOGIN');
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me')
  getProfile(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    setCustomerPrivateNoStore(response);
    return this.customerProfile.getProfile(request.customer);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Put('me')
  updateProfile(@Req() request: CustomerRequest, @Body() dto: UpdateCustomerNameDto) {
    return this.customerProfile.updateName(request.customer, dto.name);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('me/security/sms-code')
  requestProfileSecuritySms(@Req() request: CustomerRequest) {
    return this.customerProfile.requestCurrentPhoneCode(request.customer);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('me/close/sms-code')
  requestAccountClosureSms(@Req() request: CustomerRequest) {
    return this.customerProfile.requestAccountClosureCode(request.customer);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Put('me/password')
  async changePassword(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: ChangeCustomerPasswordDto,
  ) {
    const result = await this.customerProfile.changePassword(
      request.customer,
      dto,
      requestSessionMetadata(request),
    );
    response.setHeader('Set-Cookie', buildClearSessionCookieHeaders('customer'));
    return result;
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('me/contact-changes')
  startContactChange(
    @Req() request: CustomerRequest,
    @Body() dto: StartCustomerContactChangeDto,
  ) {
    return this.customerProfile.startContactChange(request.customer, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Put('me/contact-changes/:changeId')
  async confirmContactChange(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('changeId') changeId: string,
    @Body() dto: ConfirmCustomerContactChangeDto,
  ) {
    const result = await this.customerProfile.confirmContactChange(
      request.customer,
      changeId,
      dto.verificationCode,
      requestSessionMetadata(request),
    );
    response.setHeader('Set-Cookie', buildClearSessionCookieHeaders('customer'));
    return result;
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }))
  @Put('me/avatar')
  updateAvatar(
    @Req() request: CustomerRequest,
    @UploadedFile() file: Express.Multer.File,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.customerAvatars.replace(
      request.customer,
      file,
      idempotencyKey,
      requestSessionMetadata(request),
    );
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Delete('me/avatar')
  deleteAvatar(@Req() request: CustomerRequest) {
    return this.customerAvatars.delete(
      request.customer,
      requestSessionMetadata(request),
    );
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('me/avatar/status')
  avatarUploadStatus(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    setCustomerPrivateNoStore(response);
    return this.customerAvatars.replaceStatus(request.customer, idempotencyKey);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/avatar')
  async getAvatar(
    @Req() request: CustomerRequest,
    @Res() response: Response,
  ) {
    const image = await this.customerAvatars.read(request.customer);
    response.type('image/webp').set('Cache-Control', 'private, no-store').send(image);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/orders')
  getOrders(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    setCustomerPrivateNoStore(response);
    return this.ordersService.findForCustomer(request.customer);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/orders/:id')
  getOrder(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id') id: string,
  ) {
    setCustomerPrivateNoStore(response);
    return this.ordersService.findOneForCustomer(request.customer, id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/notifications')
  getNotifications(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
    @Query() query: CustomerNotificationQueryDto,
  ) {
    setCustomerPrivateNoStore(response);
    return this.customerNotifications.list(request.customer, query);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Put('me/notifications/read-all')
  markAllNotificationsRead(@Req() request: CustomerRequest) {
    return this.customerNotifications.markAllRead(request.customer);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Put('me/notifications/:id/read')
  markNotificationRead(@Req() request: CustomerRequest, @Param('id', ParseIntPipe) id: number) {
    return this.customerNotifications.markRead(request.customer, id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/notification-preferences')
  getNotificationPreferences(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    setCustomerPrivateNoStore(response);
    return this.customerNotifications.listPreferences(request.customer);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Patch('me/notification-preferences')
  updateNotificationPreference(
    @Req() request: CustomerRequest,
    @Body() dto: UpdateCustomerNotificationPreferenceDto,
  ) {
    return this.customerNotifications.updatePreference(request.customer, dto);
  }

  // 物流轨迹：客户查询自己已发货订单的快递轨迹（快递100，未配置凭据时 503）
  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/orders/:id/tracking')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  getTracking(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseIntPipe) id: number,
  ) {
    setCustomerPrivateNoStore(response);
    return this.ordersService.trackForCustomer(request.customer, id);
  }

  // 客户自助取消未付款订单（存在待处理支付时服务端拒绝，防止渠道扣款与取消竞态）
  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('me/orders/:id/cancel')
  cancelOrder(@Req() request: CustomerRequest, @Param('id', ParseIntPipe) id: number) {
    return this.ordersService.cancelForCustomer(request.customer, id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/selection-inquiries')
  getSelectionInquiries(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    setCustomerPrivateNoStore(response);
    return this.customersService.getSelectionInquiries(request.customer);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/consultations/:leadId')
  getConsultation(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('leadId') leadId: string,
  ) {
    setCustomerPrivateNoStore(response);
    return this.customersService.getConsultation(request.customer, leadId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/inquiries')
  getInquiries(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
    @Query() query: CustomerInquiryQueryDto,
  ) {
    setCustomerPrivateNoStore(response);
    return this.customersService.getInquiries(request.customer, query);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/addresses')
  listAddresses(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    setCustomerPrivateNoStore(response);
    return this.customersService.listAddresses(request.customer);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Post('me/addresses')
  createAddress(
    @Req() request: CustomerRequest,
    @Body() dto: CustomerAddressDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.customersService.createAddress(request.customer, dto, idempotencyKey);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Put('me/addresses/:id')
  updateAddress(@Req() request: CustomerRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: CustomerAddressDto) {
    return this.customersService.updateAddress(request.customer, id, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/favorites')
  listFavorites(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    setCustomerPrivateNoStore(response);
    return this.customersService.listFavorites(request.customer);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('me/favorites/:productId/toggle')
  toggleFavorite(@Req() request: CustomerRequest, @Param('productId', ParseIntPipe) productId: number) {
    return this.customersService.toggleFavorite(request.customer, productId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Put('me/favorites/:productId')
  addFavorite(@Req() request: CustomerRequest, @Param('productId', ParseIntPipe) productId: number) {
    return this.customersService.addFavorite(request.customer, productId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Delete('me/favorites/:productId')
  removeFavorite(@Req() request: CustomerRequest, @Param('productId', ParseIntPipe) productId: number) {
    return this.customersService.removeFavorite(request.customer, productId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Delete('me/addresses/:id')
  deleteAddress(@Req() request: CustomerRequest, @Param('id', ParseIntPipe) id: number) {
    return this.customersService.deleteAddress(request.customer, id);
  }

  // ===== 合规（个保法：可携带权 + 注销权）=====

  /** 导出我的全部个人数据（JSON；不含他人数据与内部凭据） */
  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/data-export')
  exportMyData(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    setCustomerPrivateNoStore(response);
    return this.customersService.exportMyData(request.customer);
  }

  /** 注销账户：密码或无密码账户的当前手机验证码确认 → 匿名化 + 永久无法登录 */
  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('me/close')
  async closeAccount(
    @Req() request: CustomerRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: CloseCustomerAccountDto,
  ) {
    const result = await this.customersService.closeAccount(request.customer, dto);
    response.setHeader('Set-Cookie', buildClearSessionCookieHeaders('customer'));
    return result;
  }

  // ===== 后台客户档案（只读运营视图）=====
  // 不标 @Public：走全局 JwtAuthGuard（员工令牌）+ RolesGuard；
  // 与订单中心同口径，客服可查看（跟进客户），本批不含写操作。

  /** 客户列表：分页 + 关键词（手机/姓名/邮箱）+ 状态筛选 */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
  @Get('admin')
  adminList(
    @Req() request: StaffRequest,
    @Res({ passthrough: true }) response: Response,
    @Query() query: { page?: string; pageSize?: string; keyword?: string; status?: string },
  ) {
    setCustomerPrivateNoStore(response);
    return this.customersService.adminListCustomers(query, request.user);
  }

  /** 客户 360° 详情：档案 + 消费聚合 + 最近订单 + 收藏 + 地址数 */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
  @Get('admin/:id')
  adminDetail(
    @Req() request: StaffRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseIntPipe) id: number,
  ) {
    setCustomerPrivateNoStore(response);
    return this.customersService.adminGetCustomer(id, request.user);
  }
}
