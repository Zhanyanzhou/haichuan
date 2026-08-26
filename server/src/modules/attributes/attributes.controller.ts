import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AttributesService } from "./attributes.service";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  CreateAttributeDto,
  CreateAttributeValueDto,
  UpdateAttributeDto,
  UpdateAttributeValueDto,
} from "./dto/attribute.dto";

@ApiTags("商品属性字典")
@Controller("attributes")
export class AttributesController {
  constructor(private attributesService: AttributesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "获取前台可用的属性与属性值（筛选器）" })
  findPublic() {
    return this.attributesService.findPublic();
  }

  @Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
  @ApiBearerAuth()
  @Get("admin")
  @ApiOperation({ summary: "获取管理端全部属性（含停用）" })
  findAll() {
    return this.attributesService.findAll();
  }

  @Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: "新增属性" })
  create(@Body() body: CreateAttributeDto) {
    return this.attributesService.create(body);
  }

  @Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
  @ApiBearerAuth()
  @Put(":id")
  @ApiOperation({ summary: "编辑属性" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateAttributeDto,
  ) {
    return this.attributesService.update(id, body);
  }

  @Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
  @ApiBearerAuth()
  @Delete(":id")
  @ApiOperation({ summary: "停用属性" })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.attributesService.remove(id);
  }

  @Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
  @ApiBearerAuth()
  @Post(":id/values")
  @ApiOperation({ summary: "新增属性值" })
  addValue(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: CreateAttributeValueDto,
  ) {
    return this.attributesService.addValue(id, body);
  }

  @Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
  @ApiBearerAuth()
  @Put("values/:valueId")
  @ApiOperation({ summary: "编辑属性值" })
  updateValue(
    @Param("valueId", ParseIntPipe) valueId: number,
    @Body() body: UpdateAttributeValueDto,
  ) {
    return this.attributesService.updateValue(valueId, body);
  }

  @Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
  @ApiBearerAuth()
  @Delete("values/:valueId")
  @ApiOperation({ summary: "停用属性值" })
  removeValue(@Param("valueId", ParseIntPipe) valueId: number) {
    return this.attributesService.removeValue(valueId);
  }
}
