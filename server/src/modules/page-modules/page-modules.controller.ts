import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  MessageEvent,
  Sse,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PageModulesService } from "./page-modules.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { Observable } from "rxjs";

@ApiTags("页面模块")
@Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
@Controller("page-modules")
export class PageModulesController {
  constructor(private service: PageModulesService) {}

  // ========== Puck 页面文档（PageDocument）API ==========

  @Public()
  @Get("document/published")
  @ApiOperation({ summary: "获取已发布页面文档（前台）" })
  getPublishedDocument(@Query("pageKey") pageKey: string) {
    return this.service.getPublishedPageDocument(pageKey || "home");
  }

  @Public()
  @Sse("document/stream")
  pageDocumentChangeStream(): Observable<MessageEvent> {
    return this.service.publicChangeStream();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get("document/admin")
  @ApiOperation({ summary: "获取页面文档（后台，含草稿）" })
  getAdminDocument(@Query("pageKey") pageKey: string) {
    return this.service.getPageDocument(pageKey || "home");
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Put("document")
  @ApiOperation({ summary: "保存页面文档草稿" })
  saveDocument(
    @Body()
    body: {
      pageKey: string;
      puckData: any;
      metadata?: any;
      editorVersion?: string;
      expectedUpdatedAt?: string;
    },
  ) {
    return this.service.savePageDocument(
      body.pageKey,
      body.puckData,
      body.metadata,
      body.editorVersion,
      body.expectedUpdatedAt,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Put("document/publish")
  @ApiOperation({ summary: "发布页面文档" })
  publishDocument(
    @Body() body: { pageKey?: string; expectedUpdatedAt?: string },
    @Req() req: any,
  ) {
    return this.service.publishPageDocument(
      body?.pageKey || "home",
      req.user?.id,
      body?.expectedUpdatedAt,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Post("document/validate")
  @ApiOperation({ summary: "预检页面文档是否可发布（发布前校验）" })
  validateDocument(@Body() body: { pageKey?: string; puckData?: any }) {
    return this.service.validatePageDocument(
      body?.pageKey || "home",
      body?.puckData,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get("document/revisions")
  @ApiOperation({ summary: "获取页面文档版本历史" })
  getDocumentRevisions(@Query("pageKey") pageKey: string) {
    return this.service.getPageDocumentRevisions(pageKey || "home");
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Put("document/revisions/:version/restore")
  @ApiOperation({ summary: "恢复页面文档版本为草稿" })
  restoreDocumentRevision(
    @Body("pageKey") pageKey: string,
    @Param("version") version: string,
  ) {
    return this.service.restorePageDocumentRevision(pageKey || "home", +version);
  }
}
