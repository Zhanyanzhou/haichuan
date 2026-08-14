import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { OrdersService } from '../orders/orders.service';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CustomersService } from './customers.service';
import { Throttle } from '@nestjs/throttler';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly ordersService: OrdersService,
  ) {}

  @UseGuards(CustomerCommerceGuard, CustomerAuthGuard)
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('checkout')
  checkout(@Body() body: any) {
    return this.customersService.checkout(body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('order-access')
  orderAccess(@Body() body: { phone: string; orderNo: string }) {
    return this.customersService.accessByOrder(body.phone, body.orderNo);
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

  @UseGuards(CustomerAuthGuard)
  @Get('me')
  getProfile(@Req() request: any) {
    return this.customersService.getProfile(request.customer.id);
  }

  @UseGuards(CustomerAuthGuard)
  @Put('me')
  updateProfile(@Req() request: any, @Body() body: any) {
    return this.customersService.updateProfile(request.customer.id, body);
  }

  @UseGuards(CustomerAuthGuard)
  @Get('me/orders')
  getOrders(@Req() request: any) {
    return this.ordersService.findForCustomer(request.customer.id);
  }

  @UseGuards(CustomerAuthGuard)
  @Get('me/selection-inquiries')
  getSelectionInquiries(@Req() request: any) {
    return this.customersService.getSelectionInquiries(request.customer.id);
  }

  @UseGuards(CustomerAuthGuard)
  @Get('me/inquiries')
  getInquiries(@Req() request: any) {
    return this.customersService.getInquiries(request.customer.id);
  }

  @Public()
  @UseGuards(CustomerCommerceGuard, CustomerAuthGuard)
  @Post('me/orders/:id/payment-proof')
  submitPaymentProof(@Req() request: any, @Param('id') id: string, @Body('proofUrl') proofUrl: string) {
    return this.ordersService.submitOfflinePaymentProof(request.customer.id, +id, proofUrl);
  }

  @UseGuards(CustomerAuthGuard)
  @Get('me/addresses')
  listAddresses(@Req() request: any) {
    return this.customersService.listAddresses(request.customer.id);
  }

  @UseGuards(CustomerAuthGuard)
  @Post('me/addresses')
  createAddress(@Req() request: any, @Body() body: any) {
    return this.customersService.createAddress(request.customer.id, body);
  }

  @UseGuards(CustomerAuthGuard)
  @Put('me/addresses/:id')
  updateAddress(@Req() request: any, @Param('id') id: string, @Body() body: any) {
    return this.customersService.updateAddress(request.customer.id, +id, body);
  }

  @UseGuards(CustomerAuthGuard)
  @Delete('me/addresses/:id')
  deleteAddress(@Req() request: any, @Param('id') id: string) {
    return this.customersService.deleteAddress(request.customer.id, +id);
  }
}
