import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { assertStaffPassword } from './staff-password-policy';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import type { StaffPrincipal } from '../../common/security/authenticated-principal';

type UsersStaffActor = Pick<StaffPrincipal, 'id' | 'role' | 'sessionFamilyId'>;
type LockedStaff = { id: number; role: Role };

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private async lockAuthorizedStaff(
    transaction: Prisma.TransactionClient,
    actor: UsersStaffActor,
    allowedRoles: readonly Role[],
    mode: 'read' | 'write',
  ): Promise<LockedStaff> {
    if (!actor || !Number.isInteger(actor.id) || actor.id <= 0) {
      throw new ForbiddenException('当前员工已停用或无权访问员工管理');
    }
    const roleList = Prisma.join([...allowedRoles]);
    const staff = mode === 'write'
      ? await transaction.$queryRaw<LockedStaff[]>(
          Prisma.sql`SELECT id, role FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN (${roleList}) FOR UPDATE`,
        )
      : await transaction.$queryRaw<LockedStaff[]>(
          Prisma.sql`SELECT id, role FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN (${roleList}) FOR SHARE`,
        );
    if (staff.length !== 1) {
      throw new ForbiddenException('当前员工已停用或无权访问员工管理');
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
        throw new ForbiddenException('当前员工会话已失效，不能继续访问员工管理');
      }
    }
    return staff[0];
  }

  private withAuthorizedStaffRead<T>(
    actor: UsersStaffActor,
    allowedRoles: readonly Role[],
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedStaff(transaction, actor, allowedRoles, 'read');
      return operation(transaction);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async findAll(
    params: { page?: number; pageSize?: number; keyword?: string; role?: string },
    actor: UsersStaffActor,
  ) {
    const { page = 1, pageSize = 20, keyword, role } = params;
    const where: Prisma.UserWhereInput = {};
    if (keyword) {
      where.OR = [
        { username: { contains: keyword } },
        { realName: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    if (role) where.role = role as Role;

    const _page = +page;
    const _pageSize = +pageSize;
    return this.withAuthorizedStaffRead(
      actor,
      ['SUPER_ADMIN', 'ADMIN'],
      async (transaction) => {
        const [list, total, roleRows] = await Promise.all([
          transaction.user.findMany({
            where,
            skip: (_page - 1) * _pageSize,
            take: _pageSize,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              username: true,
              realName: true,
              phone: true,
              email: true,
              avatar: true,
              role: true,
              status: true,
              lastLoginAt: true,
              createdAt: true,
            },
          }),
          transaction.user.count({ where }),
          // 角色分布统计不受分页/搜索影响，保持仪表盘七角色计数准确
          transaction.user.groupBy({ by: ['role'], _count: { _all: true } }),
        ]);

        const roleCounts: Record<string, number> = {};
        for (const r of roleRows) roleCounts[r.role] = r._count._all;

        return { list, total, page: _page, pageSize: _pageSize, roleCounts };
      },
    );
  }

  async findAssignable(actor: UsersStaffActor) {
    return this.withAuthorizedStaffRead(
      actor,
      ['SUPER_ADMIN', 'ADMIN', 'CUSTOMER_SERVICE'],
      async (transaction) => {
        const users = await transaction.user.findMany({
          where: { status: 'ACTIVE' },
          orderBy: [{ realName: 'asc' }, { id: 'asc' }],
          take: 200,
          select: { id: true, username: true, realName: true, role: true },
        });
        return users.map((user) => ({
          id: user.id,
          name: user.realName || user.username,
          role: user.role,
        }));
      },
    );
  }

  async findById(id: number, actor: UsersStaffActor) {
    return this.withAuthorizedStaffRead(
      actor,
      ['SUPER_ADMIN', 'ADMIN'],
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id },
          select: {
            id: true,
            username: true,
            realName: true,
            phone: true,
            email: true,
            avatar: true,
            role: true,
            status: true,
            lastLoginAt: true,
            lastLoginIp: true,
            createdAt: true,
          },
        });
        if (!user) throw new NotFoundException('用户不存在');
        return user;
      },
    );
  }

  async create(data: CreateUserDto, actor: UsersStaffActor) {
    assertStaffPassword(data.password);
    const hashedPassword = await bcrypt.hash(data.password, 12);
    return this.prisma.$transaction(async (transaction) => {
      await this.lockAuthorizedStaff(transaction, actor, ['SUPER_ADMIN'], 'write');
      return transaction.user.create({
        data: {
          username: data.username,
          password: hashedPassword,
          realName: data.realName,
          phone: data.phone,
          email: data.email,
          role: data.role || 'EDITOR',
        },
        select: {
          id: true,
          username: true,
          realName: true,
          phone: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async update(
    id: number,
    data: UpdateUserDto,
    currentUser: UsersStaffActor,
  ) {
    if (data.password) assertStaffPassword(data.password);
    const hashedPassword = data.password
      ? await bcrypt.hash(data.password, 12)
      : undefined;
    return this.prisma.$transaction(async (tx) => {
      const activeActor = await this.lockAuthorizedStaff(
        tx,
        currentUser,
        ['SUPER_ADMIN', 'ADMIN'],
        'write',
      );
      const target = await tx.user.findUnique({
        where: { id },
        select: { id: true, role: true, status: true },
      });
      if (!target) throw new NotFoundException('用户不存在');

      const isSuperAdmin = activeActor.role === 'SUPER_ADMIN';
      // 非超管不得操作超管账号(防 ADMIN 改超管密码/状态)
      if (!isSuperAdmin && target.role === 'SUPER_ADMIN') {
        throw new ForbiddenException('无权操作超级管理员账号');
      }
      // 敏感字段(角色/状态/密码)仅超管可改
      const touchedSensitive =
        data.role !== undefined || data.status !== undefined || data.password !== undefined;
      if (touchedSensitive && !isSuperAdmin) {
        throw new ForbiddenException('仅超级管理员可修改角色、状态或密码');
      }

      const disablesTarget =
        data.status === 'DISABLED' ||
        (data.role !== undefined && data.role !== 'SUPER_ADMIN');
      if (target.id === activeActor.id && disablesTarget) {
        throw new UnprocessableEntityException('不能禁用或降低当前登录的超级管理员账号权限');
      }
      if (target.role === 'SUPER_ADMIN' && target.status === 'ACTIVE' && disablesTarget) {
        const activeSuperAdmins = await tx.user.count({
          where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
        });
        if (activeSuperAdmins <= 1) {
          throw new UnprocessableEntityException('系统必须保留至少一个启用中的超级管理员账号');
        }
      }

      const updateData: Prisma.UserUpdateInput = {
        ...(data.realName !== undefined ? { realName: data.realName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      };
      if (hashedPassword) updateData.password = hashedPassword;
      const updated = await tx.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          username: true,
          realName: true,
          phone: true,
          email: true,
          role: true,
          status: true,
        },
      });
      if (
        data.password !== undefined ||
        data.status !== undefined ||
        data.role !== undefined
      ) {
        await tx.adminRefreshSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async delete(id: number, currentUser: UsersStaffActor) {
    return this.prisma.$transaction(async (tx) => {
      const activeActor = await this.lockAuthorizedStaff(
        tx,
        currentUser,
        ['SUPER_ADMIN'],
        'write',
      );
      const target = await tx.user.findUnique({
        where: { id },
        select: { id: true, role: true, status: true },
      });
      if (!target) throw new NotFoundException('用户不存在');
      if (target.id === activeActor.id) {
        throw new UnprocessableEntityException('不能禁用当前登录的超级管理员账号');
      }
      if (target.role === 'SUPER_ADMIN' && target.status === 'ACTIVE') {
        const activeSuperAdmins = await tx.user.count({
          where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
        });
        if (activeSuperAdmins <= 1) {
          throw new UnprocessableEntityException('系统必须保留至少一个启用中的超级管理员账号');
        }
      }
      const updated = await tx.user.update({
        where: { id },
        data: { status: 'DISABLED' },
        select: {
          id: true,
          username: true,
          realName: true,
          role: true,
          status: true,
        },
      });
      await tx.adminRefreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
