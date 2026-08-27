import { Controller, Get, Post, Put, Delete, Param, Body, Headers, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { OptionalCustomerAuthGuard } from '../customers/optional-customer-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart-item.dto';
import type { OptionalCustomerRequest } from '../../common/security/authenticated-principal';

@ApiTags('购物车')
@Controller('cart')
// 购物车为公开接口（游客靠 x-session-id，登录客户靠客户令牌）。
// 必须标注 @Public() 让全局 JwtAuthGuard 旁通（JwtStrategy 会拒绝客户令牌），
// 再由 OptionalCustomerAuthGuard 完成可选客户鉴权。
@Public()
// OptionalCustomerAuthGuard：有客户令牌则解析出 req.customer，无令牌匿名放行（游客靠 x-session-id）
@UseGuards(CustomerCommerceGuard, OptionalCustomerAuthGuard)
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: '获取购物车' })
  getCart(@Req() req: OptionalCustomerRequest, @Headers('x-session-id') sessionId?: string) {
    return this.cartService.getCart({ userId: req.customer?.id, sessionId, customer: req.customer });
  }

  @Post()
  @ApiOperation({ summary: '添加商品到购物车' })
  addItem(@Req() req: OptionalCustomerRequest, @Body() body: AddCartItemDto, @Headers('x-session-id') sessionId?: string) {
    return this.cartService.addItem({ ...body, userId: req.customer?.id, sessionId, customer: req.customer });
  }

  @Put(':id')
  @ApiOperation({ summary: '更新购物车商品数量' })
  updateQuantity(@Req() req: OptionalCustomerRequest, @Param('id', ParseIntPipe) id: number, @Body() body: UpdateCartItemDto, @Headers('x-session-id') sessionId?: string) {
    return this.cartService.updateQuantity(id, body.quantity, { userId: req.customer?.id, sessionId, customer: req.customer });
  }

  @Delete(':id')
  @ApiOperation({ summary: '从购物车移除商品' })
  removeItem(@Req() req: OptionalCustomerRequest, @Param('id', ParseIntPipe) id: number, @Headers('x-session-id') sessionId?: string) {
    return this.cartService.removeItem(id, { userId: req.customer?.id, sessionId, customer: req.customer });
  }

  @Delete()
  @ApiOperation({ summary: '清空购物车' })
  clearCart(@Req() req: OptionalCustomerRequest, @Headers('x-session-id') sessionId?: string) {
    return this.cartService.clearCart({ userId: req.customer?.id, sessionId, customer: req.customer });
  }
}
