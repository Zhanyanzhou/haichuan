import { Module } from "@nestjs/common";
import { ShippingTemplatesController } from "./shipping-templates.controller";
import { ShippingTemplatesService } from "./shipping-templates.service";

@Module({
  controllers: [ShippingTemplatesController],
  providers: [ShippingTemplatesService],
  exports: [ShippingTemplatesService],
})
export class ShippingTemplatesModule {}
