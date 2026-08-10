import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.paymentsService.findAll(query);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.paymentsService.findById(+id);
  }

  @Put(':id/approve')
  approve(@Param('id') id: string, @Body('reviewNote') reviewNote: string, @CurrentUser() user: any) {
    return this.paymentsService.approve(+id, user.id, reviewNote);
  }

  @Put(':id/reject')
  reject(@Param('id') id: string, @Body('reviewNote') reviewNote: string, @CurrentUser() user: any) {
    return this.paymentsService.reject(+id, user.id, reviewNote);
  }
}
