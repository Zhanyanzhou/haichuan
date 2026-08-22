import {
  BadRequestException,
  ConflictException,
  Injectable,
  MessageEvent,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EventEmitter } from "events";
import { existsSync } from "fs";
import { relative, resolve, sep } from "path";
import { fromEvent, interval, map, merge, Observable, startWith } from "rxjs";
import {
  CONTENT_TEMPLATE_ASSET_POLICY,
  CONTENT_TEMPLATE_BY_MODULE_TYPE,
  getContentTemplatePageRule,
  getContentTemplateIssues,
  getContentTemplateCompletion,
  isContentTemplateAllowedForPage,
  type ContentTemplateIssue,
} from "./content-template-contract";

/**
 * 页面构建器区块类型契约 — 与前端 puckConfig MyComponents 严格一致,
 * 由 scripts/verify-page-builder-contract.mjs 双向校验,变更任一侧必须同步另一侧。
 * 旧类型(图文混排/分割面板/礼赠指南)已由前端 migratePuckData 在载入时转换,
 * 新保存的草稿不再包含,故不列入本契约。
 */
const PUCK_COMPONENT_LABELS = [
  "首屏主视觉",
  "单图海报",
  "双图海报",
  "全屏出血图",
  "文字横幅",
  "作品画廊",
  "改款对比",
  "产品展示行",
  "分类卡片",
  "卡片网格",
  "轮播图",
  "视频区块",
  "热区图",
  "网站全局设置",
  "业务功能区",
  "预约入口",
  "资质证书",
  "定制流程",
  "服务承诺",
  "门店信息",
  "单品焦点推荐",
  "佩戴灵感",
  "限时活动",
  "真实评价与实拍",
  "按场景选购",
] as const;

const PUCK_COMPONENT_SET = new Set<string>(PUCK_COMPONENT_LABELS);
const EDITOR_ONLY_COMPONENTS = new Set(["网站全局设置", "业务功能区"]);

const PUCK_REQUIRED_IMAGE_FIELDS: Record<string, string[]> = {
  首屏主视觉: ["desktopImage"],
  单图海报: ["desktopImage"],
  双图海报: ["mainImage", "detailImage"],
  全屏出血图: ["image"],
  热区图: ["image"],
  改款对比: ["beforeImage", "afterImage"],
};

const PUCK_IMAGE_FIELDS = [
  "desktopImage",
  "mobileImage",
  "mainImage",
  "detailImage",
  "image",
  "posterUrl",
  "url",
  "backgroundImage",
  // 文字横幅背景图(与 appointment 的 backgroundImage 是不同键)
  "bgImage",
  "beforeImage",
  "afterImage",
];

const PUCK_LINK_FIELDS = ["linkUrl", "link", "mapUrl", "secondaryLinkUrl"];

/**
 * 发布校验：单页可见组件总数上限。
 * 防止超长页面拖垮前台渲染与首屏性能；与编辑器无强耦合，仅发布时兜底。
 */
const MAX_VISIBLE_BLOCKS = 60;

/**
 * 发布校验：关键字段文本长度上限（字段名 → 最大字符数）。
 * 取值宽松以覆盖合理运营数据，超出视为异常输入（如把整篇文章误填进标题）。
 * 适用于所有组件的同名字段，无需按组件类型分支；前端发布预检调用同一接口，规则天然一致。
 */
const PUCK_TEXT_FIELD_LIMITS: Record<string, number> = {
  title: 100,
  subtitle: 200,
  summary: 200,
  description: 2000,
  body: 2000,
  text: 2000,
  content: 2000,
  buttonText: 30,
  actionText: 30,
  primaryText: 30,
  secondaryText: 30,
  altText: 120,
  mainAltText: 120,
  detailAltText: 120,
  imageAlt: 120,
  label: 60,
  eyebrow: 60,
  number: 12,
  phone: 30,
};

/**
 * 发布校验：页面 SEO/OG 字段长度上限（字段名 → 最大字符数）。
 * 与搜索引擎/社交分享的常见展示宽度对齐，宽松取值。
 */
const PUCK_SEO_LIMITS: Record<string, number> = {
  seoTitle: 120,
  seoDescription: 320,
};

/**
 * 发布校验：占位文案关键词。
 * 默认模板与新增模块内置的文案及素材占位状态，运营未替换时不得发布到前台。
 */
const PLACEHOLDER_MARKERS = [
  "待确认",
  "待配置",
  "请填写",
  CONTENT_TEMPLATE_ASSET_POLICY.placeholder.label,
  CONTENT_TEMPLATE_ASSET_POLICY.placeholder.badge,
  CONTENT_TEMPLATE_ASSET_POLICY.placeholder.status,
];

@Injectable()
export class PageModulesService {
  private readonly publicEvents = new EventEmitter();
  private readonly uploadsRoot = resolve(process.cwd(), "uploads");

  constructor(private prisma: PrismaService) {
    // 每条 SSE 连接都会订阅发布事件，连接数随并发前台用户增长；
    // 关闭默认上限避免误报 EventEmitter 内存泄漏告警
    this.publicEvents.setMaxListeners(0);
  }

  publicChangeStream(): Observable<MessageEvent> {
    const publishEvents = fromEvent(this.publicEvents, "page-published").pipe(
      map((data) => ({ data }) as MessageEvent),
    );
    const heartbeatEvents = interval(25000).pipe(
      map(
        () =>
          ({
            data: { type: "heartbeat", changedAt: new Date().toISOString() },
          }) as MessageEvent,
      ),
    );

    return merge(publishEvents, heartbeatEvents).pipe(
      startWith({ data: { type: "ready" } } as MessageEvent),
    );
  }

  async getPageDocument(pageKey: string) {
    return this.prisma.pageDocument.findUnique({ where: { pageKey } });
  }

  /**
   * 前台只能读取最后一次已发布的快照。编辑草稿会覆盖 PageDocument，
   * 因此不能直接把草稿文档暴露给公共接口。
   */
  async getPublishedPageDocument(pageKey: string) {
    const document = await this.prisma.pageDocument.findUnique({
      where: { pageKey },
    });
    if (!document) return null;

    const revision = await this.prisma.pageDocumentRevision.findFirst({
      where: { documentId: document.id, status: "published" },
      orderBy: { version: "desc" },
    });
    if (!revision) return null;

    return {
      ...document,
      puckData: revision.puckData,
      metadata: revision.metadata,
      status: "PUBLISHED",
      publishedAt: revision.publishedAt,
      publishedBy: revision.publishedBy,
      // 公开响应必须只描述发布快照，不能混入后台草稿的更新时间。
      updatedAt: revision.publishedAt ?? revision.createdAt,
      version: revision.version,
    };
  }

