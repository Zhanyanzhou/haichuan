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
  ReviewPageDocumentDto,
  RestorePageDocumentRevisionDto,
  RollbackPagePublicationDto,
  SavePageDocumentDto,
  SubmitPageDocumentReviewDto,
  ValidatePageDocumentDto,
} from "./dto";
import {
  parsePublicContentLocale,
  requireEditablePublicContentLocale,
  requirePublishedPublicContentLocale,
} from "../../common/content-locale";
import { RejectRetiredEditableLocaleGuard } from "../../common/reject-retired-editable-locale.guard";
import type { StaffRequest } from "../../common/security/authenticated-principal";

@ApiTags("页面模块")
@Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
@UseGuards(RejectRetiredEditableLocaleGuard)
@Controller("page-modules")
export class PageModulesController {
  constructor(private service: PageModulesService) {}

  // ========== Puck 页面文档（PageDocument）API ==========

  @Public()
  @Get("document/published")
  // 发布后立即回读必须拿到新版本，禁止浏览器/中间代理启发式缓存该 JSON。
  @Header("Cache-Control", "no-store")
  // 页面 HTML 承担公开索引；原始 PageDocument JSON 不应成为独立搜索结果。
  @Header("X-Robots-Tag", "noindex, nofollow")
  @ApiOperation({ summary: "获取已发布页面文档（前台）" })
  getPublishedDocument(
    @Query("pageKey") pageKey: string,
    @Query("locale") locale?: string,
  ) {
    return this.service.getLocalizedPublishedPageDocument(
      pageKey || "home",
      requirePublishedPublicContentLocale(locale),
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get("document/published/admin")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  @ApiOperation({ summary: "获取已发布页面文档（后台完整快照）" })
  getPublishedAdminDocument(
    @Query("pageKey") pageKey: string,
    @Query("locale") locale?: string,
    @Req() req?: StaffRequest,
  ) {
    return this.service.getLocalizedPublishedPageDocumentForAdmin(
      pageKey || "home",
      parsePublicContentLocale(locale),
      req?.user,
    );
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
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  @ApiOperation({ summary: "获取页面文档（后台，含草稿）" })
  getAdminDocument(
    @Query("pageKey") pageKey: string,
    @Query("locale") locale?: string,
    @Req() req?: StaffRequest,
  ) {
    return this.service.getLocalizedPageDocument(
      pageKey || "home",
      parsePublicContentLocale(locale),
      req?.user,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Put("document")
  @ApiOperation({ summary: "保存页面文档草稿" })
  saveDocument(
    @Body() body: SavePageDocumentDto,
    @Req() req: StaffRequest,
  ) {
    return this.service.saveLocalizedPageDocument(
      body.pageKey,
      requireEditablePublicContentLocale(body.locale),
      body.puckData,
      body.metadata,
      body.editorVersion,
      body.expectedUpdatedAt,
      req.user,
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
    return this.service.publishLocalizedPageDocument(
      body?.pageKey || "home",
      requireEditablePublicContentLocale(body.locale),
      req.user,
      body.expectedUpdatedAt,
      body.expectedContentHash,
      body.selfReviewAcknowledged ?? false,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Delete("document/draft")
  @ApiOperation({ summary: "放弃草稿并恢复为线上版本（乐观锁防护）" })
  discardDocumentDraft(
    @Query("pageKey") pageKey: string,
    @Query("expectedUpdatedAt") expectedUpdatedAt: string,
    @Query("locale") locale?: string,
    @Req() req?: StaffRequest,
  ) {
    return this.service.discardLocalizedPageDocumentDraft(
      pageKey || "home",
      requireEditablePublicContentLocale(locale),
      expectedUpdatedAt,
      req?.user,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Post("document/validate")
  @ApiOperation({ summary: "预检页面文档是否可发布（发布前校验）" })
  validateDocument(
    @Body() body: ValidatePageDocumentDto,
    @Req() req: StaffRequest,
  ) {
    return this.service.validateLocalizedPageDocument(
      body?.pageKey || "home",
      requireEditablePublicContentLocale(body.locale),
      body?.puckData,
      body?.metadata,
      req.user,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get("document/revisions")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  @ApiOperation({ summary: "获取页面文档版本历史" })
  getDocumentRevisions(
    @Query("pageKey") pageKey: string,
    @Query("beforeVersion") beforeVersion?: string,
    @Query("limit") limit?: string,
    @Query("locale") locale?: string,
    @Req() req?: StaffRequest,
  ) {
    const args = [
      pageKey || "home",
      beforeVersion === undefined ? undefined : Number(beforeVersion),
      limit === undefined ? undefined : Number(limit),
    ] as const;
    return this.service.getLocalizedPageDocumentRevisions(
      pageKey || "home",
      parsePublicContentLocale(locale),
      args[1],
      args[2],
      req?.user,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Get("document/revisions/:version")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  @ApiOperation({ summary: "获取可信页面文档单版本详情" })
  getDocumentRevision(
    @Query("pageKey") pageKey: string,
    @Query("locale") locale: string | undefined,
    @Param("version") version: string,
    @Req() req?: StaffRequest,
  ) {
    return this.service.getLocalizedPageDocumentRevision(
      pageKey || "home",
      parsePublicContentLocale(locale),
      Number(version),
      req?.user,
    );
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
    return this.service.restoreLocalizedPageDocumentRevision(
      body.pageKey || "home",
      requireEditablePublicContentLocale(body.locale),
      Number(version),
      body.expectedUpdatedAt,
      req.user,
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
    return this.service.rollbackLocalizedPagePublication(
      body.pageKey || "home",
      requireEditablePublicContentLocale(body.locale),
      Number(revisionId),
      body.expectedPublishedRevisionId,
      req.user,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Post("document/review/submit")
  @SkipGenericAudit()
  @ApiOperation({ summary: "提交当前语言页面草稿审核" })
  submitDocumentReview(
    @Body() body: SubmitPageDocumentReviewDto,
    @Req() req: StaffRequest,
  ) {
    return this.service.submitLocalizedPageDocumentReview(
      body.pageKey || "home",
      requireEditablePublicContentLocale(body.locale),
      body.expectedUpdatedAt,
      body.expectedContentHash,
      req.user,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "ADMIN")
  @Put("document/review")
  @SkipGenericAudit()
  @ApiOperation({ summary: "复核当前语言页面草稿" })
  reviewDocument(
    @Body() body: ReviewPageDocumentDto,
    @Req() req: StaffRequest,
  ) {
    return this.service.reviewLocalizedPageDocument(
      body.pageKey || "home",
      requireEditablePublicContentLocale(body.locale),
      body.action,
      body.expectedUpdatedAt,
      body.expectedContentHash,
      req.user,
      body.reviewNote,
      body.selfReviewAcknowledged ?? false,
    );
  }
}
