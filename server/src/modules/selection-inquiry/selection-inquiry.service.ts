import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import { PRIVACY_CONSENT_VERSION } from "../../common/privacy/privacy-consent";
import { CreateSelectionInquiryDto } from "./dto/create-selection-inquiry.dto";
import type { CustomerPrincipal } from "../../common/security/authenticated-principal";
import {
  assertMatchingSubmission,
  isUniqueConstraintError,
  prepareLeadIdempotency,
} from "../leads/lead-submission";

@Injectable()
export class SelectionInquiryService {
  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
  ) {}

  private hasSameProductSet(
    items: Array<{ productId: number | null }>,
    expectedProductIds: number[],
  ) {
    const actualProductIds = Array.from(
      new Set(
        items.flatMap((item) =>
          typeof item.productId === "number" ? [item.productId] : [],
        ),
      ),
    ).sort((left, right) => left - right);
    return (
      actualProductIds.length === expectedProductIds.length &&
      actualProductIds.every((productId, index) => productId === expectedProductIds[index])
    );
  }

  async findAll(params: {
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { status, keyword, page = 1, pageSize = 20 } = params;
    const where: Prisma.SelectionInquiryWhereInput = {};
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { customerName: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    const [list, total] = await Promise.all([
      this.prisma.selectionInquiry.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      this.prisma.selectionInquiry.count({ where }),
    ]);
    return { list, total, page: +page, pageSize: +pageSize };
  }

  async findOne(id: number) {
    return this.prisma.selectionInquiry.findUnique({
      where: { id },
      include: { items: true },
    });
  }

  async create(
    data: CreateSelectionInquiryDto & {
      customer?: CustomerPrincipal;
      idempotencyKey?: string;
    },
  ) {
    // 终线守卫：controller 以外的调用也必须提交真正的 boolean true。
    if (data.privacyConsent !== true) {
      throw new BadRequestException("请阅读并同意隐私说明");
    }
    const customerName = data.customer?.name?.trim() || data.customerName?.trim();
    const phone = data.customer?.phone || data.phone?.trim();
    const items = data.items || [];

    if (!customerName || customerName.length > 50) {
      throw new BadRequestException("请填写有效的称呼");
    }
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      throw new BadRequestException("请填写正确的手机号码");
    }
    if (items.length === 0 || items.length > 20) {
      throw new BadRequestException("请选择 1 至 20 款作品");
    }

    // 服务端逐个复核 productId（P0 安全）：不再信任客户端传入的商品 ID、名称或图片。
    // 每个条目必须带有效 productId，否则无法服务端复核，整次提交拒绝。
    // 复用 ProductsService 既有可见性规则：游客仅 PUBLIC，会员/已审核合作商家按其可见范围；
    // 不可见（不存在 / 下架 / 软删除 / 越权）统一拒绝，错误不区分原因、不泄露内部信息。
    const validItems = items.filter(
      (item): item is (typeof items)[number] & { productId: number } =>
        typeof item.productId === "number" &&
        Number.isInteger(item.productId) &&
        item.productId > 0,
    );
    if (validItems.length !== items.length) {
      throw new BadRequestException("所选作品信息不完整，请刷新页面后重新选择");
    }
    const distinctIds = Array.from(
      new Set(validItems.map((item) => item.productId)),
    ).sort((left, right) => left - right);
    const snapshots =
      await this.productsService.resolveVisibleProductSnapshots(
        distinctIds,
        data.customer,
      );
    if (snapshots.size !== distinctIds.length) {
      throw new BadRequestException(
        "所选作品中有不存在或暂不可选的款式，请刷新页面后重新选择",
      );
    }

    const itemByProductId = new Map(
      validItems.map((item) => [item.productId, item]),
    );
    const createItems = distinctIds.map((productId) => {
      const item = itemByProductId.get(productId);
      const snap = snapshots.get(productId);
      if (!item || !snap) {
        throw new BadRequestException(
          "所选作品中有不存在或暂不可选的款式，请刷新页面后重新选择",
        );
      }
      return {
        productId,
        productNameSnapshot: snap.name,
        productSkuSnapshot: item.productSkuSnapshot?.trim() || null,
        productImageSnapshot: snap.mediaUrl,
      };
    });
    const privacyConsentedAt = new Date();
    const recentSince = new Date(privacyConsentedAt.getTime() - 10 * 60 * 1000);
    const email = data.customer?.email || data.email?.trim() || null;
    const wechat = data.wechat?.trim() || null;
    const message = data.message?.trim() || null;
    const idempotency = prepareLeadIdempotency(data.idempotencyKey, {
      sourceType: "SELECTION_INQUIRY",
      customerId: data.customer?.id || null,
      customerName,
      phone,
      email,
      wechat,
      message,
      productIds: distinctIds,
      productSkuSnapshots: createItems.map((item) => ({
        productId: item.productId,
        productSkuSnapshot: item.productSkuSnapshot,
      })),
      privacyConsentVersion: PRIVACY_CONSENT_VERSION,
    });

    // 同一手机号与同一商品集合在短时间内的重复请求复用原记录。
    // 显式幂等键跨接口全局唯一；旧客户端仍保留十分钟同集合兼容去重。
    const create = async () => this.prisma.$transaction(
      async (transaction) => {
        if (idempotency.idempotencyKeyHash) {
          const existing = await transaction.lead.findUnique({
            where: { idempotencyKeyHash: idempotency.idempotencyKeyHash },
            select: {
              sourceType: true,
              submissionFingerprint: true,
              selectionInquiryId: true,
            },
          });
          if (existing) {
            assertMatchingSubmission(
              existing,
              "SELECTION_INQUIRY",
              idempotency.submissionFingerprint,
            );
            if (!existing.selectionInquiryId) {
              throw new BadRequestException("幂等提交记录不完整");
            }
            return transaction.selectionInquiry.findUniqueOrThrow({
              where: { id: existing.selectionInquiryId },
              include: { items: true },
            });
          }
        } else {
          const recentInquiries = await transaction.selectionInquiry.findMany({
            where: { phone, createdAt: { gte: recentSince } },
            include: { items: true },
            orderBy: { createdAt: "desc" },
          });
          const existingInquiry = recentInquiries.find((inquiry) =>
            this.hasSameProductSet(inquiry.items, distinctIds),
          );
          if (existingInquiry) return existingInquiry;
        }

        // 写入时以服务端规范名称与受控媒体地址覆盖客户端快照；
        // productSkuSnapshot 为展示性描述文本，保留客户端值（已 trim），不作为可见性或安全依据。
        return transaction.selectionInquiry.create({
          data: {
            customerName,
            phone,
            customerId: data.customer?.id || null,
            email,
            wechat,
            message,
            privacyConsent: true,
            privacyConsentVersion: PRIVACY_CONSENT_VERSION,
            privacyConsentedAt,
            status: "PENDING",
            items: { create: createItems },
            lead: {
              create: {
                sourceType: "SELECTION_INQUIRY",
                customerId: data.customer?.id || null,
                customerName,
                phone,
                email,
                wechat,
                idempotencyKeyHash: idempotency.idempotencyKeyHash,
                submissionFingerprint: idempotency.submissionFingerprint,
                activities: {
                  create: {
                    type: "CREATED",
                    content: "选款咨询已提交",
                    currentStatus: "PENDING",
                    metadata: { selectedProductCount: createItems.length },
                  },
                },
              },
            },
          },
          include: { items: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    try {
      return await create();
    } catch (error) {
      if (!idempotency.idempotencyKeyHash || !isUniqueConstraintError(error)) {
        throw error;
      }
      const existing = await this.prisma.lead.findUnique({
        where: { idempotencyKeyHash: idempotency.idempotencyKeyHash },
        select: {
          sourceType: true,
          submissionFingerprint: true,
          selectionInquiryId: true,
        },
      });
      if (!existing) throw error;
      assertMatchingSubmission(
        existing,
        "SELECTION_INQUIRY",
        idempotency.submissionFingerprint,
      );
      if (!existing.selectionInquiryId) throw error;
      return this.prisma.selectionInquiry.findUniqueOrThrow({
        where: { id: existing.selectionInquiryId },
        include: { items: true },
      });
    }
  }

  async update(id: number, data: { status?: string; handlerId?: number }) {
    const updateData: Prisma.SelectionInquiryUncheckedUpdateInput = {};
    if (data.status) updateData.status = data.status;
    if (data.handlerId !== undefined) {
      updateData.handledBy = data.handlerId;
      updateData.handledAt = new Date();
    }
    return this.prisma.selectionInquiry.update({
      where: { id },
      data: updateData,
    });
  }
}
