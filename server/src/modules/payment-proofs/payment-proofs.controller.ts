import {
  BadRequestException,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { IdempotencyKey } from '../../common/idempotency/idempotency-key';
import { CustomerCommerceGuard } from '../../common/guards/customer-commerce.guard';
import type { CustomerRequest } from '../../common/security/authenticated-principal';
import { CustomerAuthGuard } from '../customers/customer-auth.guard';
import { PaymentProofsService } from './payment-proofs.service';

const paymentProofUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request: Request, file: Express.Multer.File, callback: (error: Error | null, accept: boolean) => void) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      return callback(new BadRequestException('仅支持 JPEG、PNG、WebP 或 GIF 图片'), false);
    }
    callback(null, true);
  },
};

@Controller('upload')
export class PaymentProofsController {
  constructor(private readonly paymentProofs: PaymentProofsService) {}

  @Public()
  @UseGuards(CustomerAuthGuard, CustomerCommerceGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('payment-proof/:orderId')
  @UseInterceptors(FileInterceptor('file', paymentProofUploadOptions))
  uploadAndSubmit(
    @Req() request: CustomerRequest,
    @Param('orderId', ParseIntPipe) orderId: number,
    @UploadedFile() file: Express.Multer.File,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.paymentProofs.uploadAndSubmit(
      request.customer,
      orderId,
      file,
      idempotencyKey,
    );
  }
}
