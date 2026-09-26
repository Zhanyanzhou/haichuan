import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "../products/products.service";
import {
  PRIVACY_CONSENT_CONTENT_HASH,
  PRIVACY_CONSENT_VERSION,
} from "../../common/privacy/privacy-consent";
import { CreateSelectionInquiryDto } from "./dto/create-selection-inquiry.dto";
import type {
  CustomerPrincipal,
  StaffPrincipal,
} from "../../common/security/authenticated-principal";
import {
  assertMatchingSubmission,
  isUniqueConstraintError,
  prepareLeadIdempotency,
} from "../leads/lead-submission";
import { LeadsService } from "../leads/leads.service";
import { UpdateSelectionInquiryDto } from "./dto/update-selection-inquiry.dto";
import {
  CUSTOMER_SELECTION_INQUIRY_DEDUPE_SELECT,
  CUSTOMER_SELECTION_INQUIRY_SUBMISSION_SELECT,
  toCustomerSelectionInquirySubmission,
} from "./customer-selection-inquiry.response";
import { lockActiveCustomerForWrite } from "../customers/customer-write-gate";

const MAX_IDEMPOTENT_TRANSACTION_ATTEMPTS = 3;

function isSerializableTransactionConflict(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2034",
  );
}

@Injectable()
export class SelectionInquiryService {
  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
    private leadsService: LeadsService,
  ) {}

  private requireStaffActor(
    actor: Pick<StaffPrincipal, "id" | "sessionFamilyId"> | number | undefined,
  ) {
    const principal = typeof actor === "number" ? { id: actor } : actor;
    if (!principal || !Number.isInteger(principal.id) || principal.id <= 0) {
      throw new ForbiddenException("无法确认选款咨询查看人");
    }
    return principal;
  }

  private async lockStaffReader(
    transaction: Prisma.TransactionClient,
    actor: Pick<StaffPrincipal, "id" | "sessionFamilyId">,
  ) {
    const user = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR SHARE`,
    );
    if (user.length !== 1) {
      throw new ForbiddenException("当前员工已停用或无权查看选款咨询");
    }
    if (!actor.sessionFamilyId) return;
    const session = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
    );
    if (session.length !== 1) {
      throw new ForbiddenException("当前员工会话已失效，不能继续查看选款咨询");
    }
  }

  private async findIdempotentSubmission(
    client: Pick<Prisma.TransactionClient, "lead" | "selectionInquiry">,
    idempotencyKeyHash: string,
    submissionFingerprint: string,
  ) {
    const existing = await client.lead.findUnique({
      where: { idempotencyKeyHash },
      select: {
        sourceType: true,
        submissionFingerprint: true,
        selectionInquiryId: true,
      },
    });
    if (!existing) return null;

    assertMatchingSubmission(
      existing,
      "SELECTION_INQUIRY",
      submissionFingerprint,
    );
    if (!existing.selectionInquiryId) {
      throw new BadRequestException("幂等提交记录不完整");
    }
    return client.selectionInquiry.findUniqueOrThrow({
      where: { id: existing.selectionInquiryId },
      select: CUSTOMER_SELECTION_INQUIRY_SUBMISSION_SELECT,
    });
  }

  /**
   * 幂等赢家也是客户私有结果。无论从预检、P2034 还是 P2002 进入恢复，
   * 已登录客户都必须在同一事务内重新复核 ACTIVE + authVersion 后才能读取。
   */
  private async findAuthorizedIdempotentSubmission(
    idempotencyKeyHash: string,
    submissionFingerprint: string,
    customer: CustomerPrincipal | undefined,
  ) {
    for (
      let attempt = 0;
      attempt < MAX_IDEMPOTENT_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            if (customer) {
              await lockActiveCustomerForWrite(transaction, customer);
            }
            return this.findIdempotentSubmission(
              transaction,
              idempotencyKeyHash,
              submissionFingerprint,
            );
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!isSerializableTransactionConflict(error)) throw error;
        if (attempt === MAX_IDEMPOTENT_TRANSACTION_ATTEMPTS - 1) {
          throw new ServiceUnavailableException(
            "请求繁忙，请使用同一幂等键稍后重试",
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)));
      }
    }
    throw new ServiceUnavailableException(
      "请求繁忙，请使用同一幂等键稍后重试",
    );
  }

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
  }, actorInput?: Pick<StaffPrincipal, "id" | "sessionFamilyId"> | number) {
    const actor = this.requireStaffActor(actorInput);
    const { status, keyword, page = 1, pageSize = 20 } = params;
    const where: Prisma.SelectionInquiryWhereInput = {};
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { customerName: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    return this.prisma.$transaction(async (transaction) => {
      await this.lockStaffReader(transaction, actor);
      const [list, total] = await Promise.all([
        transaction.selectionInquiry.findMany({
          where,
          include: { items: true },
          orderBy: { createdAt: "desc" },
          skip: (+page - 1) * +pageSize,
          take: +pageSize,
        }),
        transaction.selectionInquiry.count({ where }),
      ]);
      return { list, total, page: +page, pageSize: +pageSize };
    });
  }

  async findOne(
    id: number,
    actorInput?: Pick<StaffPrincipal, "id" | "sessionFamilyId"> | number,
  ) {
    const actor = this.requireStaffActor(actorInput);
    return this.prisma.$transaction(async (transaction) => {
      await this.lockStaffReader(transaction, actor);
      return transaction.selectionInquiry.findUnique({
        where: { id },
        include: { items: true },
      });
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
    const itemByProductId = new Map(
      validItems.map((item) => [item.productId, item]),
    );
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
      productSkuSnapshots: distinctIds.map((productId) => ({
        productId,
        productSkuSnapshot:
          itemByProductId.get(productId)?.productSkuSnapshot?.trim() || null,
      })),
      privacyConsentVersion: data.privacyConsentVersion,
      privacyConsentContentHash: data.privacyConsentContentHash,
    });

    if (idempotency.idempotencyKeyHash) {
      // 已落库请求的安全重放必须早于作品当前可见性校验。
      // 否则首次提交成功但响应丢失后，作品恰好下架会让客户丢失 canonical Lead 回执。
      // 已登录客户仍在同一事务中锁定并复核 ACTIVE/authVersion。
      const replay = await this.findAuthorizedIdempotentSubmission(
        idempotency.idempotencyKeyHash,
        idempotency.submissionFingerprint,
        data.customer,
      );
      if (replay) return toCustomerSelectionInquirySubmission(replay);
    }

    if (
      data.privacyConsentVersion !== PRIVACY_CONSENT_VERSION
      || data.privacyConsentContentHash !== PRIVACY_CONSENT_CONTENT_HASH
    ) {
      throw new BadRequestException("隐私说明已更新，请刷新页面后重新提交");
    }

    const privacyConsentedAt = new Date();
    const recentSince = new Date(privacyConsentedAt.getTime() - 10 * 60 * 1000);

    // 旧客户端未传幂等键时，仅对完整规范化请求摘要一致的短时重试复用原记录。
    // 禁止只凭手机号+作品集合复用：那会把不同联系人/留言合并并泄露原回执 ID。
    // 显式幂等键跨接口全局唯一；旧客户端仍保留十分钟同集合兼容去重。
    const create = async () => this.prisma.$transaction(
      async (transaction) => {
        const lockedCustomer = data.customer
          ? await lockActiveCustomerForWrite(transaction, data.customer)
          : undefined;
        if (idempotency.idempotencyKeyHash) {
          const existing = await this.findIdempotentSubmission(
            transaction,
            idempotency.idempotencyKeyHash,
            idempotency.submissionFingerprint,
          );
          if (existing) return existing;
        }

        // 与合作资格审核共用客户行锁，并在同一 Serializable 事务内读取作品。
        // 新请求只能使用锁内最新资格；已经提交的幂等回放仍在本检查前返回。
        const snapshots =
          await this.productsService.resolveVisibleProductSnapshots(
            distinctIds,
            lockedCustomer,
            transaction,
          );
        if (snapshots.size !== distinctIds.length) {
          throw new BadRequestException(
            "所选作品中有不存在或暂不可选的款式，请刷新页面后重新选择",
          );
        }
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

        if (!idempotency.idempotencyKeyHash) {
          const recentInquiries = await transaction.selectionInquiry.findMany({
            where: { phone, createdAt: { gte: recentSince } },
            select: CUSTOMER_SELECTION_INQUIRY_DEDUPE_SELECT,
            orderBy: { createdAt: "desc" },
          });
          const existingInquiry = recentInquiries.find((inquiry) =>
            inquiry.lead?.submissionFingerprint === idempotency.submissionFingerprint
            && this.hasSameProductSet(inquiry.items, distinctIds),
          );
          if (existingInquiry) return existingInquiry;
        }

        // 写入时以服务端规范名称与受控媒体地址覆盖客户端快照；
        // productSkuSnapshot 为展示性描述文本，保留客户端值（已 trim），不作为可见性或安全依据。
        const inquiry = await transaction.selectionInquiry.create({
          data: {
            customerName,
            phone,
            customerId: data.customer?.id || null,
            email,
            wechat,
            message,
            privacyConsent: true,
            privacyConsentVersion: PRIVACY_CONSENT_VERSION,
            privacyConsentHash: PRIVACY_CONSENT_CONTENT_HASH,
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
          select: CUSTOMER_SELECTION_INQUIRY_SUBMISSION_SELECT,
        });
        await transaction.consentRecord.create({
          data: {
            customerId: data.customer?.id || null,
            purpose: "SERVICE_PRIVACY",
            decision: "GRANTED",
            policyVersion: PRIVACY_CONSENT_VERSION,
            policyContentHash: PRIVACY_CONSENT_CONTENT_HASH,
            locale: "ZH_CN",
            source: `selection-inquiry:${inquiry.id}`,
            decidedAt: privacyConsentedAt,
          },
        });
        return inquiry;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const createWithRetry = async () => {
      const attempts = idempotency.idempotencyKeyHash
        ? MAX_IDEMPOTENT_TRANSACTION_ATTEMPTS
        : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          return await create();
        } catch (error) {
          if (
            !idempotency.idempotencyKeyHash ||
            !isSerializableTransactionConflict(error)
          ) {
            throw error;
          }

          // P2034 表示整段 Serializable 事务已经回滚。该路径有显式唯一幂等键，
          // 所以可安全重放完整短事务；先读赢家可避免重复进入下一轮竞争。
          const existing = await this.findAuthorizedIdempotentSubmission(
            idempotency.idempotencyKeyHash,
            idempotency.submissionFingerprint,
            data.customer,
          );
          if (existing) return existing;
          if (attempt === attempts - 1) {
            throw new ServiceUnavailableException(
              "请求繁忙，请使用同一幂等键稍后重试",
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)));
        }
      }
      throw new ServiceUnavailableException(
        "请求繁忙，请使用同一幂等键稍后重试",
      );
    };

    try {
      return toCustomerSelectionInquirySubmission(await createWithRetry());
    } catch (error) {
      if (!idempotency.idempotencyKeyHash || !isUniqueConstraintError(error)) {
        throw error;
      }
      const existing = await this.findAuthorizedIdempotentSubmission(
        idempotency.idempotencyKeyHash,
        idempotency.submissionFingerprint,
        data.customer,
      );
      if (!existing) throw error;
      return toCustomerSelectionInquirySubmission(existing);
    }
  }

  async update(
    id: number,
    data: UpdateSelectionInquiryDto,
    idempotencyKey: string | undefined,
    createdBy?: Pick<StaffPrincipal, "id" | "sessionFamilyId"> | number,
  ) {
    return this.leadsService.updateBySource(
      "selection",
      id,
      {
        status: data.status,
        assignedTo: data.handlerId,
        nextFollowUpAt: data.nextFollowUpAt,
        closureReason: data.closureReason,
        reopenReason: data.reopenReason,
      },
      idempotencyKey,
      createdBy,
    );
  }
}
