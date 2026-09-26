import { Body, Controller, Get, Header, Param, ParseIntPipe, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import type { StaffPrincipal } from "../../common/security/authenticated-principal";
import { CreateShippingTemplateDto, UpdateShippingTemplateDto } from "./dto/shipping-template.dto";
import { ShippingTemplatesService } from "./shipping-templates.service";

@ApiTags("运费模板")
@ApiBearerAuth()
@Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
@Controller("shipping-templates")
export class ShippingTemplatesController {
  constructor(private readonly service: ShippingTemplatesService) {}

  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  list(@CurrentUser() actor: StaffPrincipal) {
    return this.service.list(actor);
  }

  @Post()
  @Roles("SUPER_ADMIN", "ADMIN")
  create(
    @Body() dto: CreateShippingTemplateDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.service.create(dto, actor);
  }

  @Put(":id")
  @Roles("SUPER_ADMIN", "ADMIN")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateShippingTemplateDto,
    @CurrentUser() actor: StaffPrincipal,
  ) {
    return this.service.update(id, dto, actor);
  }
}
