import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SelectionInquiryService } from "./selection-inquiry.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Public } from "../../common/decorators/public.decorator";
import { OptionalCustomerAuthGuard } from "../customers/optional-customer-auth.guard";

@Controller("selection-inquiries")
export class SelectionInquiryController {
  constructor(private readonly service: SelectionInquiryService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query() q: any) {
    const page = q.page ? +q.page : 1;
    const pageSize = q.pageSize ? +q.pageSize : 20;
    return this.service.findAll({
      status: q.status,
      keyword: q.keyword,
      page,
      pageSize,
    });
  }

  @Public()
  @UseGuards(OptionalCustomerAuthGuard)
  @Post()
  create(
    @Req() request: any,
    @Body()
    body: {
      customerName?: string;
      phone?: string;
      email?: string;
      wechat?: string;
      message?: string;
      items: Array<{
        productId?: number;
        productNameSnapshot: string;
        productSkuSnapshot?: string;
        productImageSnapshot?: string;
      }>;
    },
  ) {
    return this.service.create({ ...body, customer: request.customer });
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  findOne(@Param("id") id: number) {
    return this.service.findOne(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(":id")
  update(
    @Param("id") id: number,
    @Body() body: { status?: string; handlerId?: number },
  ) {
    return this.service.update(+id, body);
  }
}
