import {
  Body,
  Controller,
  Delete,
  Get,
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
import {
  CreateDynamicTemplateDto,
  PublishDynamicTemplateDto,
  SaveDynamicTemplateAsDto,
  UpdateDynamicTemplateDraftDto,
} from "./dto";
import { DynamicTemplatesService } from "./dynamic-templates.service";
import { PageModulesService } from "./page-modules.service";

@ApiTags("母模板")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SUPER_ADMIN", "ADMIN", "EDITOR")
@Controller("page-modules/dynamic-templates")
export class DynamicTemplatesController {
  constructor(
    private readonly service: DynamicTemplatesService,
    private readonly pageModules: PageModulesService,
  ) {}

  @Get("catalog")
  @ApiOperation({ summary: "获取统一母模板目录（正式版本、可编辑草稿与只读兼容来源）" })
  async listCatalog(@Req() req: StaffRequest) {
    const [published, systemCompatibility, personalCompatibility, editable] = await Promise.all([
      this.service.listPublished(),
      this.pageModules.getSystemContentTemplates(),
      this.pageModules.getPersonalContentTemplates(req.user.id),
      req.user.role === "SUPER_ADMIN" ? this.service.listMine(req.user.id) : Promise.resolve([]),
    ]);
    return {
      items: [
        ...published.map((template) => ({ kind: "published" as const, template })),
        ...editable.map((template) => ({ kind: "editable" as const, template })),
        ...systemCompatibility.map((template) => ({ kind: "system-compatibility" as const, template })),
        ...personalCompatibility.map((template) => ({ kind: "personal-compatibility" as const, template })),
      ],
    };
  }

  @Get("published")
  @ApiOperation({ summary: "获取后台可用的母模板正式版本" })
  listPublished() {
    return this.service.listPublished();
  }

  @Get("published/:templateId/versions/:version")
  @ApiOperation({ summary: "获取指定母模板正式版本" })
  getPublishedVersion(
    @Param("templateId") templateId: string,
    @Param("version") version: string,
  ) {
    return this.service.getPublishedVersion(templateId, Number(version));
  }

  @Roles("SUPER_ADMIN")
  @Get("mine")
  @ApiOperation({ summary: "获取当前管理员拥有的母模板与草稿" })
  listMine(@Req() req: StaffRequest) {
    return this.service.listMine(req.user.id);
  }

  @Roles("SUPER_ADMIN")
  @Post()
  @ApiOperation({ summary: "创建母模板草稿；旧系统来源保持全局 SYSTEM 身份" })
  create(@Body() body: CreateDynamicTemplateDto, @Req() req: StaffRequest) {
    return this.service.create(req.user.id, body);
  }

  @Roles("SUPER_ADMIN")
  @Get(":templateId/draft")
  @ApiOperation({ summary: "获取当前管理员拥有的母模板草稿" })
  getDraft(@Param("templateId") templateId: string, @Req() req: StaffRequest) {
    return this.service.getDraft(req.user.id, templateId);
  }

  @Roles("SUPER_ADMIN")
  @Patch(":templateId/draft")
  @ApiOperation({ summary: "以乐观 revision 保存母模板草稿" })
  updateDraft(
    @Param("templateId") templateId: string,
    @Body() body: UpdateDynamicTemplateDraftDto,
    @Req() req: StaffRequest,
  ) {
    return this.service.updateDraft(req.user.id, templateId, body);
  }

  @Roles("SUPER_ADMIN")
  @Post(":templateId/save-as")
  @ApiOperation({ summary: "把当前母模板另存为新 templateId" })
  saveAs(
    @Param("templateId") templateId: string,
    @Body() body: SaveDynamicTemplateAsDto,
    @Req() req: StaffRequest,
  ) {
    return this.service.saveAs(req.user.id, templateId, body);
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
    return this.service.publish(req.user.id, templateId, body);
  }

  @Roles("SUPER_ADMIN")
  @Get(":templateId/versions")
  @ApiOperation({ summary: "获取当前管理员模板的版本历史" })
  listVersions(
    @Param("templateId") templateId: string,
    @Req() req: StaffRequest,
    @Query("beforeVersion") beforeVersion?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listVersions(
      req.user.id,
      templateId,
      beforeVersion === undefined ? undefined : Number(beforeVersion),
      limit === undefined ? undefined : Number(limit),
    );
  }

  @Roles("SUPER_ADMIN")
  @Post(":templateId/archive")
  @SkipGenericAudit()
  @ApiOperation({ summary: "将当前管理员可编辑的母模板移入回收站" })
  archive(@Param("templateId") templateId: string, @Req() req: StaffRequest) {
    return this.service.archive(req.user.id, templateId);
  }

  @Roles("SUPER_ADMIN")
  @Post(":templateId/restore")
  @SkipGenericAudit()
  @ApiOperation({ summary: "从回收站恢复当前管理员可编辑的母模板" })
  restore(@Param("templateId") templateId: string, @Req() req: StaffRequest) {
    return this.service.restore(req.user.id, templateId);
  }

  @Roles("SUPER_ADMIN")
  @Delete(":templateId")
  @SkipGenericAudit()
  @ApiOperation({ summary: "永久删除回收站中从未发布且未被引用的 CUSTOM 模板草稿" })
  deleteDraft(@Param("templateId") templateId: string, @Req() req: StaffRequest) {
    return this.service.deleteDraft(req.user.id, templateId);
  }
}
