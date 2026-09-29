import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator";
import { SkipGenericAudit } from "../../common/decorators/skip-generic-audit.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { StaffRequest } from "../../common/security/authenticated-principal";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Throttle } from "@nestjs/throttler";
import {
  ArchiveDynamicTemplateDto,
  CreateDynamicTemplateDto,
  PublishDynamicTemplateDto,
  RebuildDynamicTemplateDraftFromPublishedDto,
  UpdateDynamicTemplateCatalogCoverDto,
  UpdateDynamicTemplateDraftDto,
} from "./dto";
import { DynamicTemplatesService } from "./dynamic-templates.service";

/** 模板目录与版本读取会在保存/发布后连续刷新；不能与全局 60/min 共用同一拒绝阈值。 */
const STAFF_TEMPLATE_READ_THROTTLE = { default: { limit: 600, ttl: 60_000 } };

@ApiTags("母模板")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
@Controller("page-modules/dynamic-templates")
export class DynamicTemplatesController {
  constructor(private readonly service: DynamicTemplatesService) {}

  @Get("catalog")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  @Throttle(STAFF_TEMPLATE_READ_THROTTLE)
  @ApiOperation({ summary: "获取统一母模板目录（正式版本与可编辑草稿）" })
  async listCatalog(@Req() req: StaffRequest) {
    return this.service.listCatalog(req.user);
  }

  @Roles("SUPER_ADMIN")
  @Post("consultation-starters")
  @ApiOperation({ summary: "安装咨询站页面装修起步模板（幂等）" })
  ensureConsultationStarters(@Req() req: StaffRequest) {
    return this.service.ensureConsultationStarters(req.user);
  }

  @Get("published")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  @Throttle(STAFF_TEMPLATE_READ_THROTTLE)
  @ApiOperation({ summary: "获取后台可用的母模板正式版本" })
  listPublished(@Req() req: StaffRequest) {
    return this.service.listPublished(req.user);
  }

  @Get("published/:templateId/versions/:version")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  @Throttle(STAFF_TEMPLATE_READ_THROTTLE)
  @ApiOperation({ summary: "获取指定母模板正式版本" })
  getPublishedVersion(
    @Param("templateId") templateId: string,
    @Param("version") version: string,
    @Req() req: StaffRequest,
  ) {
    return this.service.getPublishedVersion(req.user, templateId, Number(version));
  }

  @Roles("SUPER_ADMIN")
  @Get("mine")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  @Throttle(STAFF_TEMPLATE_READ_THROTTLE)
  @ApiOperation({ summary: "获取当前管理员拥有的母模板与草稿" })
  listMine(@Req() req: StaffRequest) {
    return this.service.listMine(req.user);
  }

  @Roles("SUPER_ADMIN")
  @Post()
  @ApiOperation({ summary: "通过统一的新建模板流程创建母模板草稿" })
  create(@Body() body: CreateDynamicTemplateDto, @Req() req: StaffRequest) {
    return this.service.create(req.user, body);
  }

  @Roles("SUPER_ADMIN")
  @Get(":templateId/draft")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  @Throttle(STAFF_TEMPLATE_READ_THROTTLE)
  @ApiOperation({ summary: "获取当前管理员拥有的母模板草稿" })
  getDraft(@Param("templateId") templateId: string, @Req() req: StaffRequest) {
    return this.service.getDraft(req.user, templateId);
  }

  @Roles("SUPER_ADMIN")
  @Patch(":templateId/catalog-cover")
  @SkipGenericAudit()
  @ApiOperation({ summary: "更新模板组件库卡片预览图；不改变草稿或正式版本" })
  updateCatalogCover(
    @Param("templateId") templateId: string,
    @Body() body: UpdateDynamicTemplateCatalogCoverDto,
    @Req() req: StaffRequest,
  ) {
    return this.service.updateCatalogCover(req.user, templateId, body);
  }

  @Roles("SUPER_ADMIN")
  @Patch(":templateId/draft")
  @ApiOperation({ summary: "以乐观 revision 保存母模板草稿" })
  updateDraft(
    @Param("templateId") templateId: string,
    @Body() body: UpdateDynamicTemplateDraftDto,
    @Req() req: StaffRequest,
  ) {
    return this.service.updateDraft(req.user, templateId, body);
  }

  @Roles("SUPER_ADMIN")
  @Post(":templateId/draft/from-published")
  @SkipGenericAudit()
  @ApiOperation({ summary: "从当前精确正式版本重建缺失的可编辑草稿" })
  rebuildDraftFromPublished(
    @Param("templateId") templateId: string,
    @Body() body: RebuildDynamicTemplateDraftFromPublishedDto,
    @Req() req: StaffRequest,
  ) {
    return this.service.rebuildDraftFromPublished(req.user, templateId, body);
  }

  @Roles("SUPER_ADMIN")
  @Post(":templateId/publish")
  @SkipGenericAudit()
  @ApiOperation({ summary: "发布不可变模板版本；不升级任何页面实例" })
  publish(
    @Param("templateId") templateId: string,
    @Body() body: PublishDynamicTemplateDto,
    @Req() req: StaffRequest,
  ) {
    return this.service.publish(req.user, templateId, body);
  }

  @Roles("SUPER_ADMIN")
  @Get(":templateId/versions")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Vary", "Cookie, Authorization")
  @Throttle(STAFF_TEMPLATE_READ_THROTTLE)
  @ApiOperation({ summary: "获取当前管理员模板的版本历史" })
  listVersions(
    @Param("templateId") templateId: string,
    @Req() req: StaffRequest,
    @Query("beforeVersion") beforeVersion?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listVersions(
      req.user,
      templateId,
      beforeVersion === undefined ? undefined : Number(beforeVersion),
      limit === undefined ? undefined : Number(limit),
    );
  }

  @Roles("SUPER_ADMIN")
  @Post(":templateId/archive")
  @SkipGenericAudit()
  @ApiOperation({ summary: "将当前管理员可编辑的母模板移入回收站" })
  archive(
    @Param("templateId") templateId: string,
    @Body() body: ArchiveDynamicTemplateDto,
    @Req() req: StaffRequest,
  ) {
    return this.service.archive(req.user, templateId, body);
  }

  @Roles("SUPER_ADMIN")
  @Post(":templateId/restore")
  @SkipGenericAudit()
  @ApiOperation({ summary: "从回收站恢复当前管理员可编辑的母模板" })
  restore(@Param("templateId") templateId: string, @Req() req: StaffRequest) {
    return this.service.restore(req.user, templateId);
  }

  @Roles("SUPER_ADMIN")
  @Delete(":templateId")
  @SkipGenericAudit()
  @ApiOperation({ summary: "永久删除回收站中从未发布且未被引用的 CUSTOM 模板草稿" })
  deleteDraft(@Param("templateId") templateId: string, @Req() req: StaffRequest) {
    return this.service.deleteDraft(req.user, templateId);
  }
}
