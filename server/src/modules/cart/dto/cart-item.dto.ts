import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

export class AddCartItemDto {
  @Type(() => Number)
  @IsInt({ message: "productId 必须是整数" })
  @Min(1, { message: "productId 必须大于 0" })
  productId!: number;

  @Type(() => Number)
  @IsInt({ message: "skuId 必须是整数" })
  @Min(1, { message: "skuId 必须大于 0" })
  skuId!: number;

  @Type(() => Number)
  @IsInt({ message: "商品数量必须是整数" })
  @Min(1, { message: "商品数量不能小于 1" })
  @Max(99, { message: "商品数量不能超过 99" })
  quantity!: number;
}

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt({ message: "商品数量必须是整数" })
  @Min(0, { message: "商品数量不能小于 0" })
  @Max(99, { message: "商品数量不能超过 99" })
  quantity!: number;
}
