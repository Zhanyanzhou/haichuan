// 客户域服务：注册登录/资料地址/密码找回(邮件)/收藏/短信验证码/合规(导出与注销)
import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailerService } from '../../common/mailer/mailer.service';
import { SmsService } from '../../common/sms/sms.service';
import { OrdersService } from '../orders/orders.service';
import { RefreshSessionService, type SessionMetadata } from '../../common/security/refresh-session.service';

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
    private readonly mailer: MailerService,
    private readonly sms: SmsService,
    private readonly refreshSessions: RefreshSessionService,
  ) {}

  private normalizePhone(phone: string) {
    const value = phone?.trim();
    if (!/^1\d{10}$/.test(value)) throw new BadRequestException('请提供有效的手机号码');
    return value;
  }

  private issueAccessToken(customerId: number) {
    return this.jwtService.sign(
      { sub: customerId, type: 'customer', tokenUse: 'access' },
      { expiresIn: '15m' },
    );
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

  // ===== 手机验真（短信验证码，开关式强制）=====

  /** 注册是否需要短信验证码（前端据此渲染验证码输入；默认关，凭据接入后由运营打开） */
  smsRequirements() {
    return { registerRequired: this.sms.isRegisterVerificationRequired() };
  }

  /**
   * 发送注册验证码：60s 冷却 + 每日每号 ≤10 条 + SHA-256(phone:code) 哈希落库（5 分钟时效）。
   * SMS 可用性前置到写库之前，杜绝"提示已发送但通道未配置"的假成功。
   * 暴力风险评估：码空间 10^6，register 接口 5/min 限流 + 码 5 分钟时效 + 哈希绑定手机号，
   * 有效尝试窗口内最多数百次，可接受。
   */
  async requestSmsCode(phoneInput: string) {
    const phone = phoneInput?.trim();
    if (!/^1\d{10}$/.test(phone || '')) {
      throw new BadRequestException('请提供有效的手机号码');
    }
    const now = new Date();

    const cooldownSince = new Date(now.getTime() - 60_000);
    const recent = await this.prisma.customerSmsCode.findFirst({
      where: { phone, createdAt: { gte: cooldownSince } },
      select: { id: true },
    });
    if (recent) throw new BadRequestException('发送过于频繁，请 60 秒后再试');

    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const sentToday = await this.prisma.customerSmsCode.count({
      where: { phone, createdAt: { gte: dayStart } },
    });
    if (sentToday >= 10) {
      throw new BadRequestException('今日该手机号验证码发送次数已达上限，请明日再试或联系顾问');
    }

    if (!this.sms.isAvailable()) {
      throw new ServiceUnavailableException('短信服务未配置，请直接注册或联系顾问');
    }

    // crypto 随机 6 位数字码（Math.random 不可用于安全场景）
    const code = String(randomInt(100000, 1000000));
    const codeHash = createHash('sha256').update(`${phone}:${code}`).digest('hex');
    await this.prisma.customerSmsCode.create({
      data: {
        phone,
        codeHash,
        purpose: 'REGISTER',
        expiresAt: new Date(now.getTime() + 5 * 60_000),
      },
    });
    const result = await this.sms.sendVerificationCode(phone, code);
    if (!result.delivered) {
      throw new ServiceUnavailableException('短信发送失败，请稍后重试或联系顾问');
    }
    return { message: '验证码已发送，5 分钟内有效' };
  }

  /** 校验并作废注册验证码（一次性；哈希绑定手机号，换号无效） */
  private async consumeSmsCode(
    tx: Prisma.TransactionClient,
    phone: string,
    smsCode: string,
    now: Date,
  ) {
    const codeHash = createHash('sha256')
      .update(`${phone}:${smsCode.trim()}`)
      .digest('hex');
    const record = await tx.customerSmsCode.findFirst({
      where: { phone, codeHash, usedAt: null, expiresAt: { gte: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new BadRequestException('短信验证码错误或已过期');
    const claimed = await tx.customerSmsCode.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gte: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new BadRequestException('短信验证码错误或已过期');
  }

  async register(
    data: { phone: string; password: string; name?: string; email?: string; smsCode?: string },
    sessionMetadata?: SessionMetadata,
  ) {
    const phone = this.normalizePhone(data.phone);
    const smsRequired = this.sms.isRegisterVerificationRequired();
    if (smsRequired && !data.smsCode?.trim()) throw new BadRequestException('请输入短信验证码');
    const name = data.name?.trim();
    const email = data.email?.trim();
    if (!name || name.length > 50) throw new BadRequestException('请填写有效的称呼');
    if (email && (email.length > 100 || !/^\S+@\S+\.\S+$/.test(email))) {
      throw new BadRequestException('请填写正确的邮箱地址');
    }
    const password = this.validatePassword(data.password);
    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      if (smsRequired) {
        await this.consumeSmsCode(tx, phone, data.smsCode!, now);
      }
      const existing = await tx.customer.findUnique({ where: { phone } });
      if (existing?.passwordHash) throw new ConflictException('该手机号已注册，请直接登录');
      const customer = existing
        ? tx.customer.update({
            where: { id: existing.id },
            data: { name, email: email || existing.email, passwordHash, status: 'ACTIVE' },
          })
        : tx.customer.create({ data: { phone, name, email: email || null, passwordHash } });
      const resolvedCustomer = await customer;
      const refreshSession = sessionMetadata
        ? await this.refreshSessions.issueCustomerInTransaction(
            tx,
            resolvedCustomer.id,
            sessionMetadata,
          )
        : undefined;
      return { customer: resolvedCustomer, refreshSession };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return {
      ...this.accountResponse(created.customer),
      refreshSession: created.refreshSession,
    };
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

  async resume(customerId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, status: 'ACTIVE' },
      select: { id: true, phone: true, name: true, email: true },
    });
    if (!customer) throw new UnauthorizedException('客户登录已失效');
    return this.accountResponse(customer);
  }

  /**
   * 发起密码找回：按邮箱查找客户并发送一次性重置链接（30 分钟有效）。
   * 防枚举：①无论邮箱是否已注册，响应统一为同一句提示；
   * ②SMTP 可用性检查前置到账户查询之前——否则"未配置→503 vs 统一消息"会暴露邮箱是否已注册。
   * 已知可接受残余：发送失败（send_failed）仅在账户存在时发生，理论上可作枚举信号，
   * 但该态本身是运维事故态且 mailer 已落错误日志，行业普遍接受此权衡。
   */
  async requestPasswordReset(email: string) {
    const trimmed = email?.trim();
    if (!trimmed || trimmed.length > 100 || !/^\S+@\S+\.\S+$/.test(trimmed)) {
      throw new BadRequestException('请填写正确的邮箱地址');
    }
    if (!this.mailer.isAvailable()) {
      throw new ServiceUnavailableException('邮件服务未配置，请联系客服或管理员重置密码');
    }

    const customer = await this.prisma.customer.findFirst({ where: { email: trimmed } });
    if (!customer) {
      return { message: '若该邮箱已注册，重置邮件已发送，请注意查收' };
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    // 同一客户旧的有效令牌全部作废，只保留最新一封邮件的链接可重置
    await this.prisma.$transaction([
      this.prisma.customerPasswordResetToken.updateMany({
        where: { customerId: customer.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.customerPasswordResetToken.create({
        data: { customerId: customer.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
      }),
    ]);

    const resetUrl = `${this.mailer.getSiteBaseUrl()}/customer/reset?token=${token}`;
    const result = await this.mailer.send({
      to: trimmed,
      subject: '密码重置 - 海川珠宝',
      html: this.mailer.renderShell(`
        <p>您好，${customer.name || customer.phone}：</p>
        <p>我们收到了重置您账户密码的请求。请点击下方按钮设置新密码（30 分钟内有效，且仅可使用一次）：</p>
        <p style="margin:24px 0;">
          <a href="${resetUrl}" style="display:inline-block;background:#d4af37;color:#1a1a1a;padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:bold;">重置密码</a>
        </p>
        <p style="word-break:break-all;color:#888;font-size:12px;">若按钮无法点击，请复制此链接到浏览器打开：<br/>${resetUrl}</p>
      `),
    });
    if (!result.delivered) {
      throw new ServiceUnavailableException('邮件发送失败，请稍后重试或联系客服');
    }
    return { message: '若该邮箱已注册，重置邮件已发送，请注意查收' };
  }

  /** 使用重置令牌设置新密码（令牌一次性，成功后立即作废） */
  async resetPassword(token: string, password: string) {
    if (!token || token.length !== 64 || !/^[0-9a-f]+$/.test(token)) {
      throw new BadRequestException('重置链接无效');
    }
    const newPassword = this.validatePassword(password);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await this.prisma.customerPasswordResetToken.findUnique({ where: { tokenHash } });
    const now = new Date();
    if (!record || record.usedAt || record.expiresAt < now) {
      throw new BadRequestException('重置链接无效或已过期，请重新发起找回');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.customerPasswordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gte: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('重置链接无效或已过期，请重新发起找回');
      }
      await tx.customer.update({ where: { id: record.customerId }, data: { passwordHash } });
      await tx.customerRefreshSession.updateMany({
        where: { customerId: record.customerId, revokedAt: null },
        data: { revokedAt: now },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { message: '密码已重置，请使用新密码登录' };
  }

  /**
   * 下单：仅登录客户可用（游客下单已关闭，见 DECISIONS D.7）。
   * 不再签发 access token —— 登录态只来自 register/login，避免"知道手机号即可接管账户"。
   * 不 upsert 覆盖既有客户资料（P1-19 同源问题随之消除）。
   */
  async checkout(
    customerId: number,
    data: {
      address: string;
      items: { skuId: number; quantity: number }[];
      customerEmail?: string;
      couponId?: number;
    },
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        accountType: true,
        partnerStatus: true,
      },
    });
    if (!customer) throw new NotFoundException('客户不存在');

    const address = data.address?.trim();
    if (!address || address.length > 500) throw new BadRequestException('请提供有效的收货地址');

    const cartRows = await this.prisma.cart.findMany({
      where: { userId: customer.id },
      select: { skuId: true, quantity: true },
    });
    const cartItemsBySku = new Map<number, number>();
    for (const item of cartRows) {
      cartItemsBySku.set(
        item.skuId,
        (cartItemsBySku.get(item.skuId) ?? 0) + item.quantity,
      );
    }
    if (cartItemsBySku.size === 0) {
      throw new ConflictException('购物车为空或已完成结算，请刷新后确认');
    }
    const submittedItemsBySku = new Map<number, number>();
    for (const item of data.items) {
      submittedItemsBySku.set(
        item.skuId,
        (submittedItemsBySku.get(item.skuId) ?? 0) + item.quantity,
      );
    }
    if (
      submittedItemsBySku.size !== cartItemsBySku.size ||
      [...cartItemsBySku].some(
        ([skuId, quantity]) => submittedItemsBySku.get(skuId) !== quantity,
      )
    ) {
      throw new ConflictException('购物车已发生变化，请刷新后重新确认');
    }

    const order = await this.ordersService.create({
      customerId: customer.id,
      customerName: customer.name || customer.phone,
      customerPhone: customer.phone,
      customerEmail: data.customerEmail?.trim() || customer.email || undefined,
      address,
      items: [...cartItemsBySku].map(([skuId, quantity]) => ({ skuId, quantity })),
      couponId: data.couponId,
      checkoutCustomer: customer,
      operator: { type: 'CUSTOMER', id: customer.id, name: customer.name || customer.phone },
    });
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

  // ===== 收藏（心愿单）=====

  /** 收藏/取消收藏（toggle）。商品不存在/未发布直接 404，不给私密作品留探测口。 */
  async toggleFavorite(customerId: number, productId: number) {
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new BadRequestException('无效的商品');
    }
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('作品不存在或不可收藏');

    const existing = await this.prisma.customerFavorite.findUnique({
      where: { customerId_productId: { customerId, productId } },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.customerFavorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    // @@unique 兜底：并发双击重复收藏时第二个 create 抛 P2002，视为已收藏
    try {
      await this.prisma.customerFavorite.create({ data: { customerId, productId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { favorited: true };
      }
      throw error;
    }
    return { favorited: true };
  }

  /** 我的心愿单（仅公开可见作品，按收藏时间倒序） */
  async listFavorites(customerId: number) {
    const favorites = await this.prisma.customerFavorite.findMany({
      where: { customerId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            code: true,
            shortDescription: true,
            price: true,
            status: true,
            visibility: true,
            deletedAt: true,
            primaryImage: { select: { url: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    // 商品后续下架/删除/转为会员可见时，从心愿单展示中过滤（记录保留，重新上架自动恢复）
    return favorites
      .filter((f) => f.product && f.product.deletedAt === null && f.product.status === 'PUBLISHED' && f.product.visibility === 'PUBLIC')
      .map((f) => ({
        id: f.id,
        productId: f.product.id,
        name: f.product.name,
        code: f.product.code,
        shortDescription: f.product.shortDescription,
        price: f.product.price,
        image: f.product.primaryImage?.url || null,
        favoritedAt: f.createdAt,
      }));
  }

  /** 登录客户对一批作品的收藏态（商品详情页批量查询用） */
  async getFavoriteProductIds(customerId: number) {
    const rows = await this.prisma.customerFavorite.findMany({
      where: { customerId },
      select: { productId: true },
    });
    return rows.map((r) => r.productId);
  }

  // ===== 合规（个保法可携带权 + 注销权）=====

  /**
   * 导出我的全部个人数据（JSON，可携带权）：资料/地址/订单(含收款状态)/咨询/选款/收藏/评价/服务通知。
   * 不含任何他人数据与内部凭据（passwordHash/审核备注等一律排除）。
   */
  async exportMyData(customerId: number) {
    const [profile, addresses, orders, inquiries, selectionInquiries, favorites, reviews, notifications] =
      await Promise.all([
        this.prisma.customer.findUnique({
          where: { id: customerId },
          select: {
            phone: true, name: true, email: true,
            accountType: true, partnerStatus: true, createdAt: true,
          },
        }),
        this.prisma.customerAddress.findMany({
          where: { customerId },
          select: { recipientName: true, recipientPhone: true, province: true, city: true, district: true, detail: true, postalCode: true, isDefault: true },
        }),
        this.prisma.order.findMany({
          where: { customerId },
          select: {
            orderNo: true, status: true, totalAmount: true, discountAmount: true, finalAmount: true,
            createdAt: true, completedAt: true, cancelledAt: true,
            items: { select: { productNameSnapshot: true, quantity: true, unitPrice: true, subtotal: true } },
            payments: { select: { paymentNo: true, method: true, status: true, amount: true, paidAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.inquiry.findMany({
          where: { customerId },
          select: { message: true, reply: true, status: true, createdAt: true },
        }),
        this.prisma.selectionInquiry.findMany({
          where: { customerId },
          select: { message: true, status: true, createdAt: true },
        }),
        this.prisma.customerFavorite.findMany({
          where: { customerId },
          select: { product: { select: { id: true, name: true } }, createdAt: true },
        }),
        this.prisma.productReview.findMany({
          where: { customerId },
          select: { product: { select: { id: true, name: true } }, rating: true, content: true, status: true, createdAt: true },
        }),
        this.prisma.notification.findMany({
          where: { customerId },
          select: {
            type: true,
            locale: true,
            title: true,
            body: true,
            actionUrl: true,
            status: true,
            availableAt: true,
            readAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
    return {
      exportedAt: new Date().toISOString(),
      profile,
      addresses,
      orders,
      inquiries,
      selectionInquiries,
      favorites,
      reviews,
      notifications,
    };
  }

  /**
   * 注销账户：密码二次确认后匿名化处理。
   * 保留（交易/财务记录法定保存 + 公开展示内容）：
   *   订单与收款记录、已通过的评价（昵称本就脱敏展示）。
   * 清除/失效：姓名、邮箱、密码哈希（置随机值使其永久无法登录）、地址簿、收藏、状态置 DISABLED。
   */
  async closeAccount(customerId: number, password: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer?.passwordHash || !(await bcrypt.compare(password || '', customer.passwordHash))) {
      throw new UnauthorizedException('密码不正确，无法注销');
    }
    // 作废全部未使用的密码重置令牌，防止注销后经邮件链接复活
    await this.prisma.customerPasswordResetToken.updateMany({
      where: { customerId, usedAt: null },
      data: { usedAt: new Date() },
    });
    const randomPasswordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 12);
    await this.prisma.$transaction([
      this.prisma.customerAddress.deleteMany({ where: { customerId } }),
      this.prisma.customerFavorite.deleteMany({ where: { customerId } }),
      this.prisma.notificationDelivery.updateMany({
        where: {
          notification: { customerId },
          status: { in: ['PENDING', 'SENDING', 'FAILED'] },
        },
        data: {
          status: 'CANCELLED',
          nextAttemptAt: null,
          lastErrorCode: 'CUSTOMER_ACCOUNT_CLOSED',
        },
      }),
      this.prisma.notification.updateMany({
        where: { customerId, status: { not: 'ARCHIVED' } },
        data: { status: 'ARCHIVED' },
      }),
      this.prisma.customerRefreshSession.updateMany({
        where: { customerId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.customer.update({
        where: { id: customerId },
        data: {
          name: '已注销会员',
          email: null,
          passwordHash: randomPasswordHash,
          status: 'DISABLED',
        },
      }),
    ]);
    return { message: '账户已注销，感谢您曾经的信任与陪伴' };
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

  // ===== 后台客户档案（只读运营视图；写操作不在本批范围）=====

  /** 客户列表：分页 + 关键词（手机/姓名/邮箱）。与订单中心同口径：客服可见完整联系方式。 */
  async adminListCustomers(params: { page?: string; pageSize?: string; keyword?: string; status?: string }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));
    const where: Prisma.CustomerWhereInput = {};
    const keyword = params.keyword?.trim();
    if (keyword) {
      where.OR = [
        { phone: { contains: keyword } },
        { name: { contains: keyword } },
        { email: { contains: keyword } },
      ];
    }
    if (params.status === 'ACTIVE' || params.status === 'DISABLED') where.status = params.status;

    const [list, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        // 显式 select 排除 passwordHash（与 getProfile 同规则）
        select: {
          id: true, phone: true, name: true, email: true, status: true,
          accountType: true, partnerStatus: true, lastOrderAt: true, createdAt: true,
          _count: { select: { orders: true, favorites: true, inquiries: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  /** 客户 360° 详情：档案 + 消费聚合 + 最近订单 + 收藏 + 地址数。 */
  async adminGetCustomer(customerId: number) {
    if (!Number.isInteger(customerId) || customerId <= 0) throw new BadRequestException('无效的客户');
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true, phone: true, name: true, email: true, status: true,
        accountType: true, partnerStatus: true, lastOrderAt: true, createdAt: true, updatedAt: true,
        _count: { select: { inquiries: true, selectionInquiries: true, reviews: true } },
      },
    });
    if (!customer) throw new NotFoundException('客户不存在');

    const [orderAgg, recentOrders, favorites, addressCount] = await Promise.all([
      // 消费聚合：排除已取消订单；金额显式转字符串，避免 Decimal 序列化差异
      this.prisma.order.aggregate({
        where: { customerId, status: { not: 'CANCELLED' } },
        _count: true,
        _sum: { finalAmount: true, paidAmount: true, refundedAmount: true },
      }),
      this.prisma.order.findMany({
        where: { customerId },
        select: {
          id: true, orderNo: true, status: true, orderType: true,
          finalAmount: true, paidAmount: true, createdAt: true, shippedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.customerFavorite.findMany({
        where: { customerId },
        select: {
          createdAt: true,
          product: { select: { id: true, name: true, status: true, deletedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.customerAddress.count({ where: { customerId } }),
    ]);

    return {
      customer,
      stats: {
        orderCount: orderAgg._count,
        totalSpent: orderAgg._sum.finalAmount?.toString() ?? '0',
        totalPaid: orderAgg._sum.paidAmount?.toString() ?? '0',
        totalRefunded: orderAgg._sum.refundedAmount?.toString() ?? '0',
      },
      recentOrders,
      favorites,
      addressCount,
    };
  }
}
