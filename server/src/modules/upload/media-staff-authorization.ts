import { ForbiddenException } from '@nestjs/common';
import { Prisma, type Role } from '@prisma/client';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';

export type MediaStaffActor = Pick<StaffPrincipal, 'id' | 'sessionFamilyId'>;
export type MediaStaffActorInput = MediaStaffActor | number;

export type MediaStaffAccess = 'LIBRARY' | 'REVIEW' | 'SUPER_REVIEW';
export type MediaStaffLockMode = 'read' | 'write';

export type AuthorizedMediaStaff = {
  id: number;
  role: Role;
};

export function normalizeMediaStaffActor(actor: MediaStaffActorInput): MediaStaffActor {
  const id = typeof actor === 'number' ? actor : actor?.id;
  if (!Number.isInteger(id) || Number(id) <= 0) {
    throw new ForbiddenException('当前员工身份无效，不能访问媒体管理');
  }
  return {
    id: Number(id),
    ...(typeof actor === 'object' && actor?.sessionFamilyId
      ? { sessionFamilyId: actor.sessionFamilyId }
      : {}),
  };
}

export async function lockAuthorizedMediaStaff(
  transaction: Prisma.TransactionClient,
  actorInput: MediaStaffActorInput,
  access: MediaStaffAccess,
  mode: MediaStaffLockMode,
): Promise<AuthorizedMediaStaff> {
  const actor = normalizeMediaStaffActor(actorInput);
  const staff = access === 'SUPER_REVIEW'
    ? mode === 'write'
      ? await transaction.$queryRaw<Array<AuthorizedMediaStaff>>(
          Prisma.sql`SELECT id, role FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role = 'SUPER_ADMIN' FOR UPDATE`,
        )
      : await transaction.$queryRaw<Array<AuthorizedMediaStaff>>(
          Prisma.sql`SELECT id, role FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role = 'SUPER_ADMIN' FOR SHARE`,
        )
    : access === 'REVIEW'
      ? mode === 'write'
        ? await transaction.$queryRaw<Array<AuthorizedMediaStaff>>(
            Prisma.sql`SELECT id, role FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR UPDATE`,
          )
        : await transaction.$queryRaw<Array<AuthorizedMediaStaff>>(
            Prisma.sql`SELECT id, role FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR SHARE`,
          )
      : mode === 'write'
        ? await transaction.$queryRaw<Array<AuthorizedMediaStaff>>(
            Prisma.sql`SELECT id, role FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'EDITOR') FOR UPDATE`,
          )
        : await transaction.$queryRaw<Array<AuthorizedMediaStaff>>(
            Prisma.sql`SELECT id, role FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN', 'EDITOR') FOR SHARE`,
          );
  if (staff.length !== 1) {
    throw new ForbiddenException('当前员工已停用或无权访问媒体管理');
  }

  if (actor.sessionFamilyId) {
    const sessions = mode === 'write'
      ? await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
        )
      : await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
        );
    if (sessions.length !== 1) {
      throw new ForbiddenException('当前员工会话已失效，不能访问媒体管理');
    }
  }

  return staff[0];
}
