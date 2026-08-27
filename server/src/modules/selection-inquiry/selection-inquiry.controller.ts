import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  Headers,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SelectionInquiryService } from "./selection-inquiry.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Public } from "../../common/decorators/public.decorator";
import { OptionalCustomerAuthGuard } from "../customers/optional-customer-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Throttle } from "@nestjs/throttler";
import { CreateSelectionInquiryDto } from "./dto/create-selection-inquiry.dto";
import { BoundedListQueryDto } from "../../common/dto/bounded-list-query.dto";
import type { OptionalCustomerRequest } from "../../common/security/authenticated-principal";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UpdateSelectionInquiryDto } from "./dto/update-selection-inquiry.dto";

@Controller("selection-inquiries")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN", "CUSTOMER_SERVICE")
export class SelectionInquiryController {
  constructor(private readonly service: SelectionInquiryService) {}

  @Get()
  findAll(@Query() q: BoundedListQueryDto) {
    return this.service.findAll({
      status: q.status,
      keyword: q.keyword,
      page: q.page,
      pageSize: q.pageSize,
    });
  }

  // P0-6：公开提交收紧限流（5/min）
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @UseGuards(OptionalCustomerAuthGuard)
  @Post()
  create(
    @Req() request: OptionalCustomerRequest,
    @Body() body: CreateSelectionInquiryDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.service.create({
      ...body,
      customer: request.customer,
      idempotencyKey,
    });
  }

  @Get(":id")
  findOne(@Param("id") id: number) {
    return this.service.findOne(+id);
  }

  @Put(":id")
  update(
    @Param("id") id: number,
    @Body() body: UpdateSelectionInquiryDto,
    @CurrentUser() user: { id?: number },
  ) {
    return this.service.update(+id, body, user?.id);
  }
}
