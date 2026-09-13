import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import type { CustomerRequest } from '../../common/security/authenticated-principal';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { ConfirmQuotationOrderDto } from './dto/quotation-commerce.dto';
import { QuotationOrderingGuard } from './quotation-ordering.guard';
import { QuotationTransactionService } from './quotation-transaction.service';
import { QuotationsService } from './quotations.service';

@ApiTags('客户报价')
@Public()
@UseGuards(CustomerAuthGuard)
@Controller('customers/me')
export class CustomerQuotationsController {
  constructor(
    private readonly quotations: QuotationsService,
    private readonly transactions: QuotationTransactionService,
  ) {}

  @Get('quotations')
  @ApiOperation({ summary: '当前客户的报价列表' })
  findAll(@Req() request: CustomerRequest) {
    return this.quotations.findForCustomer(request.customer.id);
  }

  @Get('quotations/:id')
  @ApiOperation({ summary: '当前客户的报价详情' })
  findById(
    @Req() request: CustomerRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.quotations.findForCustomerById(request.customer.id, id);
  }

  @Get('cooperation-design-files')
  @ApiOperation({ summary: '当前客户可确认的 3D 文件版本' })
  listDesignFiles(@Req() request: CustomerRequest) {
    return this.transactions.listDesignFilesForCustomer(request.customer.id);
  }

  @Get('cooperation-design-files/:fileId/versions/:version/content')
  @ApiOperation({ summary: '当前客户下载本人待确认或已确认的 3D 文件字节' })
  async getDesignFileContent(
    @Req() request: CustomerRequest,
    @Param('fileId', ParseIntPipe) fileId: number,
    @Param('version', ParseIntPipe) version: number,
    @Res() response: Response,
  ) {
    const file = await this.transactions.getDesignFileContentForCustomer(
      request.customer.id,
      fileId,
      version,
    );
    const safeAsciiName = file.originalName.replace(/[^A-Za-z0-9._-]+/g, '_') || `design-v${version}`;
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );
    response.setHeader('Digest', `sha-256=${Buffer.from(file.checksumSha256, 'hex').toString('base64')}`);
    response.send(file.buffer);
  }

  @Post('quotations/:id/confirm-and-order')
  @UseGuards(QuotationOrderingGuard)
  @ApiOperation({ summary: '客户本人原子确认报价并创建订单' })
  confirmAndOrder(
    @Req() request: CustomerRequest,
    @Param('id', ParseIntPipe) id: number,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ConfirmQuotationOrderDto,
  ) {
    return this.transactions.confirmAndCreateOrder(
      request.customer.id,
      id,
      idempotencyKey,
      dto,
    );
  }

  @Post('cooperation-design-files/:fileId/versions/:version/confirm')
  @UseGuards(QuotationOrderingGuard)
  @ApiOperation({ summary: '客户本人确认 3D 文件版本及蜡重' })
  confirmDesignFileVersion(
    @Req() request: CustomerRequest,
    @Param('fileId', ParseIntPipe) fileId: number,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.transactions.confirmDesignFileVersion(
      request.customer.id,
      fileId,
      version,
    );
  }
}
