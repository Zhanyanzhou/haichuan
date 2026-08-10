import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class SelectionInquiryService {
  constructor(private prisma: PrismaService) {}

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
    if (items.some((item) => !item.productNameSnapshot?.trim())) {
      throw new BadRequestException("所选作品信息不完整");
    }

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
          create: items.map((item) => ({
            productId: item.productId,
            productNameSnapshot: item.productNameSnapshot,
            productSkuSnapshot: item.productSkuSnapshot,
            productImageSnapshot: item.productImageSnapshot,
          })),
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
