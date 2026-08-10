import { BadRequestException, Injectable, MessageEvent } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EventEmitter } from "events";
import { fromEvent, interval, map, merge, Observable, startWith } from "rxjs";

const PUCK_COMPONENT_LABELS = [
  "首屏主视觉",
  "单图海报",
  "双图海报",
  "图文混排",
  "全屏出血图",
  "文字横幅",
  "产品展示行",
  "分类卡片",
  "卡片网格",
  "分割面板",
  "轮播图",
  "视频区块",
  "热区图",
] as const;

const PUCK_COMPONENT_SET = new Set<string>(PUCK_COMPONENT_LABELS);

const PUCK_REQUIRED_IMAGE_FIELDS: Record<string, string[]> = {
  首屏主视觉: ["desktopImage"],
  单图海报: ["desktopImage"],
  双图海报: ["mainImage"],
  图文混排: ["image"],
  全屏出血图: ["image"],
  分割面板: ["image"],
  热区图: ["image"],
};

const PUCK_IMAGE_FIELDS = [
  "desktopImage",
  "mobileImage",
  "mainImage",
  "detailImage",
  "image",
  "posterUrl",
  "url",
];

const PUCK_LINK_FIELDS = ["linkUrl", "link"];

@Injectable()
export class PageModulesService {
  private readonly publicEvents = new EventEmitter();

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
      version: revision.version,
    };
  }

  async savePageDocument(
    pageKey: string,
    puckData: any,
    metadata?: any,
    editorVersion?: string,
  ) {
    const existing = await this.prisma.pageDocument.findUnique({
      where: { pageKey },
    });
    if (existing) {
      return this.prisma.pageDocument.update({
        where: { pageKey },
        data: {
          puckData,
          metadata: metadata || {},
          editorVersion,
          status: "DRAFT",
        },
      });
    }
    return this.prisma.pageDocument.create({
      data: {
        pageKey,
        puckData,
        metadata: metadata || {},
        editorVersion,
        schemaVersion: 1,
      },
    });
  }

  async publishPageDocument(pageKey: string, userId?: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.pageDocument.findUnique({
        where: { pageKey },
      });
      if (!doc) throw new Error("Page document not found");
      const errors = await this.collectPuckDataErrors(tx, doc.puckData);
      if (errors.length > 0) {
        const visibleErrors = errors.slice(0, 8).join("；");
        const suffix = errors.length > 8 ? `；另有 ${errors.length - 8} 个问题` : "";
        throw new BadRequestException(`页面发布校验失败：${visibleErrors}${suffix}`);
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
        where: { pageKey },
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

  async validatePageDocument(pageKey: string, puckDataOverride?: any) {
    let puckData = puckDataOverride;
    if (puckData === undefined) {
      const doc = await this.prisma.pageDocument.findUnique({
        where: { pageKey },
      });
      if (!doc) return { valid: false, errors: ["页面草稿不存在"] };
      puckData = doc.puckData;
    }
    const errors = await this.collectPuckDataErrors(this.prisma, puckData);
    return { valid: errors.length === 0, errors };
  }

  private async collectPuckDataErrors(db: any, puckData: any): Promise<string[]> {
    const errors: string[] = [];
    const productIds = new Set<number>();

    if (!puckData || typeof puckData !== "object") {
      return ["页面数据为空或格式不正确"];
    }

    if (!Array.isArray(puckData.content)) {
      errors.push("页面内容 content 必须是数组");
    }

    const validateBlock = (block: any, path: string) => {
      if (!block || typeof block !== "object") {
        errors.push(`${path}：区块格式不正确`);
        return;
      }

      const type = typeof block.type === "string" ? block.type : "";
      const label = type || path;
      const props = block.props;

      if (!type || !PUCK_COMPONENT_SET.has(type)) {
        errors.push(`${path}：未知区块类型「${type || "空"}」`);
        return;
      }

      if (!props || typeof props !== "object") {
        errors.push(`${label}：配置 props 不能为空`);
        return;
      }

      if (!this.isNonEmptyString(props.id)) {
        errors.push(`${label}：区块 ID 不能为空`);
      }

      for (const field of PUCK_REQUIRED_IMAGE_FIELDS[type] || []) {
        if (!this.isNonEmptyString(props[field])) {
          errors.push(`${label}：${field} 图片不能为空`);
        }
      }

      for (const field of PUCK_IMAGE_FIELDS) {
        const value = props[field];
        if (this.isNonEmptyString(value) && !this.isSafeAssetUrl(value)) {
          errors.push(`${label}：${field} 图片地址不合法`);
        }
      }

      if (this.isNonEmptyString(props.videoUrl) && !this.isSafeAssetUrl(props.videoUrl)) {
        errors.push(`${label}：videoUrl 视频地址不合法`);
      }

      for (const field of PUCK_LINK_FIELDS) {
        const value = props[field];
        if (this.isNonEmptyString(value) && !this.isSafeLink(value)) {
          errors.push(`${label}：${field} 链接不合法`);
        }
      }

      if (type === "视频区块" && !this.isNonEmptyString(props.videoUrl)) {
        errors.push(`${label}：videoUrl 视频地址不能为空`);
      }

      if (type === "产品展示行") {
        if (!Array.isArray(props.productIds)) {
          errors.push(`${label}：productIds 必须是商品 ID 数组`);
        } else {
          for (const id of props.productIds) {
            const numericId = Number(id);
            if (!Number.isInteger(numericId) || numericId <= 0) {
              errors.push(`${label}：商品 ID「${id}」格式不正确`);
            } else {
              productIds.add(numericId);
            }
          }
        }
      }

      if (type === "轮播图") {
        if (!Array.isArray(props.images) || props.images.length === 0) {
          errors.push(`${label}：轮播图至少需要 1 张图片`);
        } else {
          props.images.forEach((item: any, index: number) => {
            if (!this.isNonEmptyString(item?.url) || !this.isSafeAssetUrl(item.url)) {
              errors.push(`${label}：第 ${index + 1} 张轮播图片地址不合法`);
            }
            if (this.isNonEmptyString(item?.link) && !this.isSafeLink(item.link)) {
              errors.push(`${label}：第 ${index + 1} 张轮播链接不合法`);
            }
          });
        }
      }

      if (type === "热区图" && Array.isArray(props.hotspots)) {
        props.hotspots.forEach((item: any, index: number) => {
          if (this.isNonEmptyString(item?.link) && !this.isSafeLink(item.link)) {
            errors.push(`${label}：第 ${index + 1} 个热区链接不合法`);
          }
        });
      }
    };

    if (Array.isArray(puckData.content)) {
      puckData.content.forEach((block: any, index: number) => {
        validateBlock(block, `第 ${index + 1} 个区块`);
      });
    }

    if (puckData.zones && typeof puckData.zones === "object") {
      Object.entries(puckData.zones).forEach(([zoneKey, zoneBlocks]) => {
        if (!Array.isArray(zoneBlocks)) {
          errors.push(`插槽 ${zoneKey}：内容必须是数组`);
          return;
        }
        zoneBlocks.forEach((block: any, index: number) => {
          validateBlock(block, `插槽 ${zoneKey} 第 ${index + 1} 个区块`);
        });
      });
    }

    if (productIds.size > 0) {
      const products = await db.product.findMany({
        where: { id: { in: [...productIds] }, deletedAt: null },
        select: { id: true },
      });
      const existingIds = new Set(products.map((item: { id: number }) => item.id));
      for (const id of productIds) {
        if (!existingIds.has(id)) {
          errors.push(`产品展示行：商品 ID ${id} 不存在或已删除`);
        }
      }
    }

    return errors;
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }

  private isSafeAssetUrl(value: string): boolean {
    const url = value.trim();
    if (url.startsWith("/")) return true;
    return /^https?:\/\//i.test(url);
  }

  private isSafeLink(value: string): boolean {
    const url = value.trim();
    if (url.startsWith("/") || url.startsWith("#")) return true;
    return /^https?:\/\//i.test(url);
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

  async restorePageDocumentRevision(pageKey: string, version: number) {
    if (!Number.isInteger(version) || version <= 0) {
      throw new BadRequestException("版本号不正确");
    }

    const doc = await this.prisma.pageDocument.findUnique({
      where: { pageKey },
    });
    if (!doc) throw new BadRequestException("页面草稿不存在");

    const revision = await this.prisma.pageDocumentRevision.findFirst({
      where: { documentId: doc.id, version },
    });
    if (!revision) throw new BadRequestException("指定版本不存在");

    return this.prisma.pageDocument.update({
      where: { pageKey },
      data: {
        puckData: revision.puckData as any,
        metadata: revision.metadata as any,
        status: "DRAFT",
        editorVersion: doc.editorVersion,
      },
    });
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
}
