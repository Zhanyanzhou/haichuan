import { Controller, Get, Post, Put, Delete, Param, Body, Headers, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { OptionalCustomerAuthGuard } from '../customers/optional-customer-auth.guard';

@ApiTags('购物车')
@Controller('cart')
// OptionalCustomerAuthGuard：有客户令牌则解析出 req.customer，无令牌匿名放行（游客靠 x-session-id）
@UseGuards(OptionalCustomerAuthGuard)
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: '获取购物车' })
  getCart(@Req() req: any, @Headers('x-session-id') sessionId?: string) {
    return this.cartService.getCart({ userId: req.customer?.id, sessionId });
  }

  @Post()
  @ApiOperation({ summary: '添加商品到购物车' })
  addItem(@Req() req: any, @Body() body: any, @Headers('x-session-id') sessionId?: string) {
    return this.cartService.addItem({ ...body, userId: req.customer?.id, sessionId });
  }

  @Put(':id')
  @ApiOperation({ summary: '更新购物车商品数量' })
  updateQuantity(@Req() req: any, @Param('id') id: string, @Body('quantity') quantity: number, @Headers('x-session-id') sessionId?: string) {
    return this.cartService.updateQuantity(+id, quantity, { userId: req.customer?.id, sessionId });
  }

  @Delete(':id')
  @ApiOperation({ summary: '从购物车移除商品' })
  removeItem(@Req() req: any, @Param('id') id: string, @Headers('x-session-id') sessionId?: string) {
    return this.cartService.removeItem(+id, { userId: req.customer?.id, sessionId });
  }

  @Delete()
  @ApiOperation({ summary: '清空购物车' })
  clearCart(@Req() req: any, @Headers('x-session-id') sessionId?: string) {
    return this.cartService.clearCart({ userId: req.customer?.id, sessionId });
  }
}
