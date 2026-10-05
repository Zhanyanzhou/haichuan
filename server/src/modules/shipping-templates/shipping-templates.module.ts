import { Module } from "@nestjs/common";
import { ProductsModule } from "../products/products.module";
import { ShippingTemplatesController } from "./shipping-templates.controller";
import { ShippingTemplatesService } from "./shipping-templates.service";

@Module({
  imports: [ProductsModule],
  controllers: [ShippingTemplatesController],
  providers: [ShippingTemplatesService],
  exports: [ShippingTemplatesService],
})
export class ShippingTemplatesModule {}
