import type { Role } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  AdminAccessTokenPayload,
  CustomerAccessTokenPayload,
  CustomerPrincipal,
  StaffPrincipal,
} from './authenticated-principal';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validSubject(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function validFamily(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

export function isAdminAccessTokenPayload(
  payload: unknown,
): payload is AdminAccessTokenPayload {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Partial<AdminAccessTokenPayload>;
  return candidate.type === 'admin'
    && candidate.tokenUse === 'access'
    && validSubject(candidate.sub)
    && (candidate.sessionFamilyId === undefined || validFamily(candidate.sessionFamilyId));
}

export function isCustomerAccessTokenPayload(
  payload: unknown,
): payload is CustomerAccessTokenPayload {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Partial<CustomerAccessTokenPayload>;
  return candidate.type === 'customer'
    && candidate.tokenUse === 'access'
    && validSubject(candidate.sub)
    && (candidate.authVersion === undefined
      || (Number.isInteger(candidate.authVersion) && Number(candidate.authVersion) > 0))
    && (candidate.sessionFamilyId === undefined || validFamily(candidate.sessionFamilyId));
}

export async function findActiveStaffPrincipal(
  prisma: PrismaService,
  payload: AdminAccessTokenPayload,
): Promise<StaffPrincipal | null> {
  return prisma.user.findFirst({
    where: {
      id: payload.sub,
      status: { not: 'DISABLED' },
      ...(payload.sessionFamilyId
        ? {
            adminRefreshSessions: {
              some: {
                familyId: payload.sessionFamilyId,
                revokedAt: null,
                expiresAt: { gt: new Date() },
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      username: true,
      realName: true,
      phone: true,
      email: true,
      avatar: true,
      role: true,
      status: true,
      lastLoginIp: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function findActiveCustomerPrincipal(
  prisma: PrismaService,
  payload: CustomerAccessTokenPayload,
): Promise<CustomerPrincipal | null> {
  const authVersion = payload.authVersion ?? 1;
  return prisma.customer.findFirst({
    where: {
      id: payload.sub,
      status: { not: 'DISABLED' },
      authVersion,
      ...(payload.sessionFamilyId
        ? {
            customerRefreshSessions: {
              some: {
                familyId: payload.sessionFamilyId,
                authVersion,
                revokedAt: null,
                expiresAt: { gt: new Date() },
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      accountType: true,
      partnerStatus: true,
    },
  });
}

export function staffHasAnyRole(
  user: Pick<StaffPrincipal, 'role'>,
  requiredRoles: Role[] | undefined,
): boolean {
  return !requiredRoles || requiredRoles.includes(user.role);
}
