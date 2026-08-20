import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrdersService } from '../orders/orders.service';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CustomersService } from './customers.service';
import { Throttle } from '@nestjs/throttler';
import { CheckoutDto } from './dto/checkout.dto';
import { CustomerAddressDto, SubmitPaymentProofDto } from './dto/customer-address.dto';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import {
  CloseCustomerAccountDto,
  CustomerLoginDto,
  CustomerRegisterDto,
  ForgotPasswordDto,
  RequestSmsCodeDto,
  ResetPasswordDto,
  UpdateCustomerProfileDto,
} from './dto/customer-auth.dto';

// 交易域认证说明（P0 修复）：
// JwtAuthGuard 已被注册为全局守卫（见 app.module.ts APP_GUARD），
// 而 JwtStrategy.validate 会拒绝 payload.type === 'customer' 的客户令牌。
// 因此所有用 CustomerAuthGuard 保护的前台接口必须显式标注 @Public()，
// 让全局 JwtAuthGuard / RolesGuard 旁通，再由方法级 CustomerAuthGuard 完成客户鉴权。
// 这样既不弱化后台 admin 认证，也不会把客户私有数据暴露给匿名访问。

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly ordersService: OrdersService,
  ) {}

  // 游客下单已关闭（DECISIONS D.7）：checkout 必须先 login/register，不再签发 access token
  @Public()
  @UseGuards(CustomerAuthGuard, CustomerCommerceGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('checkout')
  checkout(@Req() request: any, @Body() dto: CheckoutDto) {
    return this.customersService.checkout(request.customer.id, dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  register(@Body() dto: CustomerRegisterDto) {
    return this.customersService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: CustomerLoginDto) {
    return this.customersService.login(dto);
  }

  // 密码找回：3/min 收紧——防止用找回流程轰炸他人邮箱
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
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

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me')
  getProfile(@Req() request: any) {
    return this.customersService.getProfile(request.customer.id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Put('me')
  updateProfile(@Req() request: any, @Body() dto: UpdateCustomerProfileDto) {
    return this.customersService.updateProfile(request.customer.id, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/orders')
  getOrders(@Req() request: any) {
    return this.ordersService.findForCustomer(request.customer.id);
  }

  // 物流轨迹：客户查询自己已发货订单的快递轨迹（快递100，未配置凭据时 503）
  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/orders/:id/tracking')
  getOrderTracking(@Req() request: any, @Param('id') id: string) {
    return this.ordersService.trackForCustomer(request.customer.id, +id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/selection-inquiries')
  getSelectionInquiries(@Req() request: any) {
    return this.customersService.getSelectionInquiries(request.customer.id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/inquiries')
  getInquiries(@Req() request: any) {
    return this.customersService.getInquiries(request.customer.id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard, CustomerCommerceGuard)
  @Post('me/orders/:id/payment-proof')
  submitPaymentProof(@Req() request: any, @Param('id') id: string, @Body() dto: SubmitPaymentProofDto) {
    return this.ordersService.submitOfflinePaymentProof(request.customer.id, +id, dto.proofKey, {
      type: 'CUSTOMER' as const,
      id: request.customer.id,
    });
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/addresses')
  listAddresses(@Req() request: any) {
    return this.customersService.listAddresses(request.customer.id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Post('me/addresses')
  createAddress(@Req() request: any, @Body() dto: CustomerAddressDto) {
    return this.customersService.createAddress(request.customer.id, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Put('me/addresses/:id')
  updateAddress(@Req() request: any, @Param('id') id: string, @Body() dto: CustomerAddressDto) {
    return this.customersService.updateAddress(request.customer.id, +id, dto);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/favorites')
  listFavorites(@Req() request: any) {
    return this.customersService.listFavorites(request.customer.id);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('me/favorites/:productId/toggle')
  toggleFavorite(@Req() request: any, @Param('productId') productId: string) {
    return this.customersService.toggleFavorite(request.customer.id, +productId);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Delete('me/addresses/:id')
  deleteAddress(@Req() request: any, @Param('id') id: string) {
    return this.customersService.deleteAddress(request.customer.id, +id);
  }

  // ===== 合规（个保法：可携带权 + 注销权）=====

  /** 导出我的全部个人数据（JSON；不含他人数据与内部凭据） */
  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/data-export')
  exportMyData(@Req() request: any) {
    return this.customersService.exportMyData(request.customer.id);
  }

  /** 注销账户：密码二次确认 → 匿名化 + 永久无法登录（订单/评价按法定与展示需要保留） */
  @Public()
  @UseGuards(CustomerAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('me/close')
  closeAccount(@Req() request: any, @Body() dto: CloseCustomerAccountDto) {
    return this.customersService.closeAccount(request.customer.id, dto.password);
  }

  // ===== 后台客户档案（只读运营视图）=====
  // 不标 @Public：走全局 JwtAuthGuard（员工令牌）+ RolesGuard；
  // 与订单中心同口径，客服可查看（跟进客户），本批不含写操作。

  /** 客户列表：分页 + 关键词（手机/姓名/邮箱）+ 状态筛选 */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
  @Get('admin')
  adminList(@Query() query: { page?: string; pageSize?: string; keyword?: string; status?: string }) {
    return this.customersService.adminListCustomers(query);
  }

  /** 客户 360° 详情：档案 + 消费聚合 + 最近订单 + 收藏 + 地址数 */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE')
  @Get('admin/:id')
  adminDetail(@Param('id') id: string) {
    return this.customersService.adminGetCustomer(+id);
  }
}
