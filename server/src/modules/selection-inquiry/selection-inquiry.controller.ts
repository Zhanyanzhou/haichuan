import { Controller, Get, Put, Param, Query, Body } from '@nestjs/common';
import { SelectionInquiryService } from './selection-inquiry.service';

@Controller('selection-inquiries')
export class SelectionInquiryController {
  constructor(private readonly service: SelectionInquiryService) {}

  @Get()
  findAll(@Query() q: any) {
    const page = q.page ? +q.page : 1;
    const pageSize = q.pageSize ? +q.pageSize : 20;
    return this.service.findAll({ status: q.status, keyword: q.keyword, page, pageSize });
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(+id);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() body: { status?: string; handlerId?: number }) {
    return this.service.update(+id, body);
  }
}