  async savePageDocument(
    pageKey: string,
    puckData: any,
    metadata?: any,
    editorVersion?: string,
    expectedUpdatedAt?: string,
  ) {
    // 区块合同版本只存在于 puckData.props.__contentTemplate。页面级摘要仅兼容旧数据读取，
    // 普通保存不得重新写入，更不能借用 schemaVersion/templateVersion 标记区块合同。
    const metadataWithoutContract =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? Object.fromEntries(
            Object.entries(metadata).filter(
              ([key]) => key !== "contentTemplateContract",
            ),
          )
        : metadata || {};
    const existing = await this.prisma.pageDocument.findUnique({
      where: { pageKey },
    });
    if (existing) {
      const expected = this.parseExpectedUpdatedAt(expectedUpdatedAt);
      if (expected && existing.updatedAt.getTime() !== expected.getTime()) {
        throw new ConflictException(
          "该页面已被其他编辑者更新，请重新加载后再保存",
        );
      }

      // 通过 updatedAt 做乐观锁，避免两个浏览器的自动保存发生乱序覆盖。
      const updated = await this.prisma.pageDocument.updateMany({
        where: { pageKey, updatedAt: existing.updatedAt },
        data: {
          puckData,
          metadata: metadataWithoutContract,
          editorVersion,
          status: "DRAFT",
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          "该页面刚刚被其他编辑者更新，请重新加载后再保存",
        );
      }
      return this.prisma.pageDocument.findUnique({ where: { pageKey } });
    }
    return this.prisma.pageDocument.create({
      data: {
        pageKey,
        puckData,
        metadata: metadataWithoutContract,
        editorVersion,
        schemaVersion: 1,
      },
    });
  }

  async publishPageDocument(
    pageKey: string,
    userId?: number,
    expectedUpdatedAt?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      // 锁定当前页面文档，串行化同一页面的版本号分配，避免并发发布生成重复版本。
      await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM page_documents WHERE pageKey = ${pageKey} FOR UPDATE
      `;
      const doc = await tx.pageDocument.findUnique({
        where: { pageKey },
      });
      if (!doc) throw new Error("Page document not found");
      const expected = this.parseExpectedUpdatedAt(expectedUpdatedAt);
      if (expected && doc.updatedAt.getTime() !== expected.getTime()) {
        throw new ConflictException(
          "该页面已被其他编辑者更新，请重新加载后再发布",
        );
      }
      const validation = await this.collectPageDocumentValidation(
        tx,
        doc.puckData,
        doc.metadata,
        pageKey,
      );
      const errors = validation.errors;
      if (errors.length > 0) {
        const visibleErrors = errors.slice(0, 8).join("；");
        const suffix =
          errors.length > 8 ? `；另有 ${errors.length - 8} 个问题` : "";
        throw new BadRequestException({
          message: `页面发布校验失败：${visibleErrors}${suffix}`,
          valid: false,
          errors,
          issues: validation.issues,
        });
      }

      // Save revision
      const lastRev = await tx.pageDocumentRevision.findFirst({
        where: { documentId: doc.id },
        orderBy: { version: "desc" },
      });
      const nextVersion = (lastRev?.version || 0) + 1;
      const publishedAt = new Date();

      await tx.pageDocumentRevision.create({
        data: {
          documentId: doc.id,
          version: nextVersion,
          puckData: doc.puckData as any,
          metadata: doc.metadata as any,
          status: "published",
          publishedBy: userId,
          publishedAt,
        },
      });

      // 仅保留最新 50 条发布历史，避免 revisions 表无上限增长
      const keepVersion = nextVersion - 49;
      if (keepVersion > 1) {
        await tx.pageDocumentRevision.deleteMany({
          where: { documentId: doc.id, version: { lt: keepVersion } },
        });
      }

      const published = await tx.pageDocument.update({
        where: { id: doc.id },
        data: {
          status: "PUBLISHED",
          publishedAt,
          publishedBy: userId,
        },
      });
      return { published, nextVersion };
    });

    this.notifyPublicChange(
      pageKey,
      "page-document-published",
      result.nextVersion,
    );
    return result.published;
  }

  async validatePageDocument(
    pageKey: string,
    puckDataOverride?: any,
    metadataOverride?: any,
  ) {
    let puckData = puckDataOverride;
    let metadata = metadataOverride;
    if (puckData === undefined || metadata === undefined) {
      const doc = await this.prisma.pageDocument.findUnique({
        where: { pageKey },
      });
      if (!doc) {
        const issues: ContentTemplateIssue[] = [
          this.createServerValidationIssue("页面草稿不存在"),
        ];
        return { valid: false, errors: ["页面草稿不存在"], issues };
      }
      if (puckData === undefined) puckData = doc.puckData;
      if (metadata === undefined) metadata = doc.metadata;
    }
    const validation = await this.collectPageDocumentValidation(
      this.prisma,
      puckData,
      metadata,
      pageKey,
    );
    return validation;
  }

  private async collectPageDocumentValidation(
    db: any,
    puckData: any,
    metadata: any,
    pageKey: string,
  ): Promise<{ valid: boolean; errors: string[]; issues: ContentTemplateIssue[] }> {
    const issues = [
      ...this.collectContentTemplateIssues(puckData),
      ...(await this.collectPuckDataErrors(db, puckData, pageKey)),
      ...this.collectMetadataErrors(metadata).map((message) =>
        this.createServerValidationIssue(message, "metadata"),
      ),
    ];
    const errors = issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message);
    return { valid: errors.length === 0, errors, issues };
  }

  private collectContentTemplateIssues(puckData: unknown): ContentTemplateIssue[] {
    if (!puckData || typeof puckData !== "object") return [];
    const document = puckData as {
      content?: unknown;
      zones?: Record<string, unknown>;
    };
    const issues: ContentTemplateIssue[] = [];
    const collectBlock = (block: unknown, path: string) => {
      if (!block || typeof block !== "object") return;
      const value = block as { type?: unknown; props?: unknown };
      const props = value.props && typeof value.props === "object"
        ? value.props as Record<string, unknown>
        : undefined;
      issues.push(
        ...getContentTemplateIssues({
          moduleType: value.type,
          props,
          blockId: props?.id,
          path: `${path}.props.__contentTemplate`,
        }),
      );
    };
    if (Array.isArray(document.content)) {
      document.content.forEach((block, index) =>
        collectBlock(block, `content[${index}]`),
      );
    }
    if (document.zones && typeof document.zones === "object") {
      Object.entries(document.zones).forEach(([zoneKey, blocks]) => {
        if (!Array.isArray(blocks)) return;
        blocks.forEach((block, index) =>
          collectBlock(block, `zones.${zoneKey}[${index}]`),
        );
      });
    }
    return issues;
  }

  private createServerValidationIssue(
    message: string,
    path = "puckData",
    blockId?: string,
    field?: string,
    index?: number,
  ): ContentTemplateIssue {
    return {
      code: field ? `page-validation-${field}` : "page-validation",
      severity: "error",
      layer: "page",
      ...(blockId ? { blockId } : {}),
      ...(field ? { field } : {}),
      ...(index !== undefined ? { index } : {}),
      path,
      message,
    };
  }

  private async collectPuckDataErrors(
    db: any,
    puckData: any,
    pageKey = "",
  ): Promise<ContentTemplateIssue[]> {
    const errors: string[] = [];
    const errorContexts: Array<
      { blockId?: string; path?: string; field?: string; index?: number } | undefined
    > = [];
    const productIds = new Set<number>();
    const productCodes = new Set<string>();
    const productReferences = new Map<
      number,
      Array<{ blockId?: string; path: string; label: string; field: string; index?: number }>
    >();
    const productCodeReferences = new Map<
      string,
      Array<{ blockId?: string; path: string; label: string; field: string; index?: number }>
    >();
    const categorySlugs = new Set<string>();
    const categoryReferences = new Map<
      string,
      Array<{ blockId?: string; path: string; label: string; field: string; index: number }>
    >();
    const missingUploadUrls = new Set<string>();
    const pageRule = getContentTemplatePageRule(pageKey);
    if (!/^[a-z0-9-]{1,50}$/i.test(pageKey)) {
      errors.push("页面标识不合法");
    }

    if (!puckData || typeof puckData !== "object") {
      return [this.createServerValidationIssue("页面数据为空或格式不正确")];
    }

    if (!Array.isArray(puckData.content)) {
      errors.push("页面内容 content 必须是数组");
    }

    const validateBlock = (block: any, path: string, displayPath: string) => {
      const errorStartIndex = errors.length;
      const attachBlockContext = (props?: Record<string, unknown>) => {
        const blockId = this.isNonEmptyString(props?.id) ? props.id : undefined;
        for (let index = errorStartIndex; index < errors.length; index += 1) {
          errorContexts[index] ??= { blockId, path };
        }
      };
      if (!block || typeof block !== "object") {
        errors.push(`${displayPath}：区块格式不正确`);
        attachBlockContext();
        return;
      }

      const type = typeof block.type === "string" ? block.type : "";
      const props = block.props;

      if (!type || !PUCK_COMPONENT_SET.has(type)) {
        errors.push(`${displayPath}：未知区块类型「${type || "空"}」`);
        attachBlockContext();
        return;
      }

      if (
        pageRule
        && CONTENT_TEMPLATE_BY_MODULE_TYPE[type]
        && !isContentTemplateAllowedForPage(pageKey, type)
      ) {
        errors.push(
          `${displayPath}「${type}」不适用于当前页面角色 ${pageRule.pageRole}`,
        );
      }

      if (!props || typeof props !== "object") {
        errors.push(`${displayPath}「${type}」：配置 props 不能为空`);
        attachBlockContext();
        return;
      }

      const displayName = this.isNonEmptyString(props.moduleName)
        ? props.moduleName.trim()
        : this.isNonEmptyString(props.title)
          ? props.title.trim()
          : type;
      const label = `${displayPath}「${displayName}」`;

      if (!this.isNonEmptyString(props.id)) {
        errors.push(`${label}：区块 ID 不能为空`);
      }

      // 编辑器说明区不会进入前台；隐藏区块也不应因未完成内容阻断其他模块发布。
      if (EDITOR_ONLY_COMPONENTS.has(type) || props.isVisible === false) {
        attachBlockContext(props);
        return;
      }

      // 文本长度兜底：防止异常超长输入（如整篇文章误填入标题）发布到前台
      const contentTemplate = CONTENT_TEMPLATE_BY_MODULE_TYPE[type];
      const textLimits = contentTemplate?.contentBudget.limits || PUCK_TEXT_FIELD_LIMITS;
      for (const [field, limit] of Object.entries(textLimits)) {
        const textValue = props[field];
        if (typeof textValue === "string" && textValue.length > limit) {
          errors.push(
            `${label}：${field} 文本过长（${textValue.length}/${limit} 字）`,
          );
        }
      }

      // 必填媒体检查统一走生成文件的权威实现：
      // getContentTemplateCompletion 内部用 getCompatibilityRoleValue 做
      // 合同 role id → Puck props 字段名的兼容映射（如 视频区块 coverImage→posterUrl），
      // 避免服务端直接读 props[coverImage] 读不到前端存的 posterUrl 而误报缺图。
      const completion = getContentTemplateCompletion(type, props);
      const requiredImageFields = completion
        ? completion.material.missing
        : (PUCK_REQUIRED_IMAGE_FIELDS[type] || []).filter((field) => !this.isNonEmptyString(props[field]));
      for (const field of requiredImageFields) {
        errors.push(`${label}：${field} 图片不能为空`);
      }

      const validateAsset = (value: unknown, assetLabel: string) => {
        if (!this.isNonEmptyString(value)) return;
        if (!this.isSafeAssetUrl(value)) {
          errors.push(`${assetLabel} 地址不合法`);
          return;
        }
        this.collectMissingUploadError(
          value,
          assetLabel,
          missingUploadUrls,
          errors,
        );
      };

      for (const field of PUCK_IMAGE_FIELDS) {
        validateAsset(props[field], `${label}：${field} 图片`);
      }

      validateAsset(props.videoUrl, `${label}：videoUrl 视频`);

      for (const field of PUCK_LINK_FIELDS) {
        const value = props[field];
        if (this.isNonEmptyString(value) && !this.isSafeLink(value)) {
          errors.push(`${label}：${field} 链接不合法`);
        }
      }

      if (contentTemplate?.supportsLinkTarget) {
        const targetType = typeof props.targetType === "string" ? props.targetType : "";
        const linkUrl = typeof props.linkUrl === "string" ? props.linkUrl.trim() : "";
        const productCode = this.isNonEmptyString(props.productCode) ? props.productCode.trim() : "";
        const productId = Number(props.productId);
        // 老版本没有 targetType 时保持旧 linkUrl 行为，任何新合同状态都必须完整。
        if (targetType === "none" && linkUrl) {
          errors.push(`${label}：不跳转时不能保留 linkUrl`);
        } else if (targetType === "product") {
          if (productCode) {
            productCodes.add(productCode);
            const references = productCodeReferences.get(productCode) ?? [];
            references.push({
              blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
              path: `${path}.productCode`,
              label,
              field: "productCode",
            });
            productCodeReferences.set(productCode, references);
          } else if (!Number.isInteger(productId) || productId <= 0) {
            errors.push(`${label}：商品跳转必须选择有效商品`);
          } else {
            productIds.add(productId);
            const references = productReferences.get(productId) ?? [];
            references.push({
              blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
              path: `${path}.productId`,
              label,
              field: "productId",
            });
            productReferences.set(productId, references);
          }
        } else if (targetType === "page") {
          if (!linkUrl) {
            errors.push(`${label}：站内页面跳转必须填写 linkUrl`);
          } else if (!linkUrl.startsWith("/") || linkUrl.startsWith("//")) {
            // 三件套 page 态是受控通道(UI 明确"不开放外部链接"),
            // 收紧到站内路径,防止外链通过发布后在前台被静默丢弃成死链
            errors.push(`${label}：站内页面跳转仅支持站内路径，不开放外部链接`);
          }
        } else if (targetType && !["none", "product", "page"].includes(targetType)) {
          errors.push(`${label}：targetType 不合法`);
        }
      }

      if (type === "视频区块" && !this.isNonEmptyString(props.videoUrl)) {
        errors.push(`${label}：videoUrl 视频地址不能为空`);
      }

      if (type === "预约入口") {
        const legacyLink = this.isNonEmptyString(props.linkUrl)
          ? props.linkUrl.trim()
          : "";
        const hasPrimaryTarget =
          (props.targetType === "page" && legacyLink.startsWith("/") && !legacyLink.startsWith("//")) ||
          props.targetType === "product" ||
          (!props.targetType && legacyLink.startsWith("/") && !legacyLink.startsWith("//"));
        if (!hasPrimaryTarget) {
          const errorIndex = errors.push(`${label}：主行动必须设置有效的站内去向`) - 1;
          errorContexts[errorIndex] = {
            blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
            path: `${path}.props.linkUrl`,
            field: "linkUrl",
          };
        }
        if (
          this.isNonEmptyString(props.phone) &&
          !/^\+?[\d\s-]{6,20}$/.test(props.phone.trim())
        ) {
          const errorIndex = errors.push(`${label}：咨询电话格式不正确`) - 1;
          errorContexts[errorIndex] = {
            blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
            path: `${path}.props.phone`,
            field: "phone",
          };
        }
      }

      if (type === "首屏主视觉") {
        const instanceOverrides = props.__instanceOverrides;
        const legacyCopyOverride = instanceOverrides?.textRoles?.copy;
        if (
          instanceOverrides?.version === 1 &&
          legacyCopyOverride?.enabled === true &&
          ![props.eyebrow, props.title, props.subtitle].some((value) =>
            this.isNonEmptyString(value),
          )
        ) {
          const errorIndex = errors.push(
            `${label}：已启用文字角色，请至少填写眉题、标题或副标题之一`,
          ) - 1;
          errorContexts[errorIndex] = {
            blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
            path: `${path}.props.title`,
            field: "title",
          };
        }

        if (instanceOverrides?.version === 2) {
          const roleLabels: Record<string, string> = {
            eyebrow: "眉题",
            title: "标题",
            subtitle: "副标题",
            actionText: "行动文字",
          };
          for (const [roleId, roleLabel] of Object.entries(roleLabels)) {
            if (
              instanceOverrides?.nodes?.[roleId]?.enabled === true &&
              !this.isNonEmptyString(props[roleId])
            ) {
              const errorIndex = errors.push(
                `${label}：已启用${roleLabel}角色，请填写${roleLabel}内容`,
              ) - 1;
              errorContexts[errorIndex] = {
                blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
                path: `${path}.props.${roleId}`,
                field: roleId,
              };
            }
          }
        }
      }

      // 图文混排的“纯文字”布局无需配图；其余布局必须提供图片。
      if (
        type === "图文混排" &&
        props.template !== "textOnly" &&
        !this.isNonEmptyString(props.image)
      ) {
        errors.push(`${label}：image 图片不能为空`);
      }

      const rejectPlaceholderText = (value: unknown, fieldLabel: string) => {
        if (typeof value !== "string") return;
        const trimmed = value.trim();
        if (!trimmed) return;
        if (PLACEHOLDER_MARKERS.some((marker) => trimmed.includes(marker))) {
          errors.push(
            `${label}：${fieldLabel}“${trimmed}”仍是占位内容，请填写正式文案`,
          );
        }
      };

      // 占位可能出现在普通文案、列表条目、alt、素材状态或后续新增结构中；
      // 递归检查当前区块的可序列化 props，避免只拦截少数已知模板而漏过新页面。
      const scanPlaceholderValues = (value: unknown, valuePath: string) => {
        if (typeof value === "string") {
          rejectPlaceholderText(value, valuePath);
          return;
        }
        if (Array.isArray(value)) {
          value.forEach((item, index) =>
            scanPlaceholderValues(item, `${valuePath}[${index}]`),
          );
          return;
        }
        if (value && typeof value === "object") {
          Object.entries(value).forEach(([key, item]) =>
            scanPlaceholderValues(item, `${valuePath}.${key}`),
          );
        }
      };
      scanPlaceholderValues(props, "配置");

      if (type === "产品展示行") {
        const codes = Array.isArray(props.productCodes)
          ? props.productCodes.map((code: unknown) => String(code).trim()).filter(Boolean)
          : [];
        if (codes.length > 0) {
          if (codes.length < 2 || codes.length > 8 || new Set(codes).size !== codes.length) {
            const errorIndex = errors.push(`${label}：请选择 2–8 件不重复的商品`) - 1;
            errorContexts[errorIndex] = { blockId: props.id, path: `${path}.props.productCodes`, field: "productCodes" };
          }
          codes.forEach((code: string, index: number) => {
            productCodes.add(code);
            const references = productCodeReferences.get(code) ?? [];
            references.push({ blockId: this.isNonEmptyString(props.id) ? props.id : undefined, path: `${path}.props.productCodes[${index}]`, label, field: "productCodes", index });
            productCodeReferences.set(code, references);
          });
        } else if (!Array.isArray(props.productIds)) {
          errors.push(`${label}：productCodes 或兼容 productIds 必须是商品引用数组`);
        } else {
          if (props.productIds.length < 2 || props.productIds.length > 8 || new Set(props.productIds.map(Number)).size !== props.productIds.length) {
            const errorIndex = errors.push(`${label}：请选择 2–8 件不重复的商品`) - 1;
            errorContexts[errorIndex] = { blockId: props.id, path: `${path}.props.productIds`, field: "productIds" };
          }
          for (const [index, id] of props.productIds.entries()) {
            const numericId = Number(id);
            if (!Number.isInteger(numericId) || numericId <= 0) {
              errors.push(`${label}：商品 ID「${id}」格式不正确`);
            } else {
              productIds.add(numericId);
              const references = productReferences.get(numericId) ?? [];
              references.push({
                blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
                path: `${path}.props.productIds[${index}]`,
                label,
                field: "productIds",
                index,
              });
              productReferences.set(numericId, references);
            }
          }
        }
      }

      if (type === "单品焦点推荐") {
        const productCode = this.isNonEmptyString(props.productCode) ? props.productCode.trim() : "";
        if (productCode) {
          productCodes.add(productCode);
          productCodeReferences.set(productCode, [{ blockId: this.isNonEmptyString(props.id) ? props.id : undefined, path: `${path}.props.productCode`, label, field: "productCode" }]);
        } else {
        const productId = Number(props.productId);
        if (!Number.isInteger(productId) || productId <= 0) {
          errors.push(`${label}：请选择 1 件有效的主推商品`);
        } else {
          productIds.add(productId);
          const references = productReferences.get(productId) ?? [];
          references.push({
            blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
            path: `${path}.props.productId`,
            label,
            field: "productId",
          });
          productReferences.set(productId, references);
        }
        }
      }

      if (type === "佩戴灵感") {
        const codes = Array.isArray(props.productCodes)
          ? props.productCodes.map((code: unknown) => String(code).trim()).filter(Boolean)
          : [];
        if (codes.length > 0) {
          if (codes.length > 4 || new Set(codes).size !== codes.length) {
            const errorIndex = errors.push(`${label}：关联商品必须是不重复的 1–4 件商品`) - 1;
            errorContexts[errorIndex] = { blockId: props.id, path: `${path}.props.productCodes`, field: "productCodes" };
          }
          codes.forEach((code: string, index: number) => {
            productCodes.add(code);
            const references = productCodeReferences.get(code) ?? [];
            references.push({ blockId: this.isNonEmptyString(props.id) ? props.id : undefined, path: `${path}.props.productCodes[${index}]`, label, field: "productCodes", index });
            productCodeReferences.set(code, references);
          });
        } else if (!Array.isArray(props.productIds)) {
          errors.push(`${label}：productCodes 或兼容 productIds 必须是商品引用数组`);
        } else {
          if (props.productIds.length < 1 || props.productIds.length > 4 || new Set(props.productIds.map(Number)).size !== props.productIds.length) {
            const errorIndex = errors.push(`${label}：关联商品必须是不重复的 1–4 件商品`) - 1;
            errorContexts[errorIndex] = { blockId: props.id, path: `${path}.props.productIds`, field: "productIds" };
          }
          for (const [index, id] of props.productIds.entries()) {
            const numericId = Number(id);
            if (!Number.isInteger(numericId) || numericId <= 0) {
              errors.push(`${label}：商品 ID「${id}」格式不正确`);
            } else {
              productIds.add(numericId);
              const references = productReferences.get(numericId) ?? [];
              references.push({
                blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
                path: `${path}.props.productIds[${index}]`,
                label,
                field: "productIds",
                index,
              });
              productReferences.set(numericId, references);
            }
          }
        }
      }

      if (
        type === "限时活动" &&
        !Number.isFinite(new Date(props.targetDate).getTime())
      ) {
        errors.push(`${label}：结束时间必须是有效的 ISO 日期时间`);
      }

      if (type === "轮播图") {
        if (!Array.isArray(props.images) || props.images.length === 0) {
          errors.push(`${label}：轮播图至少需要 1 张图片`);
        } else {
          props.images.forEach((item: any, index: number) => {
            if (!this.isNonEmptyString(item?.url)) {
              errors.push(`${label}：第 ${index + 1} 张轮播图片不能为空`);
            } else {
              validateAsset(item.url, `${label}：第 ${index + 1} 张轮播图片`);
            }
            validateAsset(
              item?.mobileUrl,
              `${label}：第 ${index + 1} 张轮播图移动端图片`,
            );
            // 条目级跳转:新三件套 linkUrl 与旧裸 link 都做安全校验
            for (const itemLinkField of ["link", "linkUrl"]) {
              if (
                this.isNonEmptyString(item?.[itemLinkField]) &&
                !this.isSafeLink(item[itemLinkField])
              ) {
                errors.push(
                  `${label}：第 ${index + 1} 张轮播链接不合法`,
                );
                break;
              }
            }
          });
        }
      }

      const validateNestedAssets = (
        items: unknown,
        itemLabel: string,
        fields: string[],
      ) => {
        if (!Array.isArray(items)) return;
        items.forEach((item, index) => {
          fields.forEach((field) => {
            validateAsset(
              item?.[field],
              `${label}：第 ${index + 1} 个${itemLabel}${field}`,
            );
          });
        });
      };

      const usesCategoryReferences =
        type === "分类卡片" &&
        Array.isArray(props.categorySlugs) &&
        props.categorySlugs.length > 0;
      if (!usesCategoryReferences) {
        validateNestedAssets(props.categories, "分类卡片的", ["image"]);
      }
      validateNestedAssets(props.items, "画廊图片的", ["image"]);
      validateNestedAssets(props.certificates, "证书的", ["imageUrl"]);
      validateNestedAssets(props.steps, "定制步骤的", ["image"]);
      validateNestedAssets(props.testimonials, "评价的", ["image"]);

      // 作品画廊:每张图片必填(与画廊契约一致)
      if (type === "作品画廊" && Array.isArray(props.items)) {
        props.items.forEach((item: any, index: number) => {
          if (!this.isNonEmptyString(item?.image)) {
            errors.push(`${label}：第 ${index + 1} 张画廊图片不能为空`);
          }
        });
      }

      if (type === "热区图" && Array.isArray(props.hotspots)) {
        props.hotspots.forEach((item: any, index: number) => {
          for (const itemLinkField of ["link", "linkUrl"]) {
            if (
              this.isNonEmptyString(item?.[itemLinkField]) &&
              !this.isSafeLink(item[itemLinkField])
            ) {
              errors.push(
                `${label}：第 ${index + 1} 个热区链接不合法`,
              );
              break;
            }
          }
        });
      }
      // 分类入口(分类卡片/按场景选购)条目级跳转安全校验
      if (
        (type === "按场景选购" || (type === "分类卡片" && !usesCategoryReferences)) &&
        Array.isArray(props.categories)
      ) {
        props.categories.forEach((item: any, index: number) => {
          for (const itemLinkField of ["link", "linkUrl"]) {
            if (
              this.isNonEmptyString(item?.[itemLinkField]) &&
              !this.isSafeLink(item[itemLinkField])
            ) {
              errors.push(
                `${label}：第 ${index + 1} 个分类入口链接不合法`,
              );
              break;
            }
          }
        });
      }
      if (usesCategoryReferences) {
        const slugs = props.categorySlugs
          .map((slug: unknown) => String(slug).trim())
          .filter(Boolean);
        if (slugs.length < 2 || slugs.length > 4 || new Set(slugs).size !== slugs.length) {
          const errorIndex = errors.push(`${label}：请选择 2–4 个不重复的真实分类`) - 1;
          errorContexts[errorIndex] = { blockId: props.id, path: `${path}.props.categorySlugs`, field: "categorySlugs" };
        }
        slugs.forEach((slug: string, index: number) => {
          categorySlugs.add(slug);
          const references = categoryReferences.get(slug) ?? [];
          references.push({ blockId: this.isNonEmptyString(props.id) ? props.id : undefined, path: `${path}.props.categorySlugs[${index}]`, label, field: "categorySlugs", index });
          categoryReferences.set(slug, references);
        });
      }
      attachBlockContext(props);
    };

    const visibleContentCount = Array.isArray(puckData.content)
      ? puckData.content.filter(
          (block: any) =>
            block &&
            typeof block === "object" &&
            block.props?.isVisible !== false &&
            !EDITOR_ONLY_COMPONENTS.has(block.type),
        ).length
      : 0;
    const visibleZoneCount =
      puckData.zones && typeof puckData.zones === "object"
        ? Object.values(puckData.zones).reduce(
            (count: number, zoneBlocks: unknown) =>
              count +
              (Array.isArray(zoneBlocks)
                ? zoneBlocks.filter(
                    (block: any) =>
                      block &&
                      typeof block === "object" &&
                      block.props?.isVisible !== false &&
                      !EDITOR_ONLY_COMPONENTS.has(block.type),
                  ).length
                : 0),
            0,
          )
        : 0;

    if (visibleContentCount + visibleZoneCount === 0) {
      errors.push("页面至少需要 1 个可见的前台内容模块");
    } else if (visibleContentCount + visibleZoneCount > MAX_VISIBLE_BLOCKS) {
      errors.push(
        `页面可见模块过多（${visibleContentCount + visibleZoneCount}/${MAX_VISIBLE_BLOCKS}），请精简后再发布`,
      );
    }

    const orderedVisibleBlocks = [
      ...(Array.isArray(puckData.content) ? puckData.content : []),
      ...(puckData.zones && typeof puckData.zones === "object"
        ? Object.values(puckData.zones).flatMap((blocks) =>
            Array.isArray(blocks) ? blocks : [],
          )
        : []),
    ].filter(
      (block: any) =>
        block &&
        typeof block === "object" &&
        block.props?.isVisible !== false &&
        !EDITOR_ONLY_COMPONENTS.has(block.type),
    );
    if (pageRule) {
      const rootContent = Array.isArray(puckData.content) ? puckData.content : [];
      const businessRegions = rootContent.filter(
        (block: any) => block?.type === "业务功能区",
      );
      if (businessRegions.length !== pageRule.businessRegionCount) {
        errors.push(
          `页面角色 ${pageRule.pageRole} 要求固定业务区数量为 ${pageRule.businessRegionCount}，当前为 ${businessRegions.length}`,
        );
      }
      businessRegions.forEach((block: any) => {
        if (block?.props?.pageKey !== pageKey || block?.props?.locked !== true) {
          errors.push("固定业务区必须属于当前页面且保持锁定");
        }
      });
      if (
        pageRule.businessRegionPosition === "after-first-brand-block"
        && rootContent.findIndex((block: any) => block?.type === "业务功能区") !== 1
      ) {
        errors.push("固定业务区必须紧随首个品牌框架模块之后");
      }
      if (pageRule.headerMode.configured === "overlay-light") {
        const firstTemplate = CONTENT_TEMPLATE_BY_MODULE_TYPE[
          orderedVisibleBlocks[0]?.type
        ];
        if (firstTemplate?.key !== pageRule.headerMode.overlayRequiresFirstTemplate) {
          errors.push("覆盖式浅色导航要求首个可见品牌模块为首屏主视觉");
        }
      }
    }
    const primaryStageIndexes = orderedVisibleBlocks
      .map((block: any, index: number) =>
        CONTENT_TEMPLATE_BY_MODULE_TYPE[block.type]?.visualRole === "primary-stage"
          ? index
          : -1,
      )
      .filter((index: number) => index >= 0);
    if (primaryStageIndexes.length > 1) {
      errors.push("每页最多只能有 1 个首屏主舞台（primary-stage）");
    }
    if (primaryStageIndexes.length === 1 && primaryStageIndexes[0] !== 0) {
      errors.push("首屏主舞台（primary-stage）必须是首个可见品牌内容区");
    }

    if (Array.isArray(puckData.content)) {
      puckData.content.forEach((block: any, index: number) => {
        validateBlock(block, `content[${index}]`, `第 ${index + 1} 个区块`);
      });
    }

    if (puckData.zones && typeof puckData.zones === "object") {
      Object.entries(puckData.zones).forEach(([zoneKey, zoneBlocks]) => {
        if (!Array.isArray(zoneBlocks)) {
          errors.push(`插槽 ${zoneKey}：内容必须是数组`);
          return;
        }
        zoneBlocks.forEach((block: any, index: number) => {
          validateBlock(
            block,
            `zones[${JSON.stringify(zoneKey)}][${index}]`,
            `插槽 ${zoneKey} 第 ${index + 1} 个区块`,
          );
        });
      });
    }

    if (productIds.size > 0) {
      // 发布文档对游客公开，关联商品必须与游客公开目录保持一致。
      const products = await db.product.findMany({
        where: {
          id: { in: [...productIds] },
          deletedAt: null,
          status: "PUBLISHED",
          visibility: "PUBLIC",
        },
        select: {
          id: true,
          listingImageId: true,
          primaryImageId: true,
          images: { take: 1, select: { id: true } },
        },
      });
      const publicProductIds = new Set(
        products
          .filter((item: { listingImageId: number | null; primaryImageId: number | null; images: Array<{ id: number }> }) => Boolean(item.listingImageId || item.primaryImageId || item.images.length))
          .map((item: { id: number }) => item.id),
      );
      for (const id of productIds) {
        if (!publicProductIds.has(id)) {
          const references = productReferences.get(id);
          if (references?.length) {
            for (const reference of references) {
              const errorIndex = errors.push(
                `${reference.label}：商品 ID ${id} 未满足公开发布条件（需已发布、公开可见且未删除）`,
              ) - 1;
              errorContexts[errorIndex] = {
                blockId: reference.blockId,
                path: reference.path,
                field: reference.field,
                index: reference.index,
              };
            }
          } else {
            errors.push(
              `页面引用的商品 ID ${id} 未满足公开发布条件（需已发布、公开可见且未删除）`,
            );
          }
        }
      }
    }

    if (productCodes.size > 0) {
      const products = await db.product.findMany({
        where: {
          code: { in: [...productCodes] },
          deletedAt: null,
          status: "PUBLISHED",
          visibility: "PUBLIC",
        },
        select: {
          code: true,
          listingImageId: true,
          primaryImageId: true,
          images: { take: 1, select: { id: true } },
        },
      });
      const publicProductCodes = new Set(
        products
          .filter((item: { listingImageId: number | null; primaryImageId: number | null; images: Array<{ id: number }> }) => Boolean(item.listingImageId || item.primaryImageId || item.images.length))
          .map((item: { code: string }) => item.code),
      );
      for (const code of productCodes) {
        if (publicProductCodes.has(code)) continue;
        for (const reference of productCodeReferences.get(code) ?? []) {
          const errorIndex = errors.push(
            `${reference.label}：商品 ${code} 未满足公开发布条件（需已发布、公开可见、未删除且有展示图）`,
          ) - 1;
          errorContexts[errorIndex] = {
            blockId: reference.blockId,
            path: reference.path,
            field: reference.field,
            index: reference.index,
          };
        }
      }
    }

    if (categorySlugs.size > 0) {
      const categories = await db.category.findMany({
        where: { isActive: true, deletedAt: null },
        select: {
          id: true,
          parentId: true,
          slug: true,
          coverImage: true,
          products: {
            where: { deletedAt: null, status: "PUBLISHED", visibility: "PUBLIC" },
            take: 1,
            select: { id: true },
          },
        },
      });
      const byId = new Map(categories.map((category: { id: number }) => [category.id, category]));
      const publicBranchIds = new Set<number>();
      for (const category of categories) {
        if (!category.products.length) continue;
        let current: typeof category | undefined = category;
        while (current) {
          publicBranchIds.add(current.id);
          current = current.parentId ? byId.get(current.parentId) : undefined;
        }
      }
      const eligibleSlugs = new Set(
        categories
          .filter((category: { id: number; coverImage: string | null }) => publicBranchIds.has(category.id) && Boolean(category.coverImage))
          .map((category: { slug: string }) => category.slug),
      );
      for (const slug of categorySlugs) {
        if (eligibleSlugs.has(slug)) continue;
        for (const reference of categoryReferences.get(slug) ?? []) {
          const errorIndex = errors.push(
            `${reference.label}：分类 ${slug} 未满足公开发布条件（需启用、未删除、有公开商品且有封面）`,
          ) - 1;
          errorContexts[errorIndex] = {
            blockId: reference.blockId,
            path: reference.path,
            field: reference.field,
            index: reference.index,
          };
        }
      }
    }

    return errors.map((message, index) =>
      this.createServerValidationIssue(
        message,
        errorContexts[index]?.path ?? "puckData",
        errorContexts[index]?.blockId,
        errorContexts[index]?.field,
        errorContexts[index]?.index,
      )
    );
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }

  /**
   * 校验页面 SEO/OG 元数据（存于 doc.metadata，不在 puckData 内）。
   * 与 collectPuckDataErrors 并列，作为发布校验单一源的一部分；
   * 前端预检与后端发布兜底都调用，规则一致。
   */
  private collectMetadataErrors(metadata: unknown): string[] {
    const errors: string[] = [];
    if (!metadata || typeof metadata !== "object") return errors;
    const m = metadata as Record<string, unknown>;
    for (const [field, limit] of Object.entries(PUCK_SEO_LIMITS)) {
      const value = m[field];
      if (typeof value === "string" && value.length > limit) {
        errors.push(`页面设置：${field} 过长（${value.length}/${limit} 字）`);
      }
    }
    const ogImage = m.ogImage;
    if (
      typeof ogImage === "string" &&
      ogImage.trim() &&
      !this.isSafeAssetUrl(ogImage)
    ) {
      errors.push("页面设置：ogImage 分享图地址不合法");
    }
    return errors;
  }

  private isSafeAssetUrl(value: string): boolean {
    const url = value.trim();
    if (url.startsWith("/") && !url.startsWith("//")) return true;
    return /^https?:\/\//i.test(url);
  }

  private isSafeLink(value: string): boolean {
    const url = value.trim();
    if ((url.startsWith("/") && !url.startsWith("//")) || url.startsWith("#"))
      return true;
    return /^https?:\/\//i.test(url);
  }

  private parseExpectedUpdatedAt(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("页面版本标识格式不正确");
    }
    return date;
  }

  /** 仅校验本地上传资源；外部 URL 由其源站负责可用性。 */
  private collectMissingUploadError(
    url: string,
    label: string,
    checkedUrls: Set<string>,
    errors: string[],
  ): void {
    if (!url.startsWith("/uploads/") || checkedUrls.has(url)) return;
    checkedUrls.add(url);

    const requestedPath = url.slice("/uploads/".length);
    const targetPath = resolve(this.uploadsRoot, requestedPath);
    const relativePath = relative(this.uploadsRoot, targetPath);
    const isWithinUploads =
      relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !relativePath.startsWith("../") &&
      !relativePath.startsWith("..\\");

    if (!isWithinUploads || !existsSync(targetPath)) {
      errors.push(`${label} 上传图片文件不存在，请重新上传后再发布`);
    }
  }

  async getPageDocumentRevisions(pageKey: string) {
    const doc = await this.prisma.pageDocument.findUnique({
      where: { pageKey },
    });
    if (!doc) return [];
    return this.prisma.pageDocumentRevision.findMany({
      where: { documentId: doc.id },
      orderBy: { version: "desc" },
      take: 20,
    });
  }

  async restorePageDocumentRevision(
    pageKey: string,
    version: number,
    expectedUpdatedAt: string,
  ) {
    if (!Number.isInteger(version) || version <= 0) {
      throw new BadRequestException("版本号不正确");
    }

    const expected = this.parseExpectedUpdatedAt(expectedUpdatedAt);
    if (!expected) {
      throw new BadRequestException("恢复版本时缺少页面版本标识");
    }

    const doc = await this.prisma.pageDocument.findUnique({
      where: { pageKey },
    });
    if (!doc) throw new BadRequestException("页面草稿不存在");
    if (doc.updatedAt.getTime() !== expected.getTime()) {
      throw new ConflictException(
        "该页面已被其他编辑者更新，请重新加载版本记录后再恢复",
      );
    }

    const revision = await this.prisma.pageDocumentRevision.findFirst({
      where: { documentId: doc.id, version },
    });
    if (!revision) throw new BadRequestException("指定版本不存在");

    // 查版本后仍可能发生并发保存；最终更新必须继续带上读取时的 updatedAt。
    const updated = await this.prisma.pageDocument.updateMany({
      where: { pageKey, updatedAt: doc.updatedAt },
      data: {
        puckData: revision.puckData as any,
        metadata: revision.metadata as any,
        status: "DRAFT",
        editorVersion: doc.editorVersion,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        "该页面刚刚被其他编辑者更新，请重新加载版本记录后再恢复",
      );
    }
    return this.prisma.pageDocument.findUnique({ where: { pageKey } });
  }

  private notifyPublicChange(
    pageKey: string,
    type: "page-document-published",
    version?: number,
  ): void {
    this.publicEvents.emit("page-published", {
      type,
      pageKey,
      version,
      changedAt: new Date().toISOString(),
    });
  }

  /* ═══════════ 页面装修方案（多套命名快照，2026-08-16） ═══════════
   * 与 revision 的职责区分：方案 = 运营主动保存的整页快照（可载入/删除/改名）；
   * revision = 发布历史（自动生成，仅回滚用）。每页上限 10 套（防膨胀）。 */

  private static readonly PAGE_SCHEME_LIMIT = 10;

  async listPageSchemes(pageKey: string) {
    const rows = await this.prisma.pageScheme.findMany({
      where: { pageKey },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        pageKey: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        puckData: true,
      },
    });
    // 列表轻量返回：元信息 + 区块数（微缩结构预览由前端按需取全量）
    return rows.map((row) => ({
      id: row.id,
      pageKey: row.pageKey,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      blockCount: Array.isArray((row.puckData as any)?.content)
        ? (row.puckData as any).content.filter(
            (block: any) => block?.type && block.type !== "业务功能区",
          ).length
        : 0,
    }));
  }

  async getPageScheme(id: number) {
    const scheme = await this.prisma.pageScheme.findUnique({ where: { id } });
    if (!scheme) throw new BadRequestException("装修方案不存在");
    return scheme;
  }

  async savePageScheme(input: {
    pageKey: string;
    name: string;
    puckData: any;
    metadata?: any;
    createdBy?: number | null;
  }) {
    const name = (input.name || "").trim();
    if (!name) throw new BadRequestException("方案名称不能为空");
    const existing = await this.prisma.pageScheme.findUnique({
      where: { pageKey_name: { pageKey: input.pageKey, name } },
    });
    if (existing) {
      throw new ConflictException("同名方案已存在，请换一个名称保存");
    }
    const count = await this.prisma.pageScheme.count({
      where: { pageKey: input.pageKey },
    });
    if (count >= PageModulesService.PAGE_SCHEME_LIMIT) {
      throw new BadRequestException(
        `每页最多保存 ${PageModulesService.PAGE_SCHEME_LIMIT} 套方案，请先删除旧方案`,
      );
    }
    return this.prisma.pageScheme.create({
      data: {
        pageKey: input.pageKey,
        name,
        puckData: input.puckData,
        metadata: (input.metadata ?? {}) as any,
        createdBy: input.createdBy ?? null,
      },
    });
  }

  async updatePageScheme(
    id: number,
    input: { name?: string; puckData?: any; metadata?: any },
  ) {
    const scheme = await this.prisma.pageScheme.findUnique({ where: { id } });
    if (!scheme) throw new BadRequestException("装修方案不存在");
    const data: Record<string, unknown> = {};
    if (typeof input.name === "string") {
      const name = input.name.trim();
      if (!name) throw new BadRequestException("方案名称不能为空");
      if (name !== scheme.name) {
        const clash = await this.prisma.pageScheme.findUnique({
          where: { pageKey_name: { pageKey: scheme.pageKey, name } },
        });
        if (clash) throw new ConflictException("同名方案已存在");
      }
      data.name = name;
    }
    if (input.puckData !== undefined) data.puckData = input.puckData;
    if (input.metadata !== undefined) data.metadata = input.metadata;
    return this.prisma.pageScheme.update({ where: { id }, data: data as any });
  }

  async deletePageScheme(id: number) {
    const scheme = await this.prisma.pageScheme.findUnique({ where: { id } });
    if (!scheme) throw new BadRequestException("装修方案不存在");
    await this.prisma.pageScheme.delete({ where: { id } });
    return { deleted: true };
  }

  /** 放弃草稿:有已发布版本则恢复为线上数据(线上零感知),无则整行删除(编辑器回落默认结构);
   *  expectedUpdatedAt 为乐观锁,防止并发覆盖其他编辑者的修改。 */
  async discardPageDocumentDraft(
    pageKey: string,
    expectedUpdatedAt?: string,
  ) {
    const doc = await this.prisma.pageDocument.findUnique({ where: { pageKey } });
    if (!doc) throw new BadRequestException("该页面没有草稿");
    if (
      expectedUpdatedAt &&
      doc.updatedAt.toISOString() !== expectedUpdatedAt
    ) {
      throw new ConflictException(
        "草稿已被其他编辑保存，请刷新页面后重试",
      );
    }
    const latestRevision = await this.prisma.pageDocumentRevision.findFirst({
      where: { documentId: doc.id },
      orderBy: { version: "desc" },
    });
    if (latestRevision) {
      return this.prisma.pageDocument.update({
        where: { pageKey },
        data: {
          puckData: latestRevision.puckData as any,
          metadata: latestRevision.metadata as any,
          status: "PUBLISHED",
        },
      });
    }
    await this.prisma.pageDocument.delete({ where: { pageKey } });
    return { deleted: true };
  }
}
