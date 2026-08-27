import { Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

const REFRESH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionMetadata = {
  userAgent?: string | null;
  ip?: string | null;
};

type IssuedRefreshSession = {
  refreshToken: string;
  expiresAt: Date;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function optionalHash(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? sha256(normalized) : null;
}

function createOpaqueToken(): string {
  return randomBytes(48).toString("base64url");
}

function sessionMetadata(metadata: SessionMetadata) {
  return {
    userAgentHash: optionalHash(metadata.userAgent),
    ipHash: optionalHash(metadata.ip),
  };
}

@Injectable()
export class RefreshSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async issueAdmin(
    userId: number,
    metadata: SessionMetadata,
  ): Promise<IssuedRefreshSession> {
    const refreshToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + REFRESH_SESSION_TTL_MS);
    await this.prisma.adminRefreshSession.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        familyId: randomUUID(),
        expiresAt,
        ...sessionMetadata(metadata),
      },
    });
    return { refreshToken, expiresAt };
  }

  async issueCustomer(
    customerId: number,
    metadata: SessionMetadata,
  ): Promise<IssuedRefreshSession> {
    return this.issueCustomerInTransaction(this.prisma, customerId, metadata);
  }

  async issueCustomerInTransaction(
    client: Pick<Prisma.TransactionClient, "customerRefreshSession">,
    customerId: number,
    metadata: SessionMetadata,
  ): Promise<IssuedRefreshSession> {
    const refreshToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + REFRESH_SESSION_TTL_MS);
    await client.customerRefreshSession.create({
      data: {
        customerId,
        tokenHash: sha256(refreshToken),
        familyId: randomUUID(),
        expiresAt,
        ...sessionMetadata(metadata),
      },
    });
    return { refreshToken, expiresAt };
  }

  async rotateAdmin(
    refreshToken: string,
    metadata: SessionMetadata,
  ): Promise<IssuedRefreshSession & { userId: number }> {
    const tokenHash = sha256(refreshToken);
    const current = await this.prisma.adminRefreshSession.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        familyId: true,
        user: { select: { status: true } },
      },
    });
    if (!current) throw new UnauthorizedException("刷新会话无效");
    if (current.user.status === "DISABLED") {
      await this.revokeAdminFamily(current.familyId, new Date());
      throw new UnauthorizedException("账号无效或已被禁用");
    }

    const nextToken = createOpaqueToken();
    const nextHash = sha256(nextToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + REFRESH_SESSION_TTL_MS);
    const claimed = await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.adminRefreshSession.updateMany({
          where: {
            id: current.id,
            tokenHash,
            revokedAt: null,
            replacedByHash: null,
            expiresAt: { gt: now },
          },
          data: {
            lastUsedAt: now,
            revokedAt: now,
            replacedByHash: nextHash,
          },
        });
        if (updated.count !== 1) return false;
        await tx.adminRefreshSession.create({
          data: {
            userId: current.userId,
            tokenHash: nextHash,
            familyId: current.familyId,
            expiresAt,
            ...sessionMetadata(metadata),
          },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!claimed) {
      await this.revokeAdminFamily(current.familyId, now);
      throw new UnauthorizedException("刷新会话已失效，请重新登录");
    }
    return { refreshToken: nextToken, expiresAt, userId: current.userId };
  }

  async rotateCustomer(
    refreshToken: string,
    metadata: SessionMetadata,
  ): Promise<IssuedRefreshSession & { customerId: number }> {
    const tokenHash = sha256(refreshToken);
    const current = await this.prisma.customerRefreshSession.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        customerId: true,
        familyId: true,
        customer: { select: { status: true } },
      },
    });
    if (!current) throw new UnauthorizedException("刷新会话无效");
    if (current.customer.status === "DISABLED") {
      await this.revokeCustomerFamily(current.familyId, new Date());
      throw new UnauthorizedException("客户访问身份无效");
    }

    const nextToken = createOpaqueToken();
    const nextHash = sha256(nextToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + REFRESH_SESSION_TTL_MS);
    const claimed = await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.customerRefreshSession.updateMany({
          where: {
            id: current.id,
            tokenHash,
            revokedAt: null,
            replacedByHash: null,
            expiresAt: { gt: now },
          },
          data: {
            lastUsedAt: now,
            revokedAt: now,
            replacedByHash: nextHash,
          },
        });
        if (updated.count !== 1) return false;
        await tx.customerRefreshSession.create({
          data: {
            customerId: current.customerId,
            tokenHash: nextHash,
            familyId: current.familyId,
            expiresAt,
            ...sessionMetadata(metadata),
          },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!claimed) {
      await this.revokeCustomerFamily(current.familyId, now);
      throw new UnauthorizedException("刷新会话已失效，请重新登录");
    }
    return {
      refreshToken: nextToken,
      expiresAt,
      customerId: current.customerId,
    };
  }

  async revokeAdmin(refreshToken: string | null | undefined): Promise<void> {
    if (!refreshToken) return;
    const current = await this.prisma.adminRefreshSession.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      select: { familyId: true },
    });
    if (current) await this.revokeAdminFamily(current.familyId, new Date());
  }

  async revokeCustomer(refreshToken: string | null | undefined): Promise<void> {
    if (!refreshToken) return;
    const current = await this.prisma.customerRefreshSession.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      select: { familyId: true },
    });
    if (current) await this.revokeCustomerFamily(current.familyId, new Date());
  }

  async revokeAllAdmin(userId: number): Promise<void> {
    await this.prisma.adminRefreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllCustomer(customerId: number): Promise<void> {
    await this.prisma.customerRefreshSession.updateMany({
      where: { customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeAdminFamily(familyId: string, revokedAt: Date) {
    await this.prisma.adminRefreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
  }

  private async revokeCustomerFamily(familyId: string, revokedAt: Date) {
    await this.prisma.customerRefreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
  }
}
