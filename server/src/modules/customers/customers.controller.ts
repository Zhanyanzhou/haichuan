import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { OrdersService } from '../orders/orders.service';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CustomersService } from './customers.service';
import { Throttle } from '@nestjs/throttler';
import { CheckoutDto } from './dto/checkout.dto';
import { CustomerAddressDto, SubmitPaymentProofDto } from './dto/customer-address.dto';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';

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
  @UseGuards(CustomerCommerceGuard, CustomerAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('checkout')
  checkout(@Req() request: any, @Body() dto: CheckoutDto) {
    return this.customersService.checkout(request.customer.id, dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  register(@Body() body: { phone: string; password: string; name?: string; email?: string }) {
    return this.customersService.register(body);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() body: { phone: string; password: string }) {
    return this.customersService.login(body);
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
  updateProfile(@Req() request: any, @Body() body: any) {
    return this.customersService.updateProfile(request.customer.id, body);
  }

  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get('me/orders')
  getOrders(@Req() request: any) {
    return this.ordersService.findForCustomer(request.customer.id);
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
  @UseGuards(CustomerCommerceGuard, CustomerAuthGuard)
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
  @Delete('me/addresses/:id')
  deleteAddress(@Req() request: any, @Param('id') id: string) {
    return this.customersService.deleteAddress(request.customer.id, +id);
  }
}
