import {
  BadRequestException,
  ConflictException,
  Injectable,
  MessageEvent,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EventEmitter } from "events";
import { existsSync } from "fs";
import { relative, resolve, sep } from "path";
import { fromEvent, interval, map, merge, Observable, startWith } from "rxjs";
import {
  CONTENT_TEMPLATE_ASSET_POLICY,
  CONTENT_TEMPLATE_BY_MODULE_TYPE,
  CONTENT_TEMPLATE_REGISTRY,
  CONTENT_TEMPLATE_PAGE_METADATA,
  CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY,
  createContentTemplatePublicationAttestation,
  getContentTemplatePageRule,
  getContentTemplateIssues,
  getContentTemplateCompletion,
  getContentTemplateLinkTargetReferences,
  getContentTemplateMediaReferences,
  getPageDocumentMediaReferences,
  hasCurrentContentTemplatePublicationAttestation,
  isContentTemplatePageTarget,
  isContentTemplateAllowedForPage,
  sanitizeContentTemplateLayoutData,
  withoutContentTemplatePublicationAttestation,
  type ContentTemplateIssue,
  type ContentTemplateContract,
} from "./content-template-contract";
import { customerFacingProductWhereForVisibilities } from "../products/product-eligibility";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  collectDynamicTemplateInstanceReferences,
  dynamicTemplateVersionKey,
  readDynamicTemplateInstanceReference,
  validateDynamicTemplateInstance,
} from "./dynamic-template-instance";
import {
  calculateDynamicTemplateDefinitionChecksum,
  matchesDynamicTemplateDefinitionChecksum,
} from "./dynamic-template-definition-integrity";
import { validateDynamicTemplateDefinition } from "./generated/validateTemplateDefinition.generated";

/**
 * 页面构建器区块类型契约 — 与前端 puckConfig MyComponents 严格一致,
 * 由 scripts/verify-page-builder-contract.mjs 双向校验,变更任一侧必须同步另一侧。
 * 旧类型(图文混排/分割面板/礼赠指南)已由前端 migratePuckData 在载入时转换,
 * 新保存的草稿不再包含,故不列入本契约。
 */
const PUCK_COMPONENT_LABELS = [
  "动态模板实例",
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
  "工艺细节",
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

const PAGE_METADATA_FIELD_LABELS: Readonly<Record<string, string>> = {
  seoTitle: "页面标题",
  seoDescription: "页面描述",
  ogImage: "社交分享图",
  contentOwner: "内容责任团队 / 岗位",
};

/**
 * 发布校验：占位文案关键词。
 * 默认模板与新增模块内置的文案及素材占位状态会在发布确认中提示，但不阻断可用版本更新前台。
 */
const PLACEHOLDER_MARKERS = [
  "待确认",
  "待配置",
  "请填写",
  "正在完善",
  "内容建设中",
  "即将上线",
  CONTENT_TEMPLATE_ASSET_POLICY.placeholder.label,
  CONTENT_TEMPLATE_ASSET_POLICY.placeholder.badge,
  CONTENT_TEMPLATE_ASSET_POLICY.placeholder.status,
];

/**
 * 这些字段表达会随经营系统变化、需要权限裁决或可能包含个人信息的事实，
 * 不能被复制进账号私有模板。模块级清单用于保留普通营销文案与展示配置，
 * 同时阻断门店、评价、资质、活动权益等结构化事实快照。
 */
const STORE_INFO_PAGE_DOCUMENT_FACT_FIELDS: ReadonlySet<string> = new Set([
  "useSiteSettings",
  "storeName",
  "address",
  "hours",
  "phone",
  "mapUrl",
  "storeMapUrl",
]);

const APPOINTMENT_PAGE_DOCUMENT_FACT_FIELDS: ReadonlySet<string> = new Set([
  "phone",
]);

const PAGE_DOCUMENT_FACT_FIELDS_BY_MODULE: Readonly<Record<string, ReadonlySet<string>>> = {
  门店信息: STORE_INFO_PAGE_DOCUMENT_FACT_FIELDS,
  预约入口: APPOINTMENT_PAGE_DOCUMENT_FACT_FIELDS,
};

const PAGE_DOCUMENT_FACT_SOURCE_LABEL_BY_MODULE: Readonly<Record<string, string>> = {
  门店信息: "统一门店资料",
  预约入口: "统一联系电话",
};

type PageDocumentRecord = Record<string, unknown> & {
  content?: unknown;
  zones?: unknown;
};

type PageValidationDb = Pick<
  Prisma.TransactionClient,
  "siteSetting" | "product" | "category" | "dynamicTemplateVersion"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type VisiblePuckBlock = Record<string, unknown> & {
  type: string;
  props: Record<string, unknown>;
};

function isVisiblePuckBlock(value: unknown): value is VisiblePuckBlock {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    isRecord(value.props) &&
    value.props.isVisible !== false &&
    !EDITOR_ONLY_COMPONENTS.has(value.type)
  );
}

