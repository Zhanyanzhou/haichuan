import { Controller, Get, Post, Put, Delete, Param, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('购物车')
@Controller('cart')
export class CartController {
  constructor(private cartService: CartService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '获取购物车' })
  getCart(@Headers('x-session-id') sessionId?: string) {
    return this.cartService.getCart(undefined, sessionId);
  }

  @Public()
  @Post()
  @ApiOperation({ summary: '添加商品到购物车' })
  addItem(@Body() body: any, @Headers('x-session-id') sessionId?: string) {
    return this.cartService.addItem({ ...body, sessionId });
  }

  @Public()
  @Put(':id')
  @ApiOperation({ summary: '更新购物车商品数量' })
  updateQuantity(@Param('id') id: string, @Body('quantity') quantity: number) {
    return this.cartService.updateQuantity(+id, quantity);
  }

  @Public()
  @Delete(':id')
  @ApiOperation({ summary: '从购物车移除商品' })
  removeItem(@Param('id') id: string) {
    return this.cartService.removeItem(+id);
  }

  @Public()
  @Delete()
  clearCart(@Headers('x-session-id') sessionId?: string) {
    return this.cartService.clearCart(undefined, sessionId);
  }
}
