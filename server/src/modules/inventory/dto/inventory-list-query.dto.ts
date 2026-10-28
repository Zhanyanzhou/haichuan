import { IsOptional, IsString, MaxLength } from "class-validator";
import { BoundedListQueryDto } from "../../../common/dto/bounded-list-query.dto";

export class InventoryListQueryDto extends BoundedListQueryDto {
  /** 逗号分隔的商品编号，最多 50 个。用于从商品列表带入库存页。 */
  @IsOptional()
  @IsString()
  @MaxLength(600)
  productIds?: string;
}
