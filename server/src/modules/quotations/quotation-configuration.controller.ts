import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreatePartnerPriceAgreementDto,
  CreateQuotationFeeRuleDto,
  CreateTradeResourceBucketDto,
  UpdateTradeResourceBucketDto,
} from './dto/quotation-commerce.dto';
import { QuotationConfigurationService } from './quotation-configuration.service';

@ApiTags('报价配置')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('quotation-configuration')
export class QuotationConfigurationController {
  constructor(private readonly configuration: QuotationConfigurationService) {}

  @Get('partner-prices/:customerId')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  @ApiOperation({ summary: '合作客户双蜡价版本历史' })
  listPartnerPrices(
    @Param('customerId', ParseIntPipe) customerId: number,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.configuration.listPartnerPrices(customerId, actor);
  }

  @Post('partner-prices')
  @ApiOperation({ summary: '追加合作客户双蜡价版本' })
  createPartnerPrice(
    @Body() dto: CreatePartnerPriceAgreementDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.configuration.createPartnerPrice(dto, actor);
  }

  @Get('fee-rules')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  @ApiOperation({ summary: '报价费用规则列表' })
  listFeeRules(@CurrentUser() actor: StaffPrincipal) {
    return this.configuration.listFeeRules(actor);
  }

  @Post('fee-rules')
  @ApiOperation({ summary: '追加报价费用规则版本' })
  createFeeRule(
    @Body() dto: CreateQuotationFeeRuleDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.configuration.createFeeRule(dto, actor);
  }

  @Get('resource-buckets')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Vary', 'Cookie, Authorization')
  @ApiOperation({ summary: '定制与蜡模资源桶列表' })
  listResourceBuckets(@CurrentUser() actor: StaffPrincipal) {
    return this.configuration.listResourceBuckets(actor);
  }

  @Post('resource-buckets')
  @ApiOperation({ summary: '创建定制或蜡模资源桶' })
  createResourceBucket(
    @Body() dto: CreateTradeResourceBucketDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.configuration.createResourceBucket(dto, actor);
  }

  @Put('resource-buckets/:id')
  @ApiOperation({ summary: '按版本更新资源桶可用量或启用状态' })
  updateResourceBucket(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTradeResourceBucketDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.configuration.updateResourceBucket(id, dto, actor);
  }
}
