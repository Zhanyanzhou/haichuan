import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { IdempotencyKey } from '../../common/idempotency/idempotency-key';
import type { CustomerRequest } from '../../common/security/authenticated-principal';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { AfterSalesService } from './after-sales.service';
import { CreateCustomerAfterSalesDto } from './dto/after-sales.dto';

/** 客户本人售后入口；不复用后台 DTO，避免客户注入金额、客户或处理字段。 */
@Public()
@UseGuards(CustomerAuthGuard)
@Controller('customers/me')
export class CustomerAfterSalesController {
  constructor(private readonly afterSalesService: AfterSalesService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('orders/:orderId/after-sales')
  create(
    @Req() request: CustomerRequest,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: CreateCustomerAfterSalesDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.afterSalesService.createForCustomer(
      request.customer,
      orderId,
      dto,
      idempotencyKey,
    );
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('after-sales/:caseId/cancel')
  cancel(
    @Req() request: CustomerRequest,
    @Param('caseId', ParseIntPipe) caseId: number,
  ) {
    return this.afterSalesService.cancelForCustomer(
      request.customer,
      caseId,
    );
  }
}