function isBusinessRegionBlock(value: unknown): value is VisiblePuckBlock {
  return (
    isRecord(value) &&
    value.type === "业务功能区" &&
    isRecord(value.props)
  );
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class PageModulesService {
  private readonly publicEvents = new EventEmitter();
  private readonly uploadsRoot = resolve(process.cwd(), "uploads");

  constructor(private prisma: PrismaService) {
    // 每条 SSE 连接都会订阅发布事件，连接数随并发前台用户增长；
    // 关闭默认上限避免误报 EventEmitter 内存泄漏告警
    this.publicEvents.setMaxListeners(0);
  }

  private requirePersonalTemplateOwner(ownerId?: number) {
    if (!Number.isInteger(ownerId) || Number(ownerId) <= 0) {
      throw new BadRequestException("当前登录身份无效");
    }
    return Number(ownerId);
  }

  private normalizeFixedTemplateOrigin(moduleType: string, value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const origin = value as Record<string, unknown>;
    if (origin.kind === "system") {
      const contract = CONTENT_TEMPLATE_BY_MODULE_TYPE[moduleType];
      return contract
        && origin.contractKey === contract.key
        && Number.isInteger(origin.version)
        && Number(origin.version) >= 0
        ? {
            kind: "system" as const,
            contractKey: contract.key,
            version: Number(origin.version),
          }
        : undefined;
    }
    if (
      origin.kind === "personal"
      && Number.isInteger(origin.templateId)
      && Number(origin.templateId) > 0
      && Number.isInteger(origin.revision)
      && Number(origin.revision) > 0
    ) {
      return {
        kind: "personal" as const,
        templateId: Number(origin.templateId),
        revision: Number(origin.revision),
      };
    }
    return undefined;
  }

  private getSystemContentTemplateContract(contractKey: string): ContentTemplateContract {
    const registryItem = CONTENT_TEMPLATE_REGISTRY.find((item) => item.key === contractKey);
    const contract = registryItem
      ? CONTENT_TEMPLATE_BY_MODULE_TYPE[registryItem.moduleType]
      : undefined;
    if (!contract) throw new NotFoundException("系统母模板合同不存在");
    return contract;
  }

  private isMissingLegacyPersonalTemplateRevision(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2022") {
      return false;
    }
    const details = `${error.message} ${JSON.stringify(error.meta ?? {})}`;
    return /personal_content_templates[^\n]*revision|revision[^\n]*personal_content_templates/i.test(details);
  }

  private toSystemContentTemplateCurrent(contract: ContentTemplateContract) {
    const baseline = sanitizeContentTemplateLayoutData(contract.moduleType, { version: 2 });
    if (!baseline) throw new ConflictException("系统母模板代码合同基线无效");
    return {
      contractKey: contract.key,
      moduleType: contract.moduleType,
      displayName: contract.displayName,
      contractVersion: contract.version,
      activeVersion: 0,
      layoutData: baseline,
      source: "code" as const,
      changeNote: null,
      updatedAt: null,
    };
  }

  async getSystemContentTemplates() {
    return CONTENT_TEMPLATE_REGISTRY.map((item) => {
      const contract = CONTENT_TEMPLATE_BY_MODULE_TYPE[item.moduleType];
      if (!contract) throw new ConflictException(`系统模板合同缺失：${item.moduleType}`);
      return this.toSystemContentTemplateCurrent(contract);
    });
  }

  async getSystemContentTemplate(contractKey: string) {
    const contract = this.getSystemContentTemplateContract(contractKey);
    return this.toSystemContentTemplateCurrent(contract);
  }

  async getSystemContentTemplateHistory(contractKey: string) {
    const contract = this.getSystemContentTemplateContract(contractKey);
    const baseline = sanitizeContentTemplateLayoutData(contract.moduleType, { version: 2 });
    if (!baseline) throw new ConflictException("系统母模板代码合同基线无效");
    return [
      {
        version: 0,
        contractKey: contract.key,
        moduleType: contract.moduleType,
        contractVersion: contract.version,
        layoutData: baseline,
        changeNote: "代码机器合同基线",
        createdById: null,
        createdAt: null,
        active: true,
        source: "code" as const,
      },
    ];
  }

  async getPersonalContentTemplates(ownerId?: number) {
    const resolvedOwnerId = this.requirePersonalTemplateOwner(ownerId);
    const orderBy = [{ updatedAt: "desc" as const }, { id: "desc" as const }];
    try {
      return await this.prisma.personalContentTemplate.findMany({
        where: { ownerId: resolvedOwnerId },
        orderBy,
      });
    } catch (error) {
      if (!this.isMissingLegacyPersonalTemplateRevision(error)) throw error;
      const legacyRows = await this.prisma.personalContentTemplate.findMany({
        where: { ownerId: resolvedOwnerId },
        orderBy,
        select: {
          id: true,
          ownerId: true,
          name: true,
          moduleType: true,
          contractKey: true,
          contractVersion: true,
          layoutData: true,
          contentDefaults: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return legacyRows.map((row) => ({ ...row, revision: 1 }));
    }
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

  private async hydrateDynamicTemplateDefinitions(puckData: unknown) {
    if (!isRecord(puckData)) return puckData;
    const references = collectDynamicTemplateInstanceReferences(puckData);
    const persistableDocument = { ...puckData };
    delete persistableDocument[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY];
    if (references.length === 0) return persistableDocument;
    const versions = await this.prisma.dynamicTemplateVersion.findMany({
      where: {
        OR: references.map((reference) => ({
          version: reference.templateVersion,
          template: {
            templateId: reference.templateId,
            visibility: "STAFF",
          },
        })),
      },
      select: {
        version: true,
        schemaVersion: true,
        definition: true,
        definitionChecksum: true,
        template: { select: { templateId: true } },
      },
    });
    const resolved = Object.fromEntries(versions.flatMap((version) => {
      const validation = validateDynamicTemplateDefinition(version.definition);
      if (
        !validation.valid
        || !validation.definition
        || validation.definition.templateId !== version.template.templateId
        || validation.definition.schemaVersion !== version.schemaVersion
        || !matchesDynamicTemplateDefinitionChecksum(
          validation.definition,
          version.definitionChecksum,
        )
      ) return [];
      return [[
        dynamicTemplateVersionKey(version.template.templateId, version.version),
        {
          templateId: version.template.templateId,
          version: version.version,
          schemaVersion: version.schemaVersion,
          definitionChecksum: calculateDynamicTemplateDefinitionChecksum(validation.definition),
          definition: validation.definition,
        },
      ]];
    }));
    return {
      ...persistableDocument,
      [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: resolved,
    };
  }

  /**
   * 草稿允许内容未填完，但所有实例构图必须在保存前通过页面所绑定精确版本的
   * instanceEditPolicy。只检查构图路径，完整内容与业务引用仍由发布预检处理。
   */
  private async assertDynamicTemplateLayoutOverridesValid(puckData: unknown) {
    if (!isRecord(puckData)) return;
    const blocks = [
      ...(Array.isArray(puckData.content) ? puckData.content : []),
      ...(isRecord(puckData.zones)
        ? Object.values(puckData.zones).flatMap((zone) => Array.isArray(zone) ? zone : [])
        : []),
    ];
    const instances: Array<{
      reference: ReturnType<typeof readDynamicTemplateInstanceReference>;
      props: Record<string, unknown>;
    }> = [];
    for (const block of blocks) {
      if (!isRecord(block) || block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE || !isRecord(block.props)) continue;
      instances.push({
        reference: readDynamicTemplateInstanceReference(block.props),
        props: block.props,
      });
    }
    if (instances.length === 0) return;
    const hydrated = await this.hydrateDynamicTemplateDefinitions(puckData);
    if (!isRecord(hydrated)) return;
    const resolved = isRecord(hydrated[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY])
      ? hydrated[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]
      : {};
    const issues: string[] = [];
    for (const { reference, props } of instances) {
      if (!reference) {
        if (Object.prototype.hasOwnProperty.call(props, "layoutOverridesByNodeId")) {
          issues.push("身份无效的模板实例不能保存构图覆盖");
        }
        continue;
      }
      const versionKey = dynamicTemplateVersionKey(reference.templateId, reference.templateVersion);
      const resolvedVersion = isRecord(resolved[versionKey]) ? resolved[versionKey] : undefined;
      const definition = resolvedVersion?.definition;
      if (!definition) {
        issues.push(`${reference.instanceId ?? reference.templateId}：精确模板版本不可用或校验和损坏`);
        continue;
      }
      const validation = validateDynamicTemplateInstance(props, definition);
      for (const issue of validation.issues) {
        if (issue.pathSuffix.startsWith(".layoutOverridesByNodeId")) {
          issues.push(`${reference.instanceId ?? reference.templateId}：${issue.message}`);
        }
      }
    }
    if (issues.length > 0) {
      throw new BadRequestException(`页面实例构图覆盖无效：${issues.slice(0, 5).join("；")}`);
    }
  }

  async getPageDocument(pageKey: string) {
    const document = await this.prisma.pageDocument.findUnique({ where: { pageKey } });
    return document ? {
      ...document,
      puckData: await this.hydrateDynamicTemplateDefinitions(document.puckData),
    } : null;
  }

  private getPublicPageMetadata(metadata: unknown): Record<string, string> {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return {};
    }
    const source = metadata as Record<string, unknown>;
    return Object.fromEntries(
      CONTENT_TEMPLATE_PAGE_METADATA.publicFields.flatMap((field) => {
        const value = source[field];
        return typeof value === "string" && value.trim()
          ? [[field, value.trim()]]
          : [];
      }),
    );
  }

  /**
   * 前台只能读取最后一次已发布的快照。编辑草稿会覆盖 PageDocument，
   * 因此不能直接把草稿文档暴露给公共接口。
   */
  private async getPublishedPageDocumentSnapshot(pageKey: string) {
    const document = await this.prisma.pageDocument.findUnique({
      where: { pageKey },
    });
    if (!document) return null;

    if (!document.publishedRevisionId) return null;
    const revision = await this.prisma.pageDocumentRevision.findFirst({
      where: {
        id: document.publishedRevisionId,
        documentId: document.id,
      },
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

  async getPublishedPageDocument(pageKey: string) {
    const snapshot = await this.getPublishedPageDocumentSnapshot(pageKey);
    if (!snapshot) return null;
    if (!hasCurrentContentTemplatePublicationAttestation(snapshot.metadata)) {
      return {
        pageKey: snapshot.pageKey,
        status: "INVALID",
        invalidReason: "publication-revalidation-required",
        publishedAt: snapshot.publishedAt,
        updatedAt: snapshot.updatedAt,
        version: snapshot.version,
      };
    }
    return {
      pageKey: snapshot.pageKey,
      puckData: await this.hydrateDynamicTemplateDefinitions(snapshot.puckData),
      // 公开端只需要 SEO 字段；内容责任人与其他后台元数据不得随页面响应泄漏。
      metadata: this.getPublicPageMetadata(snapshot.metadata),
      status: snapshot.status,
      publishedAt: snapshot.publishedAt,
      updatedAt: snapshot.updatedAt,
      version: snapshot.version,
    };
  }

  /** 后台编辑器需要完整发布元数据，才能正确比较草稿并还原线上版本。 */
  async getPublishedPageDocumentForAdmin(pageKey: string) {
    const snapshot = await this.getPublishedPageDocumentSnapshot(pageKey);
    if (!snapshot) return null;
    return {
      ...snapshot,
      puckData: await this.hydrateDynamicTemplateDefinitions(snapshot.puckData),
      metadata: withoutContentTemplatePublicationAttestation(snapshot.metadata),
      publicationAttested:
        hasCurrentContentTemplatePublicationAttestation(snapshot.metadata),
    };
  }

  async savePageDocument(
    pageKey: string,
    puckData: Record<string, unknown>,
    metadata?: Record<string, unknown>,
    editorVersion?: string,
    expectedUpdatedAt?: string,
  ) {
    const pageRule = getContentTemplatePageRule(pageKey);
    if (!pageRule) {
      throw new BadRequestException(`页面标识「${pageKey}」未在页面合同注册`);
    }
    if (
      pageRule.contentPlacement === "root-only"
      && puckData?.zones !== undefined
      && (
        !puckData.zones
        || typeof puckData.zones !== "object"
        || Array.isArray(puckData.zones)
        || Object.values(puckData.zones).some(
          (blocks) => !Array.isArray(blocks) || blocks.length > 0,
        )
      )
    ) {
      throw new BadRequestException(
        "页面内容模块只能位于根内容 content，不能放入插槽 zones",
      );
    }
    const normalizedPuckData = this.normalizePageDocumentPuckData(puckData);
    await this.assertDynamicTemplateLayoutOverridesValid(normalizedPuckData);
    // 区块合同版本只存在于 puckData.props.__contentTemplate。页面级摘要仅兼容旧数据读取，
    // 普通保存不得重新写入，更不能借用 schemaVersion/templateVersion 标记区块合同。
    const metadataWithoutPublicationAttestation =
      withoutContentTemplatePublicationAttestation(metadata);
    const metadataWithoutContract =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? Object.fromEntries(
            Object.entries(metadataWithoutPublicationAttestation).filter(
              ([key]) => key !== "contentTemplateContract",
            ),
          )
        : metadata || {};
    const existing = await this.prisma.pageDocument.findUnique({
      where: { pageKey },
    });
    if (existing) {
      const expected = this.parseExpectedUpdatedAt(expectedUpdatedAt);
      if (!expected) {
        throw new BadRequestException("保存已有页面时缺少页面版本标识");
      }
      if (existing.updatedAt.getTime() !== expected.getTime()) {
        throw new ConflictException(
          "该页面已被其他编辑者更新，请重新加载后再保存",
        );
      }

      // 通过 updatedAt 做乐观锁，避免两个浏览器的自动保存发生乱序覆盖。
      const updated = await this.prisma.pageDocument.updateMany({
        where: { pageKey, updatedAt: existing.updatedAt },
        data: {
          puckData: toInputJsonValue(normalizedPuckData),
          metadata: toInputJsonValue(metadataWithoutContract),
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
        puckData: toInputJsonValue(normalizedPuckData),
        metadata: toInputJsonValue(metadataWithoutContract),
        editorVersion,
        schemaVersion: 1,
      },
    });
  }

  async publishPageDocument(
    pageKey: string,
    userId: number | undefined,
    expectedUpdatedAt: string,
  ) {
    const expected = this.parseExpectedUpdatedAt(expectedUpdatedAt);
    if (!expected) {
      throw new BadRequestException("发布页面时缺少页面版本标识");
    }
    const result = await this.prisma.$transaction(async (tx) => {
      // 锁定当前页面文档，串行化同一页面的版本号分配，避免并发发布生成重复版本。
      await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM page_documents WHERE pageKey = ${pageKey} FOR UPDATE
      `;
      const doc = await tx.pageDocument.findUnique({
        where: { pageKey },
      });
      if (!doc) throw new Error("Page document not found");
      const normalizedPuckData = this.normalizePageDocumentPuckData(doc.puckData);
      if (doc.updatedAt.getTime() !== expected.getTime()) {
        throw new ConflictException(
          "该页面已被其他编辑者更新，请重新加载后再发布",
        );
      }
      const validation = await this.collectPageDocumentValidation(
        tx,
        normalizedPuckData,
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
      const revisionMetadata = {
        ...withoutContentTemplatePublicationAttestation(doc.metadata),
        [CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY]:
          createContentTemplatePublicationAttestation(),
      };

      const revision = await tx.pageDocumentRevision.create({
        data: {
          documentId: doc.id,
          version: nextVersion,
          puckData: toInputJsonValue(normalizedPuckData),
          metadata: toInputJsonValue(revisionMetadata),
          status: "published",
          publishedBy: userId,
          publishedAt,
        },
      });

      const published = await tx.pageDocument.update({
        where: { id: doc.id },
        data: {
          puckData: toInputJsonValue(normalizedPuckData),
          status: "PUBLISHED",
          publishedRevisionId: revision.id,
          publishedAt,
          publishedBy: userId,
        },
      });
      if (userId !== undefined) {
        await tx.operationLog.create({
          data: {
            userId,
            action: "PAGE_PUBLISHED",
            module: "page-builder",
            targetId: doc.id,
            detail: JSON.stringify({
              schemaVersion: 1,
              event: "PAGE_PUBLISHED",
              actor: userId,
              timestamp: publishedAt.toISOString(),
              pageKey,
              pageDocumentId: doc.id,
              fromRevision: doc.publishedRevisionId,
              toRevision: revision.id,
              toRevisionVersion: revision.version,
              result: "succeeded",
            }),
          },
        });
      }
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
    puckDataOverride?: unknown,
    metadataOverride?: unknown,
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

  /** 模板原子激活在同一事务内复用页面发布的完整校验规则。 */
  async validatePageDocumentSnapshot(
    db: PageValidationDb,
    pageKey: string,
    puckData: unknown,
    metadata: unknown,
  ) {
    return this.collectPageDocumentValidation(db, puckData, metadata, pageKey);
  }

  private async collectPageDocumentValidation(
    db: PageValidationDb,
    puckData: unknown,
    metadata: unknown,
    pageKey: string,
  ): Promise<{ valid: boolean; errors: string[]; issues: ContentTemplateIssue[] }> {
    const issues = [
      ...this.collectContentTemplateIssues(puckData, pageKey),
      ...(await this.collectPuckDataErrors(db, puckData, pageKey)),
      ...(await this.collectSiteSettingsReadinessIssues(db, puckData, pageKey)),
      ...this.collectMetadataIssues(metadata),
      ...this.collectMediaRightsIssues(puckData, metadata, pageKey),
    ];
    const publicationIssues = issues.map((issue) =>
      this.toUsablePublicationIssue(issue),
    );
    const errors = publicationIssues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message);
    return { valid: errors.length === 0, errors, issues: publicationIssues };
  }

  /**
   * “发布”保存一个立即供前台使用的版本。内容尚未完善时允许发布并在确认框提示；
   * 结构损坏、危险地址、不可解析引用、权限与版本冲突仍由原校验保持阻断。
   */
  private toUsablePublicationIssue(
    issue: ContentTemplateIssue,
  ): ContentTemplateIssue {
    if (issue.severity !== "error" || issue.layer !== "page") return issue;

    const message = issue.message;
    const metadataCompletionFields = new Set([
      "seoTitle",
      "seoDescription",
      "ogImage",
      "contentOwner",
    ]);
    const isMetadataCompletion =
      issue.path.startsWith("metadata.")
      && Boolean(issue.field && metadataCompletionFields.has(issue.field))
      && (message.includes("不能为空") || message.includes("仍是占位内容"));
    const isContentCompletion = [
      " 图片不能为空",
      " 内容不能为空",
      "视频地址不能为空",
      "轮播图片不能为空",
      "画廊图片不能为空",
      "替代文字不能为空",
      "替代文字来源",
      "必须填写替代文字",
      "必须填写视频说明",
      "为必填内容",
      "图片地址无效",
      "至少填写眉题、标题或副标题之一",
      "已启用眉题角色，请填写眉题内容",
      "已启用标题角色，请填写标题内容",
      "已启用副标题角色，请填写副标题内容",
      "已启用行动文字角色，请填写行动文字内容",
      "仍是占位内容",
      " 数量应为 ",
      "请选择 1 件有效的主推商品",
      "关联商品必须是不重复的 1–4 件商品",
      "必须填写行动文案",
      "必须设置有效去向",
      "必须选择有效商品",
      "必须选择有效分类",
      "站内页面跳转必须填写链接",
      "必须选择商品",
    ].some((marker) => message.includes(marker));
    const isDynamicContentBudget =
      /(?:至少需要|最多允许) \d+ (?:个字符|项)/.test(message);

    return isMetadataCompletion || isContentCompletion || isDynamicContentBudget
      ? { ...issue, severity: "warning" }
      : issue;
  }

  private collectContentTemplateIssues(
    puckData: unknown,
    pageKey: string,
  ): ContentTemplateIssue[] {
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
    const pageRule = getContentTemplatePageRule(pageKey);
    if (
      pageRule?.contentPlacement !== "root-only"
      && document.zones
      && typeof document.zones === "object"
    ) {
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

  /**
   * 正式联系与门店资料只读自 SiteSetting；PageDocument 只决定是否使用相关展示区块。
   * 缺少可选资料不会改变既有发布资格，但必须把公开端的真实降级结果反馈给运营。
   */
  private async collectSiteSettingsReadinessIssues(
    db: PageValidationDb,
    puckData: unknown,
    pageKey: string,
  ): Promise<ContentTemplateIssue[]> {
    if (!puckData || typeof puckData !== "object" || Array.isArray(puckData)) return [];
    const document = puckData as {
      content?: unknown;
      zones?: Record<string, unknown>;
    };
    const rootContent = Array.isArray(document.content) ? document.content : [];
    const blocks: Array<{
      type?: unknown;
      props?: Record<string, unknown>;
      path: string;
    }> = rootContent.map((block, index) => ({
      ...(block && typeof block === "object" && !Array.isArray(block)
        ? block as { type?: unknown; props?: Record<string, unknown> }
        : {}),
      path: `content[${index}]`,
    }));
    const pageRule = getContentTemplatePageRule(pageKey);
    if (
      pageRule?.contentPlacement !== "root-only"
      && document.zones
      && typeof document.zones === "object"
      && !Array.isArray(document.zones)
    ) {
      for (const [zoneKey, zoneBlocks] of Object.entries(document.zones)) {
        if (!Array.isArray(zoneBlocks)) continue;
        zoneBlocks.forEach((block, index) => {
          blocks.push({
            ...(block && typeof block === "object" && !Array.isArray(block)
              ? block as { type?: unknown; props?: Record<string, unknown> }
              : {}),
            path: `zones.${zoneKey}[${index}]`,
          });
        });
      }
    }

    const visibleStoreBlocks = blocks.filter(
      (block) => block.type === "门店信息" && block.props?.isVisible !== false,
    );
    const visibleAppointmentBlocks = blocks.filter(
      (block) => block.type === "预约入口" && block.props?.isVisible !== false,
    );
    const contactBusinessRegion = pageKey === "contact"
      ? blocks.find(
          (block) =>
            block.type === "业务功能区"
            && block.props?.pageKey === "contact",
        )
      : undefined;
    if (
      visibleStoreBlocks.length === 0
      && visibleAppointmentBlocks.length === 0
      && !contactBusinessRegion
    ) return [];

    const stored = await db.siteSetting.findUnique({ where: { key: "site" } });
    const settings = stored?.value && typeof stored.value === "object" && !Array.isArray(stored.value)
      ? stored.value as Record<string, unknown>
      : {};
    const hasText = (field: string) => this.isNonEmptyString(settings[field]);
    const mapUrl = hasText("storeMapUrl") ? String(settings.storeMapUrl).trim() : "";
    const hasStoreFacts = [
      "storeName",
      "contactAddress",
      "businessHours",
      "contactPhone",
    ].some(hasText) || /^https?:\/\//i.test(mapUrl);
    const hasContactSummary = [
      "contactPhone",
      "contactEmail",
      "contactAddress",
      "businessHours",
    ].some(hasText);
    const issues: ContentTemplateIssue[] = [];

    if (contactBusinessRegion && !hasContactSummary) {
      issues.push({
        code: "page-validation-site-settings-readiness",
        severity: "warning",
        layer: "page",
        blockId: this.isNonEmptyString(contactBusinessRegion.props?.id)
          ? contactBusinessRegion.props.id
          : undefined,
        path: "siteSettings.contact",
        message:
          "统一联系资料尚未配置；公开联系页仍可提交咨询，但不会显示服务热线、邮箱、地址或服务时间。请先到「店铺资料」维护。",
      });
    }

    if (!hasStoreFacts) {
      for (const block of visibleStoreBlocks) {
        const props = block.props ?? {};
        const blockId = this.isNonEmptyString(props.id) ? props.id : undefined;
        const displayName = this.isNonEmptyString(props.moduleName)
          ? props.moduleName.trim()
          : "门店信息";
        const hasImage = this.isNonEmptyString(props.image);
        issues.push({
          code: "page-validation-site-settings-readiness",
          severity: "warning",
          layer: "page",
          ...(blockId ? { blockId } : {}),
          path: `${block.path}.props.image`,
          message: hasImage
            ? `「${displayName}」尚未配置统一门店资料；公开端将仅显示门店图片。请先到「店铺资料」维护门店名称、地址、营业时间、电话或地图链接。`
            : `「${displayName}」的统一门店资料与门店图片均未配置；该模块在公开端不会显示。请补充门店图片，或到「店铺资料」维护正式门店资料。`,
        });
      }
    }

    if (!hasText("contactPhone")) {
      for (const block of visibleAppointmentBlocks) {
        const props = block.props ?? {};
        const blockId = this.isNonEmptyString(props.id) ? props.id : undefined;
        const displayName = this.isNonEmptyString(props.moduleName)
          ? props.moduleName.trim()
          : "预约入口";
        issues.push({
          code: "page-validation-site-settings-readiness",
          severity: "warning",
          layer: "page",
          ...(blockId ? { blockId } : {}),
          path: "siteSettings.contactPhone",
          message: `「${displayName}」的统一联系电话尚未配置；公开端将不显示次级电话，主预约入口仍可使用。请先到「店铺资料」维护联系电话。`,
        });
      }
    }

    return issues;
  }

  private async collectPuckDataErrors(
    db: PageValidationDb,
    input: unknown,
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
      Array<{ blockId?: string; path: string; label: string; field: string; index?: number }>
    >();
    const dynamicTemplateInstances: Array<{
      props: Record<string, unknown>;
      path: string;
      label: string;
      blockId?: string;
      templateId: string;
      templateVersion: number;
    }> = [];
    const dynamicTemplateCompositionByProps = new Map<Record<string, unknown>, {
      visualRole: "primary-stage" | "feature-stage" | "support-stage";
      headerCompatibility: ReadonlySet<string>;
    }>();
    const missingUploadUrls = new Set<string>();
    const pageRule = getContentTemplatePageRule(pageKey);
    if (!/^[a-z0-9-]{1,50}$/i.test(pageKey)) {
      errors.push("页面标识不合法");
    } else if (!pageRule) {
      errors.push(`页面标识「${pageKey}」未在页面合同注册`);
    }

    if (!isRecord(input)) {
      return [this.createServerValidationIssue("页面数据为空或格式不正确")];
    }
    const puckData: PageDocumentRecord = input;

    if (!Array.isArray(puckData.content)) {
      errors.push("页面内容 content 必须是数组");
    }

    const validateBlock = (block: unknown, path: string, displayPath: string) => {
      const errorStartIndex = errors.length;
      const attachBlockContext = (props?: Record<string, unknown>) => {
        const blockId = this.isNonEmptyString(props?.id) ? props.id : undefined;
        for (let index = errorStartIndex; index < errors.length; index += 1) {
          errorContexts[index] ??= { blockId, path };
        }
      };
      if (!isRecord(block)) {
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

      if (!isRecord(props)) {
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

      const prohibitedFactFields = PAGE_DOCUMENT_FACT_FIELDS_BY_MODULE[type];
      if (prohibitedFactFields) {
        const sourceLabel = PAGE_DOCUMENT_FACT_SOURCE_LABEL_BY_MODULE[type] || "统一业务资料";
        for (const field of prohibitedFactFields) {
          if (!Object.prototype.hasOwnProperty.call(props, field)) continue;
          const errorIndex = errors.push(
            `${label}：${field} 属于${sourceLabel}，PageDocument 不得保存业务事实副本`,
          ) - 1;
          errorContexts[errorIndex] = {
            blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
            path: `${path}.props.${field}`,
            field,
          };
        }
      }

      // 编辑器说明区不会进入前台；隐藏区块也不应因未完成内容阻断其他模块发布。
      if (EDITOR_ONLY_COMPONENTS.has(type) || props.isVisible === false) {
        attachBlockContext(props);
        return;
      }

      if (type === DYNAMIC_TEMPLATE_BLOCK_TYPE) {
        const reference = readDynamicTemplateInstanceReference(props);
        if (!reference) {
          const errorIndex = errors.push(`${label}：必须绑定有效的正式模板版本`) - 1;
          errorContexts[errorIndex] = {
            blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
            path: `${path}.props.templateVersion`,
            field: "templateVersion",
          };
        } else {
          dynamicTemplateInstances.push({
            props,
            path,
            label,
            blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
            templateId: reference.templateId,
            templateVersion: reference.templateVersion,
          });
        }
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
        const errorIndex = errors.push(`${label}：${field} 图片不能为空`) - 1;
        errorContexts[errorIndex] = {
          blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
          path: `${path}.props.${field}`,
          field,
        };
      }
      for (const field of completion?.content.missing ?? []) {
        const errorIndex = errors.push(`${label}：${field} 内容不能为空`) - 1;
        errorContexts[errorIndex] = {
          blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
          path: `${path}.props.${field}`,
          field,
        };
      }
      for (const missingAlt of completion?.content.missingCollectionAltText ?? []) {
        const errorIndex = errors.push(
          `${label}：第 ${missingAlt.index + 1} 项${missingAlt.altPolicy === "derived" ? "替代文字来源" : "替代文字"}不能为空`,
        ) - 1;
        errorContexts[errorIndex] = {
          blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
          path: `${path}.props.${missingAlt.collectionFieldKey}[${missingAlt.index}].${missingAlt.altFieldKey}`,
          field: missingAlt.collectionFieldKey,
          index: missingAlt.index,
        };
      }
      for (const collection of completion?.collections.invalid ?? []) {
        const errorIndex = errors.push(
          `${label}：${collection.fieldKey} 数量应为 ${collection.min}–${collection.max} 项，当前为 ${collection.count} 项`,
        ) - 1;
        errorContexts[errorIndex] = {
          blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
          path: `${path}.props.${collection.fieldKey}`,
          field: collection.fieldKey,
        };
      }
      for (const attestation of completion?.attestations.missing ?? []) {
        const errorIndex = errors.push(
          `${label}：第 ${attestation.index + 1} 项发布前必须确认“${attestation.label}”`,
        ) - 1;
        errorContexts[errorIndex] = {
          blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
          path: `${path}.props.${attestation.collectionFieldKey}[${attestation.index}].${attestation.attestationFieldKey}`,
          field: attestation.collectionFieldKey,
          index: attestation.index,
        };
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

      if (contentTemplate) {
        for (const reference of getContentTemplateMediaReferences(
          type,
          props,
          `${path}.props`,
        )) {
          validateAsset(reference.url, `${label}：${reference.field} 素材`);
        }
      } else {
        // 非模板兼容分支才使用旧字段表；正式内容模板统一由机器合同派生。
        for (const field of PUCK_IMAGE_FIELDS) {
          validateAsset(props[field], `${label}：${field} 图片`);
        }
        validateAsset(props.videoUrl, `${label}：videoUrl 视频`);
      }

      for (const field of contentTemplate ? ["mapUrl"] : PUCK_LINK_FIELDS) {
        const value = props[field];
        if (this.isNonEmptyString(value) && !this.isSafeLink(value)) {
          errors.push(`${label}：${field} 链接不合法`);
        }
      }

      for (const reference of getContentTemplateLinkTargetReferences(
        type,
        props,
        `${path}.props`,
      )) {
        const itemLabel = reference.index === undefined
          ? label
          : `${label}：第 ${reference.index + 1} 项`;
        const contextField = (field: string) =>
          reference.index === undefined ? field : reference.field;
        const pushLinkError = (message: string, field: string) => {
          const errorIndex = errors.push(`${itemLabel}：${message}`) - 1;
          errorContexts[errorIndex] = {
            blockId: reference.blockId,
            path: `${reference.path}.${field}`,
            field: contextField(field),
            ...(reference.index === undefined ? {} : { index: reference.index }),
          };
        };
        const targetType = this.isNonEmptyString(reference.targetType)
          ? reference.targetType.trim()
          : "";
        const productCode = this.isNonEmptyString(reference.productCode)
          ? reference.productCode.trim()
          : "";
        const hasProductIdValue = reference.productId !== undefined
          && reference.productId !== null
          && String(reference.productId).trim() !== "";
        const productId = Number(reference.productId);
        // 历史 LinkTargetField 用 0 表示“未选择商品”；它不是业务引用。
        // 其他非空值（含负数和非数字）仍作为残留进入后续错误分支。
        const hasProductIdTarget = hasProductIdValue && productId !== 0;
        const categorySlug = this.isNonEmptyString(reference.categorySlug)
          ? reference.categorySlug.trim()
          : "";
        const linkUrl = this.isNonEmptyString(reference.linkUrl)
          ? reference.linkUrl.trim()
          : "";
        const legacyLink = this.isNonEmptyString(reference.legacyLink)
          ? reference.legacyLink.trim()
          : "";
        const hasProductTarget = Boolean(productCode || hasProductIdTarget);
        const hasCategoryTarget = Boolean(categorySlug);
        const hasLinkTarget = Boolean(linkUrl || legacyLink);
        const inferredTargetType = targetType || (
          hasProductTarget && !hasCategoryTarget && !hasLinkTarget
            ? "product"
            : hasCategoryTarget && !hasProductTarget && !hasLinkTarget
              ? "category"
            : hasLinkTarget && !hasProductTarget && !hasCategoryTarget
              ? "page"
              : "none"
        );
        const hasActionText = this.isNonEmptyString(reference.actionText);

        const targetCount = Number(hasProductTarget) + Number(hasCategoryTarget) + Number(hasLinkTarget);
        if (!targetType && targetCount > 1) {
          pushLinkError("旧版行动目标同时包含多个去向，请重新选择唯一去向", reference.targetTypeFieldKey);
          continue;
        }
        if (!["none", "product", "category", "page", "external"].includes(inferredTargetType)) {
          pushLinkError("行动目标类型不合法", reference.targetTypeFieldKey);
          continue;
        }
        if (reference.actionTextFieldKey) {
          if (hasActionText && inferredTargetType === "none") {
            pushLinkError("已填写行动文案，必须设置有效去向", reference.targetTypeFieldKey);
          } else if (!hasActionText && inferredTargetType !== "none") {
            pushLinkError("已设置行动去向，必须填写行动文案", reference.actionTextFieldKey);
          }
        } else if (reference.required && inferredTargetType === "none") {
          pushLinkError("该公开条目必须设置有效去向", reference.targetTypeFieldKey);
        }

        if (inferredTargetType === "none") {
          if (hasProductTarget || hasCategoryTarget || hasLinkTarget) {
            pushLinkError("不跳转时不能保留商品、分类或链接去向", reference.targetTypeFieldKey);
          }
          continue;
        }

        if (inferredTargetType === "product") {
          if (hasCategoryTarget || hasLinkTarget) {
            pushLinkError("商品跳转不能同时保留分类或链接去向", reference.linkUrlFieldKey);
            continue;
          }
          if (productCode && hasProductIdTarget) {
            pushLinkError("商品跳转只能保留一个商品编号", reference.productCodeFieldKey);
            continue;
          }
          if (productCode) {
            productCodes.add(productCode);
            const references = productCodeReferences.get(productCode) ?? [];
            references.push({
              blockId: reference.blockId,
              path: `${reference.path}.${reference.productCodeFieldKey}`,
              label: itemLabel,
              field: contextField(reference.productCodeFieldKey),
              ...(reference.index === undefined ? {} : { index: reference.index }),
            });
            productCodeReferences.set(productCode, references);
          } else if (!Number.isInteger(productId) || productId <= 0) {
            pushLinkError("商品跳转必须选择有效商品", reference.productIdFieldKey);
          } else {
            productIds.add(productId);
            const references = productReferences.get(productId) ?? [];
            references.push({
              blockId: reference.blockId,
              path: `${reference.path}.${reference.productIdFieldKey}`,
              label: itemLabel,
              field: contextField(reference.productIdFieldKey),
              ...(reference.index === undefined ? {} : { index: reference.index }),
            });
            productReferences.set(productId, references);
          }
          continue;
        }

        if (inferredTargetType === "category") {
          if (hasProductTarget || hasLinkTarget) {
            pushLinkError("分类跳转不能同时保留商品或链接去向", reference.categorySlugFieldKey);
            continue;
          }
          if (!categorySlug) {
            pushLinkError("分类跳转必须选择有效分类", reference.categorySlugFieldKey);
            continue;
          }
          categorySlugs.add(categorySlug);
          const references = categoryReferences.get(categorySlug) ?? [];
          references.push({
            blockId: reference.blockId,
            path: `${reference.path}.${reference.categorySlugFieldKey}`,
            label: itemLabel,
            field: contextField(reference.categorySlugFieldKey),
            ...(reference.index === undefined ? {} : { index: reference.index }),
          });
          categoryReferences.set(categorySlug, references);
          continue;
        }

        if (hasProductTarget || hasCategoryTarget) {
          pushLinkError("链接跳转不能同时保留商品或分类去向", reference.productCodeFieldKey);
          continue;
        }

        if (inferredTargetType === "external") {
          if (legacyLink || !linkUrl) {
            pushLinkError("外部链接必须填写完整的 HTTPS 地址", reference.linkUrlFieldKey);
          } else if (!this.isSafeExternalLink(linkUrl)) {
            pushLinkError("外部链接只允许完整的 HTTPS 地址", reference.linkUrlFieldKey);
          }
          continue;
        }

        if (linkUrl && legacyLink && linkUrl !== legacyLink) {
          pushLinkError("页面跳转存在两个不同链接，请重新选择唯一去向", reference.linkUrlFieldKey);
          continue;
        }
        const effectiveLink = linkUrl || legacyLink;
        const linkField = linkUrl
          ? reference.linkUrlFieldKey
          : reference.legacyLinkFieldKey || reference.linkUrlFieldKey;
        if (!effectiveLink) {
          pushLinkError("站内页面跳转必须填写链接", reference.linkUrlFieldKey);
        } else if (!isContentTemplatePageTarget(effectiveLink)) {
          pushLinkError(
            "页面去向未在公开页面合同登记；商品详情请使用商品目标",
            linkField,
          );
        }
      }

      if (type === "视频区块" && !this.isNonEmptyString(props.videoUrl)) {
        errors.push(`${label}：videoUrl 视频地址不能为空`);
      }

      if (type === "首屏主视觉") {
        const instanceOverrides = isRecord(props.__instanceOverrides)
          ? props.__instanceOverrides
          : undefined;
        const textRoles = isRecord(instanceOverrides?.textRoles)
          ? instanceOverrides.textRoles
          : undefined;
        const legacyCopyOverride = isRecord(textRoles?.copy)
          ? textRoles.copy
          : undefined;
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
          const nodes = isRecord(instanceOverrides.nodes)
            ? instanceOverrides.nodes
            : {};
          for (const [roleId, roleLabel] of Object.entries(roleLabels)) {
            const roleNode = isRecord(nodes[roleId]) ? nodes[roleId] : undefined;
            if (
              roleNode?.enabled === true &&
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

      const rejectPlaceholderText = (
        value: unknown,
        fieldLabel: string,
        valuePath: string,
        field?: string,
        index?: number,
      ) => {
        if (typeof value !== "string") return;
        const trimmed = value.trim();
        if (!trimmed) return;
        if (PLACEHOLDER_MARKERS.some((marker) => trimmed.includes(marker))) {
          const errorIndex = errors.push(
            `${label}：${fieldLabel}“${trimmed}”仍是占位内容，请填写正式文案`,
          ) - 1;
          errorContexts[errorIndex] = {
            blockId: this.isNonEmptyString(props.id) ? props.id : undefined,
            path: valuePath,
            field,
            index,
          };
        }
      };

      // 占位可能出现在普通文案、列表条目、alt、素材状态或后续新增结构中；
      // 递归检查当前区块的可序列化 props，避免只拦截少数已知模板而漏过新页面。
      const scanPlaceholderValues = (
        value: unknown,
        displayValuePath: string,
        valuePath: string,
        field?: string,
        itemIndex?: number,
      ) => {
        if (typeof value === "string") {
          rejectPlaceholderText(value, displayValuePath, valuePath, field, itemIndex);
          return;
        }
        if (Array.isArray(value)) {
          value.forEach((item, index) =>
            scanPlaceholderValues(
              item,
              `${displayValuePath}[${index}]`,
              `${valuePath}[${index}]`,
              field,
              index,
            ),
          );
          return;
        }
        if (value && typeof value === "object") {
          Object.entries(value).forEach(([key, item]) =>
            scanPlaceholderValues(
              item,
              `${displayValuePath}.${key}`,
              `${valuePath}.${key}`,
              field ?? key,
              itemIndex,
            ),
          );
        }
      };
      scanPlaceholderValues(props, "配置", `${path}.props`);

      if (type === "产品展示行") {
        const codes = Array.isArray(props.productCodes)
          ? props.productCodes.map((code: unknown) => String(code).trim()).filter(Boolean)
          : [];
        if (codes.length > 0) {
          if (new Set(codes).size !== codes.length) {
            const errorIndex = errors.push(`${label}：商品引用不能重复`) - 1;
            errorContexts[errorIndex] = { blockId: this.isNonEmptyString(props.id) ? props.id : undefined, path: `${path}.props.productCodes`, field: "productCodes" };
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
          if (new Set(props.productIds.map(Number)).size !== props.productIds.length) {
            const errorIndex = errors.push(`${label}：商品引用不能重复`) - 1;
            errorContexts[errorIndex] = { blockId: this.isNonEmptyString(props.id) ? props.id : undefined, path: `${path}.props.productIds`, field: "productIds" };
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
            errorContexts[errorIndex] = { blockId: this.isNonEmptyString(props.id) ? props.id : undefined, path: `${path}.props.productCodes`, field: "productCodes" };
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
            errorContexts[errorIndex] = { blockId: this.isNonEmptyString(props.id) ? props.id : undefined, path: `${path}.props.productIds`, field: "productIds" };
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
        !Number.isFinite(new Date(String(props.targetDate)).getTime())
      ) {
        errors.push(`${label}：结束时间必须是有效的 ISO 日期时间`);
      }

      if (type === "轮播图") {
        if (Array.isArray(props.images)) {
          props.images.forEach((item: unknown, index: number) => {
            if (!isRecord(item) || !this.isNonEmptyString(item.url)) {
              errors.push(`${label}：第 ${index + 1} 张轮播图片不能为空`);
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
        items.forEach((item: unknown, index) => {
          fields.forEach((field) => {
            validateAsset(
              isRecord(item) ? item[field] : undefined,
              `${label}：第 ${index + 1} 个${itemLabel}${field}`,
            );
          });
        });
      };

      const categorySlugValues = Array.isArray(props.categorySlugs)
        ? props.categorySlugs
        : [];
      const usesCategoryReferences =
        type === "分类卡片" && categorySlugValues.length > 0;
      if (!contentTemplate) {
        if (!usesCategoryReferences) {
          validateNestedAssets(props.categories, "分类卡片的", ["image"]);
        }
        validateNestedAssets(props.items, "画廊图片的", ["image"]);
        validateNestedAssets(props.certificates, "证书的", ["imageUrl"]);
        validateNestedAssets(props.steps, "定制步骤的", ["image"]);
        validateNestedAssets(props.testimonials, "评价的", ["image"]);
      }

      // 作品画廊:每张图片必填(与画廊契约一致)
      if (type === "作品画廊" && Array.isArray(props.items)) {
        props.items.forEach((item: unknown, index: number) => {
          if (!isRecord(item) || !this.isNonEmptyString(item.image)) {
            errors.push(`${label}：第 ${index + 1} 张画廊图片不能为空`);
          }
        });
      }

      // 分类卡片的正式形态使用 categorySlugs；这里只保留旧手填分类入口的安全兜底。
      if (
        type === "分类卡片" && !usesCategoryReferences &&
        Array.isArray(props.categories)
      ) {
        props.categories.forEach((item: unknown, index: number) => {
          if (!isRecord(item)) return;
          for (const itemLinkField of ["link", "linkUrl"]) {
            if (
              this.isNonEmptyString(item[itemLinkField]) &&
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
        const slugs = categorySlugValues
          .map((slug: unknown) => String(slug).trim())
          .filter(Boolean);
        if (new Set(slugs).size !== slugs.length) {
          const errorIndex = errors.push(`${label}：分类引用不能重复`) - 1;
          errorContexts[errorIndex] = { blockId: this.isNonEmptyString(props.id) ? props.id : undefined, path: `${path}.props.categorySlugs`, field: "categorySlugs" };
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
      ? puckData.content.filter(isVisiblePuckBlock).length
      : 0;
    const visibleZoneCount =
      pageRule?.contentPlacement !== "root-only"
      && isRecord(puckData.zones)
        ? Object.values(puckData.zones).reduce(
            (count: number, zoneBlocks: unknown) =>
              count +
              (Array.isArray(zoneBlocks)
                ? zoneBlocks.filter(isVisiblePuckBlock).length
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
      ...(pageRule?.contentPlacement !== "root-only"
        && isRecord(puckData.zones)
        ? Object.values(puckData.zones).flatMap((blocks) =>
            Array.isArray(blocks) ? blocks : [],
          )
        : []),
    ].filter(isVisiblePuckBlock);
    if (pageRule) {
      const rootContent = Array.isArray(puckData.content) ? puckData.content : [];
      if (
        pageRule.contentPlacement === "root-only"
        && isRecord(puckData.zones)
      ) {
        for (const [zoneKey, zoneBlocks] of Object.entries(puckData.zones)) {
          if (!Array.isArray(zoneBlocks) || zoneBlocks.length === 0) continue;
          const errorIndex = errors.push(
            "页面内容模块只能位于页面根内容 content，不能放入插槽 zones",
          ) - 1;
          errorContexts[errorIndex] = {
            path: `zones[${JSON.stringify(zoneKey)}]`,
          };
        }
      }
      const rootBusinessRegions = rootContent.filter(
        isBusinessRegionBlock,
      );
      const zoneBusinessRegions = isRecord(puckData.zones)
        ? Object.values(puckData.zones).flatMap((blocks) =>
            Array.isArray(blocks)
              ? blocks.filter(isBusinessRegionBlock)
              : [],
          )
        : [];
      const businessRegions = [...rootBusinessRegions, ...zoneBusinessRegions];
      if (businessRegions.length !== pageRule.businessRegionCount) {
        errors.push(
          `页面角色 ${pageRule.pageRole} 要求固定业务区数量为 ${pageRule.businessRegionCount}，当前为 ${businessRegions.length}`,
        );
      }
      if (zoneBusinessRegions.length > 0) {
        errors.push("固定业务区只能位于页面根内容，不能放入插槽 zones");
      }
      businessRegions.forEach((block) => {
        if (block.props.pageKey !== pageKey || block.props.locked !== true) {
          errors.push("固定业务区必须属于当前页面且保持锁定");
        }
      });
      const semanticRootContent = rootContent.filter((block) =>
        isBusinessRegionBlock(block) || (
          isVisiblePuckBlock(block) &&
          (Boolean(CONTENT_TEMPLATE_BY_MODULE_TYPE[block.type]) || block.type === DYNAMIC_TEMPLATE_BLOCK_TYPE)
        ),
      );
      if (
        pageRule.businessRegionPosition === "after-first-brand-block"
        && semanticRootContent.findIndex(isBusinessRegionBlock) !== 1
      ) {
        errors.push("固定业务区必须紧随首个品牌框架模块之后");
      }
    }

    if (Array.isArray(puckData.content)) {
      puckData.content.forEach((block: unknown, index: number) => {
        validateBlock(block, `content[${index}]`, `第 ${index + 1} 个区块`);
      });
    }

    if (isRecord(puckData.zones)) {
      Object.entries(puckData.zones).forEach(([zoneKey, zoneBlocks]) => {
        if (!Array.isArray(zoneBlocks)) {
          errors.push(`插槽 ${zoneKey}：内容必须是数组`);
          return;
        }
        if (pageRule?.contentPlacement === "root-only") return;
        zoneBlocks.forEach((block: unknown, index: number) => {
          validateBlock(
            block,
            `zones[${JSON.stringify(zoneKey)}][${index}]`,
            `插槽 ${zoneKey} 第 ${index + 1} 个区块`,
          );
        });
      });
    }

    if (dynamicTemplateInstances.length > 0) {
      const seenInstanceIds = new Set<string>();
      for (const instance of dynamicTemplateInstances) {
        const instanceId = this.isNonEmptyString(instance.props.instanceId)
          ? instance.props.instanceId.trim()
          : "";
        if (!instanceId || !seenInstanceIds.has(instanceId)) {
          if (instanceId) seenInstanceIds.add(instanceId);
          continue;
        }
        const errorIndex = errors.push(`${instance.label}：页面模板实例 ID 不能重复`) - 1;
        errorContexts[errorIndex] = {
          blockId: instance.blockId,
          path: `${instance.path}.props.instanceId`,
          field: "instanceId",
        };
      }
      const exactVersions = await db.dynamicTemplateVersion.findMany({
        where: {
          OR: dynamicTemplateInstances.map((instance) => ({
            version: instance.templateVersion,
            template: {
              templateId: instance.templateId,
              visibility: "STAFF",
            },
          })),
        },
        select: {
          version: true,
          schemaVersion: true,
          definition: true,
          definitionChecksum: true,
          template: { select: { templateId: true } },
        },
      });
      const versionByKey = new Map(exactVersions.map((version) => [
        dynamicTemplateVersionKey(version.template.templateId, version.version),
        version,
      ]));
      for (const instance of dynamicTemplateInstances) {
        const version = versionByKey.get(
          dynamicTemplateVersionKey(instance.templateId, instance.templateVersion),
        );
        if (!version) {
          const errorIndex = errors.push(
            `${instance.label}：正式模板 ${instance.templateId} v${instance.templateVersion} 不存在或不可用于页面`,
          ) - 1;
          errorContexts[errorIndex] = {
            blockId: instance.blockId,
            path: `${instance.path}.props.templateVersion`,
            field: "templateVersion",
          };
          continue;
        }
        const definitionValidation = validateDynamicTemplateDefinition(version.definition);
        if (
          !definitionValidation.valid
          || !definitionValidation.definition
          || definitionValidation.definition.templateId !== instance.templateId
          || definitionValidation.definition.schemaVersion !== version.schemaVersion
          || !matchesDynamicTemplateDefinitionChecksum(
            definitionValidation.definition,
            version.definitionChecksum,
          )
        ) {
          const errorIndex = errors.push(
            `${instance.label}：正式模板 ${instance.templateId} v${instance.templateVersion} 的结构或校验和已损坏`,
          ) - 1;
          errorContexts[errorIndex] = {
            blockId: instance.blockId,
            path: `${instance.path}.props.templateVersion`,
            field: "templateVersion",
          };
          continue;
        }
        const result = validateDynamicTemplateInstance(
          instance.props,
          definitionValidation.definition,
        );
        if (result.definition) {
          dynamicTemplateCompositionByProps.set(instance.props, {
            visualRole: result.definition.metadata.visualRole ?? "support-stage",
            headerCompatibility: new Set(
              result.definition.metadata.headerCompatibility ?? ["solid"],
            ),
          });
        }
        for (const issue of result.issues) {
          const errorIndex = errors.push(`${instance.label}：${issue.message}`) - 1;
          errorContexts[errorIndex] = {
            blockId: instance.blockId,
            path: `${instance.path}.props${issue.pathSuffix}`,
            field: issue.field,
            index: issue.index,
          };
        }
        for (const asset of result.assets) {
          const assetLabel = `${instance.label}：${result.definition?.slots[asset.slotId]?.label ?? asset.slotId} 素材`;
          if (!this.isSafeAssetUrl(asset.url)) {
            const errorIndex = errors.push(`${assetLabel}地址不合法`) - 1;
            errorContexts[errorIndex] = {
              blockId: instance.blockId,
              path: `${instance.path}.props.contentBySlotId.${asset.slotId}.src`,
              field: asset.slotId,
            };
          } else {
            const previousErrorCount = errors.length;
            this.collectMissingUploadError(asset.url, assetLabel, missingUploadUrls, errors);
            for (let index = previousErrorCount; index < errors.length; index += 1) {
              errorContexts[index] = {
                blockId: instance.blockId,
                path: `${instance.path}.props.contentBySlotId.${asset.slotId}.src`,
                field: asset.slotId,
              };
            }
          }
        }
        const registerProductCode = (slotId: string, code: string, index?: number) => {
          productCodes.add(code);
          const references = productCodeReferences.get(code) ?? [];
          references.push({
            blockId: instance.blockId,
            path: `${instance.path}.props.contentBySlotId.${slotId}${index === undefined ? "" : `[${index}]`}`,
            label: instance.label,
            field: slotId,
            ...(index === undefined ? {} : { index }),
          });
          productCodeReferences.set(code, references);
        };
        const registerCategorySlug = (slotId: string, slug: string, index?: number) => {
          categorySlugs.add(slug);
          const references = categoryReferences.get(slug) ?? [];
          references.push({
            blockId: instance.blockId,
            path: `${instance.path}.props.contentBySlotId.${slotId}${index === undefined ? "" : `[${index}]`}`,
            label: instance.label,
            field: slotId,
            ...(index === undefined ? {} : { index }),
          });
          categoryReferences.set(slug, references);
        };
        result.productCodes.forEach((reference) => {
          registerProductCode(reference.slotId, reference.value, reference.index);
        });
        result.categorySlugs.forEach((reference) => {
          registerCategorySlug(reference.slotId, reference.value, reference.index);
        });
        for (const action of result.actions) {
          if (action.targetType === "product") {
            registerProductCode(action.slotId, action.value, action.index);
          } else if (action.targetType === "category") {
            registerCategorySlug(action.slotId, action.value, action.index);
          } else if (
            action.targetType === "page"
            && !isContentTemplatePageTarget(action.value)
          ) {
            const errorIndex = errors.push(`${instance.label}：站内页面去向未登记`) - 1;
            errorContexts[errorIndex] = {
              blockId: instance.blockId,
              path: `${instance.path}.props.contentBySlotId.${action.slotId}`,
              field: action.slotId,
            };
          } else if (
            action.targetType === "external"
            && !this.isSafeExternalLink(action.value)
          ) {
            const errorIndex = errors.push(`${instance.label}：外部链接只允许完整 HTTPS 地址`) - 1;
            errorContexts[errorIndex] = {
              blockId: instance.blockId,
              path: `${instance.path}.props.contentBySlotId.${action.slotId}`,
              field: action.slotId,
            };
          }
        }
      }
    }

    const compositionByBlock = orderedVisibleBlocks.map((block) => {
      const fixed = CONTENT_TEMPLATE_BY_MODULE_TYPE[block.type];
      if (fixed) {
        return {
          visualRole: fixed.visualRole,
          overlayLightCompatible:
            fixed.key === pageRule?.headerMode.overlayRequiresFirstTemplate,
        };
      }
      const dynamic = block.type === DYNAMIC_TEMPLATE_BLOCK_TYPE
        ? dynamicTemplateCompositionByProps.get(block.props)
        : undefined;
      return {
        visualRole: dynamic?.visualRole,
        overlayLightCompatible:
          dynamic?.headerCompatibility.has("overlay-light") ?? false,
      };
    });
    if (
      pageRule?.headerMode.configured === "overlay-light"
      && !compositionByBlock[0]?.overlayLightCompatible
    ) {
      errors.push("覆盖式浅色导航要求首个可见品牌模块明确兼容浅色覆盖导航");
    }
    const primaryStageIndexes = compositionByBlock
      .map((composition, index) => composition.visualRole === "primary-stage" ? index : -1)
      .filter((index) => index >= 0);
    if (primaryStageIndexes.length > 0 && primaryStageIndexes[0] !== 0) {
      errors.push("首屏主舞台（primary-stage）必须是首个可见品牌内容区");
    }

    if (productIds.size > 0) {
      // 发布文档对游客公开，关联商品必须与游客公开目录保持一致。
      const products = await db.product.findMany({
        where: {
          id: { in: [...productIds] },
          ...customerFacingProductWhereForVisibilities(["PUBLIC"]),
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
                `${reference.label}：商品 ID ${id} 未满足公开发布条件（需已发布、质量就绪、符合发布画像、公开可见且未删除）`,
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
              `页面引用的商品 ID ${id} 未满足公开发布条件（需已发布、质量就绪、符合发布画像、公开可见且未删除）`,
            );
          }
        }
      }
    }

    if (productCodes.size > 0) {
      const products = await db.product.findMany({
        where: {
          code: { in: [...productCodes] },
          ...customerFacingProductWhereForVisibilities(["PUBLIC"]),
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
          .filter((item) => Boolean(item.listingImageId || item.primaryImageId || item.images.length))
          .map((item) => item.code),
      );
      for (const code of productCodes) {
        if (publicProductCodes.has(code)) continue;
        for (const reference of productCodeReferences.get(code) ?? []) {
          const errorIndex = errors.push(
            `${reference.label}：商品 ${code} 未满足公开发布条件（需已发布、质量就绪、符合发布画像、公开可见、未删除且有展示图）`,
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
            where: customerFacingProductWhereForVisibilities(["PUBLIC"]),
            take: 1,
            select: { id: true },
          },
        },
      });
      const byId = new Map(categories.map((category) => [category.id, category]));
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
          .filter((category) => publicBranchIds.has(category.id) && Boolean(category.coverImage))
          .map((category) => category.slug),
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
   * 草稿允许内容未完成，但不允许重新持久化已废弃的经营事实副本。
   * 只清理已登记模块的明确遗留键；媒体、布局、样式与历史发布快照均不受影响。
   */
  private removePageDocumentBusinessFactCopies(puckData: unknown): unknown {
    if (!puckData || typeof puckData !== "object" || Array.isArray(puckData)) {
      return puckData;
    }
    const document = puckData as Record<string, unknown>;
    const sanitizeBlock = (block: unknown): unknown => {
      if (!block || typeof block !== "object" || Array.isArray(block)) return block;
      const value = block as Record<string, unknown>;
      const fields = typeof value.type === "string"
        ? PAGE_DOCUMENT_FACT_FIELDS_BY_MODULE[value.type]
        : undefined;
      if (!fields || !value.props || typeof value.props !== "object") {
        return block;
      }
      const props = { ...(value.props as Record<string, unknown>) };
      let touched = false;
      for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(props, field)) continue;
        delete props[field];
        touched = true;
      }
      return touched ? { ...value, props } : block;
    };

    return {
      ...document,
      ...(Array.isArray(document.content)
        ? { content: document.content.map(sanitizeBlock) }
        : {}),
      ...(document.zones && typeof document.zones === "object" && !Array.isArray(document.zones)
        ? {
            zones: Object.fromEntries(
              Object.entries(document.zones).map(([zoneKey, blocks]) => [
                zoneKey,
                Array.isArray(blocks) ? blocks.map(sanitizeBlock) : blocks,
              ]),
            ),
          }
        : {}),
    };
  }

  /**
   * PageDocument 写入口共用的当前合同规范化。业务事实副本先按既有规则剥离，
   * 实例覆盖再交给机器合同白名单清洗；旧版本印记仍保留，历史 revision 不回写。
   */
  private normalizePageDocumentPuckData(puckData: unknown): unknown {
    const withoutBusinessFacts = this.removePageDocumentBusinessFactCopies(puckData);
    if (
      !withoutBusinessFacts ||
      typeof withoutBusinessFacts !== "object" ||
      Array.isArray(withoutBusinessFacts)
    ) {
      return withoutBusinessFacts;
    }

    const document = withoutBusinessFacts as Record<string, unknown>;
    const persistableDocument = { ...document };
    delete persistableDocument[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY];
    const normalizeBlock = (block: unknown): unknown => {
      if (!block || typeof block !== "object" || Array.isArray(block)) return block;
      const value = block as Record<string, unknown>;
      if (
        typeof value.type !== "string" ||
        !Object.prototype.hasOwnProperty.call(CONTENT_TEMPLATE_BY_MODULE_TYPE, value.type) ||
        !value.props ||
        typeof value.props !== "object" ||
        Array.isArray(value.props)
      ) {
        return block;
      }
      const props = value.props as Record<string, unknown>;
      const nextProps = { ...props };
      let touched = false;
      if (Object.prototype.hasOwnProperty.call(props, "__instanceOverrides")) {
        const normalizedOverrides = sanitizeContentTemplateLayoutData(
          value.type,
          props.__instanceOverrides,
        );
        if (normalizedOverrides) {
          nextProps.__instanceOverrides = normalizedOverrides;
        } else {
          delete nextProps.__instanceOverrides;
        }
        touched = true;
      }
      if (Object.prototype.hasOwnProperty.call(props, "__templateOrigin")) {
        const origin = this.normalizeFixedTemplateOrigin(value.type, props.__templateOrigin);
        if (origin) nextProps.__templateOrigin = origin;
        else delete nextProps.__templateOrigin;
        touched = true;
      }
      return touched ? { ...value, props: nextProps } : block;
    };

    return {
      ...persistableDocument,
      ...(Array.isArray(persistableDocument.content)
        ? { content: persistableDocument.content.map(normalizeBlock) }
        : {}),
      ...(persistableDocument.zones && typeof persistableDocument.zones === "object" && !Array.isArray(persistableDocument.zones)
        ? {
            zones: Object.fromEntries(
              Object.entries(persistableDocument.zones).map(([zoneKey, blocks]) => [
                zoneKey,
                Array.isArray(blocks) ? blocks.map(normalizeBlock) : blocks,
              ]),
            ),
          }
        : {}),
    };
  }

  /**
   * 校验页面 SEO/OG 元数据（存于 doc.metadata，不在 puckData 内）。
   * 与 collectPuckDataErrors 并列，作为发布校验单一源的一部分；
   * 前端预检与后端发布兜底都调用，规则一致。
   */
  private collectMetadataIssues(metadata: unknown): ContentTemplateIssue[] {
    const issues: ContentTemplateIssue[] = [];
    if (typeof metadata !== "object" || Array.isArray(metadata)) {
      return [this.createServerValidationIssue("页面设置：metadata 格式不正确", "metadata")];
    }
    const m = (metadata ?? {}) as Record<string, unknown>;
    const requiredFields = new Set<string>(CONTENT_TEMPLATE_PAGE_METADATA.requiredForPublication);
    for (const field of CONTENT_TEMPLATE_PAGE_METADATA.requiredForPublication) {
      const limit = CONTENT_TEMPLATE_PAGE_METADATA.limits[field];
      const value = m[field];
      const label = PAGE_METADATA_FIELD_LABELS[field] || field;
      if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
        if (requiredFields.has(field)) {
          issues.push(this.createServerValidationIssue(
            `页面设置：${label}（${field}）不能为空`,
            `metadata.${field}`,
            undefined,
            field,
          ));
        }
        continue;
      }
      if (typeof value !== "string") {
        issues.push(this.createServerValidationIssue(
          `页面设置：${field} 必须是字符串`,
          `metadata.${field}`,
          undefined,
          field,
        ));
        continue;
      }
      if (typeof value === "string" && value.length > limit) {
        issues.push(this.createServerValidationIssue(
          `页面设置：${field} 过长（${value.length}/${limit} 字）`,
          `metadata.${field}`,
          undefined,
          field,
        ));
      }
      if (
        typeof value === "string" &&
        PLACEHOLDER_MARKERS.some((marker) => value.includes(marker))
      ) {
        issues.push(this.createServerValidationIssue(
          `页面设置：${label}（${field}）仍是占位内容，请填写正式文案`,
          `metadata.${field}`,
          undefined,
          field,
        ));
      }
    }
    const ogImage = m.ogImage;
    if (
      typeof ogImage === "string" &&
      ogImage.trim() &&
      !this.isSafeAssetUrl(ogImage)
    ) {
      issues.push(this.createServerValidationIssue(
        "页面设置：ogImage 分享图地址不合法",
        "metadata.ogImage",
        undefined,
        "ogImage",
      ));
    } else if (typeof ogImage === "string" && ogImage.trim()) {
      const missingUploadErrors: string[] = [];
      this.collectMissingUploadError(
        ogImage.trim(),
        "页面设置：ogImage 分享图",
        new Set<string>(),
        missingUploadErrors,
      );
      for (const message of missingUploadErrors) {
        issues.push(this.createServerValidationIssue(
          message,
          "metadata.ogImage",
          undefined,
          "ogImage",
        ));
      }
    }
    return issues;
  }

  /**
   * 正式素材授权随 PageDocument 草稿保存，但不进入公开 metadata 白名单。
   * 每个当前可见素材 URL 必须有一条精确匹配的来源与授权编号；相同 URL 只需一条。
   */
  private collectMediaRightsIssues(
    puckData: unknown,
    metadata: unknown,
    pageKey: string,
  ): ContentTemplateIssue[] {
    const references = getPageDocumentMediaReferences(puckData, metadata, pageKey);
    if (references.length === 0) return [];
    const issues: ContentTemplateIssue[] = [];
    const source = metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata as Record<string, unknown>
      : {};
    const rights = source.mediaRights;
    if (!Array.isArray(rights)) {
      return [this.createServerValidationIssue(
        "页面设置：请为当前公开素材补齐来源与授权编号",
        "metadata.mediaRights",
        undefined,
        "mediaRights",
      )];
    }

    const contract = CONTENT_TEMPLATE_PAGE_METADATA.mediaRights;
    if (rights.length > contract.maxItems) {
      issues.push(this.createServerValidationIssue(
        `页面设置：素材授权记录过多（${rights.length}/${contract.maxItems} 条）`,
        "metadata.mediaRights",
        undefined,
        "mediaRights",
      ));
    }

    const validRights = new Map<string, number>();
    rights.slice(0, contract.maxItems).forEach((raw, index) => {
      const basePath = `metadata.mediaRights[${index}]`;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        issues.push(this.createServerValidationIssue(
          `页面设置：第 ${index + 1} 条素材授权记录格式不正确`,
          basePath,
          undefined,
          "mediaRights",
          index,
        ));
        return;
      }
      const record = raw as Record<string, unknown>;
      let complete = true;
      for (const field of ["assetUrl", "source", "authorizationId"] as const) {
        const value = record[field];
        const limit = contract.fieldLimits[field];
        const label = field === "assetUrl"
          ? "素材地址"
          : field === "source"
            ? "素材来源"
            : "授权编号";
        if (typeof value !== "string" || !value.trim()) {
          complete = false;
          issues.push(this.createServerValidationIssue(
            `页面设置：第 ${index + 1} 条${label}不能为空`,
            `${basePath}.${field}`,
            undefined,
            field,
            index,
          ));
        } else if (value.length > limit) {
          complete = false;
          issues.push(this.createServerValidationIssue(
            `页面设置：第 ${index + 1} 条${label}过长（${value.length}/${limit} 字）`,
            `${basePath}.${field}`,
            undefined,
            field,
            index,
          ));
        }
      }
      const assetUrl = typeof record.assetUrl === "string"
        ? record.assetUrl.trim()
        : "";
      if (assetUrl && !this.isSafeAssetUrl(assetUrl)) {
        complete = false;
        issues.push(this.createServerValidationIssue(
          `页面设置：第 ${index + 1} 条素材地址不合法`,
          `${basePath}.assetUrl`,
          undefined,
          "assetUrl",
          index,
        ));
      }
      if (!complete || !assetUrl) return;
      const previousIndex = validRights.get(assetUrl);
      if (previousIndex !== undefined) {
        issues.push(this.createServerValidationIssue(
          `页面设置：第 ${index + 1} 条素材授权与第 ${previousIndex + 1} 条重复`,
          `${basePath}.assetUrl`,
          undefined,
          "assetUrl",
          index,
        ));
        return;
      }
      validRights.set(assetUrl, index);
    });

    for (const reference of references) {
      if (validRights.has(reference.url)) continue;
      const displayUrl = reference.url.length > 80
        ? `${reference.url.slice(0, 77)}…`
        : reference.url;
      issues.push(this.createServerValidationIssue(
        `页面设置：素材「${displayUrl}」缺少来源或授权编号`,
        "metadata.mediaRights",
        reference.blockId,
        "mediaRights",
        reference.index,
      ));
    }
    return issues;
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

  private isSafeExternalLink(value: string): boolean {
    try {
      const url = new URL(value.trim());
      return url.protocol === "https:" && Boolean(url.hostname);
    } catch {
      return false;
    }
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
    const revisions = await this.prisma.pageDocumentRevision.findMany({
      where: { documentId: doc.id },
      orderBy: { version: "desc" },
      take: 20,
    });
    return revisions.map((revision) => ({
      ...revision,
      isPublished: revision.id === doc.publishedRevisionId,
    }));
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
        puckData: toInputJsonValue(
          this.removePageDocumentBusinessFactCopies(revision.puckData),
        ),
        metadata: toInputJsonValue(
          withoutContentTemplatePublicationAttestation(revision.metadata),
        ),
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

  async rollbackPagePublication(
    pageKey: string,
    revisionId: number,
    expectedPublishedRevisionId: number,
    userId: number,
  ) {
    if (!Number.isInteger(revisionId) || revisionId <= 0) {
      throw new BadRequestException("发布版本标识不正确");
    }
    if (!Number.isInteger(expectedPublishedRevisionId) || expectedPublishedRevisionId <= 0) {
      throw new BadRequestException("当前线上版本标识不正确");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM page_documents WHERE pageKey = ${pageKey} FOR UPDATE
      `;
      const document = await tx.pageDocument.findUnique({ where: { pageKey } });
      if (!document) throw new NotFoundException("页面文档不存在");
      if (document.publishedRevisionId !== expectedPublishedRevisionId) {
        throw new ConflictException("线上版本已变化，请重新加载版本记录后再回滚");
      }
      const revision = await tx.pageDocumentRevision.findFirst({
        where: {
          id: revisionId,
          documentId: document.id,
          status: "published",
        },
      });
      if (!revision || revision.documentId !== document.id) {
        throw new BadRequestException("指定发布版本不属于当前页面");
      }
      if (revision.id === document.publishedRevisionId) {
        throw new BadRequestException("该版本已经是当前线上版本");
      }

      const updated = await tx.pageDocument.updateMany({
        where: {
          id: document.id,
          publishedRevisionId: expectedPublishedRevisionId,
        },
        data: { publishedRevisionId: revision.id },
      });
      if (updated.count !== 1) {
        throw new ConflictException("线上版本刚刚发生变化，请重新加载后再回滚");
      }
      const rolledBackAt = new Date();
      await tx.operationLog.create({
        data: {
          userId,
          action: "PAGE_PUBLICATION_ROLLED_BACK",
          module: "page-builder",
          targetId: document.id,
          detail: JSON.stringify({
            schemaVersion: 1,
            event: "PAGE_PUBLICATION_ROLLED_BACK",
            actor: userId,
            timestamp: rolledBackAt.toISOString(),
            pageKey,
            pageDocumentId: document.id,
            fromRevision: expectedPublishedRevisionId,
            toRevision: revision.id,
            toRevisionVersion: revision.version,
            result: "succeeded",
          }),
        },
      });
      const updatedDocument = await tx.pageDocument.findUnique({ where: { id: document.id } });
      return { document: updatedDocument, revision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    this.notifyPublicChange(pageKey, "page-document-published", result.revision.version);
    return result.document;
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
      blockCount: isRecord(row.puckData) && Array.isArray(row.puckData.content)
        ? row.puckData.content.filter(
            (block) =>
              isRecord(block) &&
              typeof block.type === "string" &&
              block.type !== "业务功能区",
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
    puckData: Record<string, unknown>;
    metadata?: Record<string, unknown>;
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
        puckData: toInputJsonValue(input.puckData),
        metadata: toInputJsonValue(
          withoutContentTemplatePublicationAttestation(input.metadata),
        ),
        createdBy: input.createdBy ?? null,
      },
    });
  }

  async updatePageScheme(
    id: number,
    input: {
      name?: string;
      puckData?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ) {
    const scheme = await this.prisma.pageScheme.findUnique({ where: { id } });
    if (!scheme) throw new BadRequestException("装修方案不存在");
    const data: Prisma.PageSchemeUpdateInput = {};
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
    if (input.puckData !== undefined) {
      data.puckData = toInputJsonValue(input.puckData);
    }
    if (input.metadata !== undefined) {
      data.metadata = toInputJsonValue(
        withoutContentTemplatePublicationAttestation(input.metadata),
      );
    }
    return this.prisma.pageScheme.update({ where: { id }, data });
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
    expectedUpdatedAt: string,
  ) {
    const expected = this.parseExpectedUpdatedAt(expectedUpdatedAt);
    if (!expected) {
      throw new BadRequestException("放弃草稿时缺少页面版本标识");
    }
    const doc = await this.prisma.pageDocument.findUnique({ where: { pageKey } });
    if (!doc) throw new BadRequestException("该页面没有草稿");
    if (doc.updatedAt.getTime() !== expected.getTime()) {
      throw new ConflictException(
        "草稿已被其他编辑保存，请刷新页面后重试",
      );
    }
    const publishedRevision = doc.publishedRevisionId
      ? await this.prisma.pageDocumentRevision.findFirst({
          where: { id: doc.publishedRevisionId, documentId: doc.id },
        })
      : null;
    if (doc.publishedRevisionId && !publishedRevision) {
      throw new ConflictException("线上版本指针无效，请先修复发布状态再放弃草稿");
    }
    if (publishedRevision) {
      const restored = await this.prisma.pageDocument.updateMany({
        where: { pageKey, updatedAt: doc.updatedAt },
        data: {
          puckData: toInputJsonValue(publishedRevision.puckData),
          metadata: toInputJsonValue(
            withoutContentTemplatePublicationAttestation(publishedRevision.metadata),
          ),
          status: "PUBLISHED",
        },
      });
      if (restored.count !== 1) {
        throw new ConflictException(
          "草稿刚刚被其他编辑保存，请刷新页面后重试",
        );
      }
      return this.prisma.pageDocument.findUnique({ where: { pageKey } });
    }
    const deleted = await this.prisma.pageDocument.deleteMany({
      where: { pageKey, updatedAt: doc.updatedAt },
    });
    if (deleted.count !== 1) {
      throw new ConflictException(
        "草稿刚刚被其他编辑保存，请刷新页面后重试",
      );
    }
    return { deleted: true };
  }
}
