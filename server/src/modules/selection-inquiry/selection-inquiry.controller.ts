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
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { SelectionInquiryService } from "./selection-inquiry.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Public } from "../../common/decorators/public.decorator";
import { OptionalCustomerAuthGuard } from "../customers/optional-customer-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Throttle } from "@nestjs/throttler";
import { CreateSelectionInquiryDto } from "./dto/create-selection-inquiry.dto";
import { BoundedListQueryDto } from "../../common/dto/bounded-list-query.dto";
import type {
  OptionalCustomerRequest,
  StaffPrincipal,
} from "../../common/security/authenticated-principal";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UpdateSelectionInquiryDto } from "./dto/update-selection-inquiry.dto";
import { IDEMPOTENCY_HEADER } from "../leads/lead-submission";
import { IdempotencyKey } from "../../common/idempotency/idempotency-key";

type SelectionInquiryStaffPrincipal = Pick<StaffPrincipal, "id" | "sessionFamilyId">;

function setStaffPrivateNoStore(response: Response) {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Vary", "Cookie, Authorization");
}

@Controller("selection-inquiries")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN", "CUSTOMER_SERVICE")
export class SelectionInquiryController {
  constructor(private readonly service: SelectionInquiryService) {}

  @Get()
  findAll(
    @Query() q: BoundedListQueryDto,
    @CurrentUser() user: SelectionInquiryStaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.service.findAll({
      status: q.status,
      keyword: q.keyword,
      page: q.page,
      pageSize: q.pageSize,
    }, user);
  }

  // P0-6：公开提交收紧限流（5/min）
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @UseGuards(OptionalCustomerAuthGuard)
  @Post()
  create(
    @Req() request: OptionalCustomerRequest,
    @Body() body: CreateSelectionInquiryDto,
    @IdempotencyKey() idempotencyKey: string,
  ) {
    return this.service.create({
      ...body,
      customer: request.customer,
      idempotencyKey,
    });
  }

  @Get(":id")
  findOne(
    @Param("id") id: number,
    @CurrentUser() user: SelectionInquiryStaffPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    setStaffPrivateNoStore(response);
    return this.service.findOne(+id, user);
  }

  @Put(":id")
  update(
    @Param("id") id: number,
    @Body() body: UpdateSelectionInquiryDto,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @CurrentUser() user: SelectionInquiryStaffPrincipal,
  ) {
    return this.service.update(+id, body, idempotencyKey, user);
  }
}
