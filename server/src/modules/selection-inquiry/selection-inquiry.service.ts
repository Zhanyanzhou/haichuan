import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProductsService } from "../products/products.service";

@Injectable()
export class SelectionInquiryService {
  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
  ) {}

  async findAll(params: {
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { status, keyword, page = 1, pageSize = 20 } = params;
    const where: any = {};
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

  async create(data: {
    customerName?: string;
    phone?: string;
    email?: string;
    wechat?: string;
    message?: string;
    items: Array<{
      productId?: number;
      productNameSnapshot: string;
      productSkuSnapshot?: string;
      productImageSnapshot?: string;
    }>;
    customer?: { id: number; name: string | null; phone: string; email: string | null };
  }) {
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
    );
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

    // 写入时以服务端规范名称与受控媒体地址覆盖客户端快照；
    // productSkuSnapshot 为展示性描述文本，保留客户端值（已 trim），不作为可见性或安全依据。
    return this.prisma.selectionInquiry.create({
      data: {
        customerName,
        phone,
        customerId: data.customer?.id || null,
        email: data.customer?.email || data.email?.trim() || null,
        wechat: data.wechat?.trim() || null,
        message: data.message?.trim() || null,
        status: "PENDING",
        items: {
          create: validItems.map((item) => {
            const snap = snapshots.get(item.productId);
            if (!snap) {
              throw new BadRequestException(
                "所选作品中有不存在或暂不可选的款式，请刷新页面后重新选择",
              );
            }
            return {
              productId: item.productId,
              productNameSnapshot: snap.name,
              productSkuSnapshot: item.productSkuSnapshot?.trim() || null,
              productImageSnapshot: snap.mediaUrl,
            };
          }),
        },
      },
      include: { items: true },
    });
  }

  async update(id: number, data: { status?: string; handlerId?: number }) {
    const updateData: any = {};
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
