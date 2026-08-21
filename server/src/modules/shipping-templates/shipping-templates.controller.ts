import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { CreateShippingTemplateDto, UpdateShippingTemplateDto } from "./dto/shipping-template.dto";
import { ShippingTemplatesService } from "./shipping-templates.service";

@ApiTags("运费模板")
@ApiBearerAuth()
@Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
@Controller("shipping-templates")
export class ShippingTemplatesController {
  constructor(private readonly service: ShippingTemplatesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: CreateShippingTemplateDto) {
    return this.service.create(dto);
  }

  @Put(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateShippingTemplateDto) {
    return this.service.update(id, dto);
  }
}
