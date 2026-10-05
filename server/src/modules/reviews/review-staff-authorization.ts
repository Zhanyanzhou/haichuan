import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';

export type ReviewStaffActor = Pick<StaffPrincipal, 'id' | 'sessionFamilyId'>;

type ReviewStaffAccess = 'READ' | 'MODERATE';
type LockMode = 'read' | 'write';

export async function lockAuthorizedReviewStaff(
  transaction: Prisma.TransactionClient,
  actor: ReviewStaffActor,
  access: ReviewStaffAccess,
  mode: LockMode,
): Promise<void> {
  if (!actor || !Number.isInteger(actor.id) || actor.id <= 0) {
    throw new ForbiddenException('当前员工身份无效，不能访问评价管理');
  }

  const staff = access === 'MODERATE'
    ? mode === 'write'
      ? await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR UPDATE`,
        )
      : await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR SHARE`,
        )
    : mode === 'write'
      ? await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR UPDATE`,
        )
      : await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE') FOR SHARE`,
        );
  if (staff.length !== 1) {
    throw new ForbiddenException('当前员工已停用或无权访问评价管理');
  }

  if (!actor.sessionFamilyId) return;
  const sessions = mode === 'write'
    ? await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
      )
    : await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
      );
  if (sessions.length !== 1) {
    throw new ForbiddenException('当前员工会话已失效，不能访问评价管理');
  }
}
