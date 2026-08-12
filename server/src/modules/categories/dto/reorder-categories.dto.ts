import { IsArray, ValidateNested, IsInt, Min, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

/** 单条排序项：分类 ID + 新的排序值。 */
class CategorySortItemDto {
  @Type(() => Number)
  @IsInt({ message: '分类 ID 必须是整数' })
  @IsNotEmpty({ message: '分类 ID 不能为空' })
  id!: number;

  @Type(() => Number)
  @IsInt({ message: '排序值必须是整数' })
  @Min(0, { message: '排序值不能为负' })
  sortOrder!: number;
}

/** POST /categories/reorder 请求体：批量调整分类排序。 */
export class ReorderCategoriesDto {
  @IsArray({ message: '排序数据必须是数组' })
  @ValidateNested({ each: true })
  @Type(() => CategorySortItemDto)
  items!: CategorySortItemDto[];
}
