import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('标签字典')
@ApiBearerAuth()
@Controller('tags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'EDITOR')
export class TagsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: '标签字典列表' })
  list() {
    return this.productsService.listTags();
  }

  @Post()
  @ApiOperation({ summary: '新增标签' })
  create(@Body() body: any) {
    return this.productsService.createTag(body);
  }

  @Put(':id')
  @ApiOperation({ summary: '编辑标签（含启停）' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.productsService.updateTag(+id, body);
  }
}
