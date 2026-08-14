import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

type AddressInput = {
  recipientName: string;
  recipientPhone: string;
  province?: string;
  city?: string;
  district?: string;
  detail: string;
  postalCode?: string;
  isDefault?: boolean;
};

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly jwtService: JwtService,
  ) {}

  private normalizePhone(phone: string) {
    const value = phone?.trim();
    if (!/^1\d{10}$/.test(value)) throw new BadRequestException('请提供有效的手机号码');
    return value;
  }

  private issueAccessToken(customerId: number) {
    return this.jwtService.sign({ sub: customerId, type: 'customer' }, { expiresIn: '24h' });
  }

  private validatePassword(password: string) {
    if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException('密码至少需要 8 位，并包含字母和数字');
    }
    return password;
  }

  private accountResponse(customer: { id: number; phone: string; name: string | null; email: string | null }) {
    return {
      accessToken: this.issueAccessToken(customer.id),
      customer: { id: customer.id, phone: customer.phone, name: customer.name, email: customer.email },
    };
  }

  async register(data: { phone: string; password: string; name?: string; email?: string }) {
    const phone = this.normalizePhone(data.phone);
    const name = data.name?.trim();
    const email = data.email?.trim();
    if (!name || name.length > 50) throw new BadRequestException('请填写有效的称呼');
    if (email && (email.length > 100 || !/^\S+@\S+\.\S+$/.test(email))) {
      throw new BadRequestException('请填写正确的邮箱地址');
    }
    const password = this.validatePassword(data.password);
    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    if (existing?.passwordHash) throw new ConflictException('该手机号已注册，请直接登录');

    const passwordHash = await bcrypt.hash(password, 12);
    const customer = existing
      ? await this.prisma.customer.update({
          where: { id: existing.id },
          data: { name, email: email || existing.email, passwordHash, status: 'ACTIVE' },
        })
      : await this.prisma.customer.create({ data: { phone, name, email: email || null, passwordHash } });
    return this.accountResponse(customer);
  }

  async login(data: { phone: string; password: string }) {
    const phone = this.normalizePhone(data.phone);
    const customer = await this.prisma.customer.findUnique({ where: { phone } });
    if (!customer?.passwordHash || !(await bcrypt.compare(data.password || '', customer.passwordHash))) {
      throw new UnauthorizedException('手机号或密码不正确');
    }
    if (customer.status === 'DISABLED') throw new UnauthorizedException('该账户已被停用');
    return this.accountResponse(customer);
  }

  /**
   * 下单：仅登录客户可用（游客下单已关闭，见 DECISIONS D.7）。
   * 不再签发 access token —— 登录态只来自 register/login，避免"知道手机号即可接管账户"。
   * 不 upsert 覆盖既有客户资料（P1-19 同源问题随之消除）。
   */
  async checkout(
    customerId: number,
    data: { address: string; items: { skuId: number; quantity: number }[]; customerEmail?: string },
  ) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('客户不存在');

    const address = data.address?.trim();
    if (!address || address.length > 500) throw new BadRequestException('请提供有效的收货地址');

    const order = await this.ordersService.create({
      customerId: customer.id,
      customerName: customer.name || customer.phone,
      customerPhone: customer.phone,
      customerEmail: data.customerEmail?.trim() || customer.email || undefined,
      address,
      items: data.items,
      paymentMethod: 'bank_transfer',
    });
    await this.prisma.customer.update({ where: { id: customer.id }, data: { lastOrderAt: new Date() } });
    return { order };
  }

  async getProfile(customerId: number) {
    // 显式 select 排除 passwordHash（P0-2），避免哈希外泄
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, phone: true, name: true, email: true, status: true, lastOrderAt: true, createdAt: true, updatedAt: true },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    return customer;
  }

  async getSelectionInquiries(customerId: number) {
    return this.prisma.selectionInquiry.findMany({
      where: { customerId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInquiries(customerId: number) {
    return this.prisma.inquiry.findMany({
      where: { customerId },
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateProfile(customerId: number, data: { name?: string; email?: string }) {
    const name = data.name?.trim();
    const email = data.email?.trim();
    if (name !== undefined && (!name || name.length > 50)) throw new BadRequestException('姓名格式不正确');
    if (email !== undefined && (email.length > 100 || (email.length > 0 && !/^\S+@\S+\.\S+$/.test(email)))) {
      throw new BadRequestException('请填写正确的邮箱地址');
    }
    // 返回时显式排除 passwordHash（P0-2）
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { name, email },
      select: { id: true, phone: true, name: true, email: true, status: true, lastOrderAt: true, createdAt: true, updatedAt: true },
    });
  }

  async listAddresses(customerId: number) {
    return this.prisma.customerAddress.findMany({ where: { customerId }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
  }

  async createAddress(customerId: number, data: AddressInput) {
    const address = this.normalizeAddress(data);
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.customerAddress.count({ where: { customerId } });
      const isDefault = data.isDefault || count === 0;
      if (isDefault) await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
      return tx.customerAddress.create({ data: { customerId, ...address, isDefault } });
    });
  }

  async updateAddress(customerId: number, addressId: number, data: AddressInput) {
    const existing = await this.prisma.customerAddress.findFirst({ where: { id: addressId, customerId } });
    if (!existing) throw new NotFoundException('地址不存在');
    const address = this.normalizeAddress(data);
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
      return tx.customerAddress.update({ where: { id: addressId }, data: { ...address, isDefault: data.isDefault ?? existing.isDefault } });
    });
  }

  async deleteAddress(customerId: number, addressId: number) {
    const result = await this.prisma.customerAddress.deleteMany({ where: { id: addressId, customerId } });
    if (result.count !== 1) throw new NotFoundException('地址不存在');
    return { success: true };
  }

  private normalizeAddress(data: AddressInput) {
    const recipientName = data.recipientName?.trim();
    const recipientPhone = this.normalizePhone(data.recipientPhone);
    const detail = data.detail?.trim();
    if (!recipientName || recipientName.length > 50 || !detail || detail.length > 300) {
      throw new BadRequestException('收货地址信息不完整');
    }
    return {
      recipientName,
      recipientPhone,
      province: data.province?.trim() || null,
      city: data.city?.trim() || null,
      district: data.district?.trim() || null,
      detail,
      postalCode: data.postalCode?.trim() || null,
    };
  }
}
