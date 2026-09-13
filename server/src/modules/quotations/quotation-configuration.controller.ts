import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
import type { QuotationActor } from './quotations.service';

@ApiTags('报价配置')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('quotation-configuration')
export class QuotationConfigurationController {
  constructor(private readonly configuration: QuotationConfigurationService) {}

  @Get('partner-prices/:customerId')
  @ApiOperation({ summary: '合作客户双蜡价版本历史' })
  listPartnerPrices(@Param('customerId', ParseIntPipe) customerId: number) {
    return this.configuration.listPartnerPrices(customerId);
  }

  @Post('partner-prices')
  @ApiOperation({ summary: '追加合作客户双蜡价版本' })
  createPartnerPrice(
    @Body() dto: CreatePartnerPriceAgreementDto,
    @CurrentUser() actor: QuotationActor,
  ) {
    return this.configuration.createPartnerPrice(dto, actor.id);
  }

  @Get('fee-rules')
  @ApiOperation({ summary: '报价费用规则列表' })
  listFeeRules() {
    return this.configuration.listFeeRules();
  }

  @Post('fee-rules')
  @ApiOperation({ summary: '追加报价费用规则版本' })
  createFeeRule(
    @Body() dto: CreateQuotationFeeRuleDto,
    @CurrentUser() actor: QuotationActor,
  ) {
    return this.configuration.createFeeRule(dto, actor.id);
  }

  @Get('resource-buckets')
  @ApiOperation({ summary: '定制与蜡模资源桶列表' })
  listResourceBuckets() {
    return this.configuration.listResourceBuckets();
  }

  @Post('resource-buckets')
  @ApiOperation({ summary: '创建定制或蜡模资源桶' })
  createResourceBucket(
    @Body() dto: CreateTradeResourceBucketDto,
    @CurrentUser() actor: QuotationActor,
  ) {
    return this.configuration.createResourceBucket(dto, actor.id);
  }

  @Put('resource-buckets/:id')
  @ApiOperation({ summary: '按版本更新资源桶可用量或启用状态' })
  updateResourceBucket(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTradeResourceBucketDto,
    @CurrentUser() actor: QuotationActor,
  ) {
    return this.configuration.updateResourceBucket(id, dto, actor.id);
  }
}
