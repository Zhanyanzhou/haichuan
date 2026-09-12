import {
  Controller,
  Get,
  Header,
  Post,
  Patch,
  Put,
  Delete,
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
import { SkipGenericAudit } from "../../common/decorators/skip-generic-audit.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { Observable } from "rxjs";
import {
  PublishPageDocumentDto,
  RestorePageDocumentRevisionDto,
  RollbackPagePublicationDto,
  SavePageDocumentDto,
  ValidatePageDocumentDto,
} from "./dto";
import { requirePublishedPublicContentLocale } from "../../common/content-locale";
import type { StaffRequest } from "../../common/security/authenticated-principal";

@ApiTags("页面模块")
@Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
@Controller("page-modules")
export class PageModulesController {
  constructor(private service: PageModulesService) {}

  // ========== 旧系统母模板兼容读取（只读） ==========

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN", "EDITOR", "CUSTOMER_SERVICE", "WAREHOUSE", "SALES_CONSULTANT", "FINANCE")
  @Get("system-content-templates")
  @ApiOperation({ summary: "获取所有旧系统母模板当前兼容布局" })
  getSystemContentTemplates() {
    return this.service.getSystemContentTemplates();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN", "EDITOR", "CUSTOMER_SERVICE", "WAREHOUSE", "SALES_CONSULTANT", "FINANCE")
  @Get("system-content-templates/:contractKey/history")
  @ApiOperation({ summary: "获取旧系统母模板兼容版本历史" })
  getSystemContentTemplateHistory(@Param("contractKey") contractKey: string) {
    return this.service.getSystemContentTemplateHistory(contractKey);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN", "EDITOR", "CUSTOMER_SERVICE", "WAREHOUSE", "SALES_CONSULTANT", "FINANCE")
  @Get("system-content-templates/:contractKey")
  @ApiOperation({ summary: "获取旧系统母模板当前兼容布局" })
  getSystemContentTemplate(@Param("contractKey") contractKey: string) {
    return this.service.getSystemContentTemplate(contractKey);
  }

  // ========== 旧个人模板兼容读取（只读） ==========

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get("personal-content-templates")
  @ApiOperation({ summary: "获取当前账号的布局模板" })
  getPersonalContentTemplates(@Req() req: StaffRequest) {
    return this.service.getPersonalContentTemplates(req.user.id);
  }

  // ========== Puck 页面文档（PageDocument）API ==========

  @Public()
  @Get("document/published")
  // 发布后立即回读必须拿到新版本，禁止浏览器/中间代理启发式缓存该 JSON。
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "获取已发布页面文档（前台）" })
  getPublishedDocument(
    @Query("pageKey") pageKey: string,
    @Query("locale") locale?: string,
  ) {
    requirePublishedPublicContentLocale(locale);
    return this.service.getPublishedPageDocument(pageKey || "home");
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get("document/published/admin")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "获取已发布页面文档（后台完整快照）" })
  getPublishedAdminDocument(@Query("pageKey") pageKey: string) {
    return this.service.getPublishedPageDocumentForAdmin(pageKey || "home");
  }

  @Public()
  @Sse("document/stream")
  pageDocumentChangeStream(
    @Query("locale") locale?: string,
  ): Observable<MessageEvent> {
    requirePublishedPublicContentLocale(locale);
    return this.service.publicChangeStream();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get("document/admin")
  // 草稿回读同样禁止缓存，编辑器重开必须看到最新草稿。
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "获取页面文档（后台，含草稿）" })
  getAdminDocument(@Query("pageKey") pageKey: string) {
    return this.service.getPageDocument(pageKey || "home");
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Put("document")
  @ApiOperation({ summary: "保存页面文档草稿" })
  saveDocument(
    @Body() body: SavePageDocumentDto,
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
  @Roles("SUPER_ADMIN", "ADMIN")
  @Put("document/publish")
  @SkipGenericAudit()
  @ApiOperation({ summary: "发布页面文档" })
  publishDocument(
    @Body() body: PublishPageDocumentDto,
    @Req() req: StaffRequest,
  ) {
    return this.service.publishPageDocument(
      body?.pageKey || "home",
      req.user.id,
      body.expectedUpdatedAt,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Delete("document/draft")
  @ApiOperation({ summary: "放弃草稿并恢复为线上版本（乐观锁防护）" })
  discardDocumentDraft(
    @Query("pageKey") pageKey: string,
    @Query("expectedUpdatedAt") expectedUpdatedAt: string,
  ) {
    return this.service.discardPageDocumentDraft(
      pageKey || "home",
      expectedUpdatedAt,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Post("document/validate")
  @ApiOperation({ summary: "预检页面文档是否可发布（发布前校验）" })
  validateDocument(@Body() body: ValidatePageDocumentDto) {
    return this.service.validatePageDocument(
      body?.pageKey || "home",
      body?.puckData,
      body?.metadata,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get("document/revisions")
  @ApiOperation({ summary: "获取页面文档版本历史" })
  getDocumentRevisions(
    @Query("pageKey") pageKey: string,
    @Query("beforeVersion") beforeVersion?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.getPageDocumentRevisions(
      pageKey || "home",
      beforeVersion === undefined ? undefined : Number(beforeVersion),
      limit === undefined ? undefined : Number(limit),
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get("document/revisions/:version")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "获取可信页面文档单版本详情" })
  getDocumentRevision(
    @Query("pageKey") pageKey: string,
    @Param("version") version: string,
  ) {
    return this.service.getPageDocumentRevision(pageKey || "home", Number(version));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Put("document/revisions/:version/restore")
  @SkipGenericAudit()
  @ApiOperation({ summary: "复制历史版本内容为当前草稿" })
  restoreDocumentRevision(
    @Body() body: RestorePageDocumentRevisionDto,
    @Param("version") version: string,
    @Req() req: StaffRequest,
  ) {
    return this.service.restorePageDocumentRevision(
      body.pageKey || "home",
      Number(version),
      body.expectedUpdatedAt,
      req.user.id,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN")
  @Put("document/revisions/:revisionId/rollback-publication")
  @SkipGenericAudit()
  @ApiOperation({ summary: "从同页历史快照创建新的线上 revision" })
  rollbackDocumentPublication(
    @Body() body: RollbackPagePublicationDto,
    @Param("revisionId") revisionId: string,
    @Req() req: StaffRequest,
  ) {
    return this.service.rollbackPagePublication(
      body.pageKey || "home",
      Number(revisionId),
      body.expectedPublishedRevisionId,
      req.user.id,
    );
  }
}
