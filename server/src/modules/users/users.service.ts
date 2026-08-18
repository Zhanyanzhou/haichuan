import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: { page?: number; pageSize?: number; keyword?: string; role?: string }) {
    const { page = 1, pageSize = 20, keyword, role } = params;
    const where: any = {};
    if (keyword) {
      where.OR = [
        { username: { contains: keyword } },
        { realName: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    if (role) where.role = role;

    const _page = +page, _pageSize = +pageSize;
    const [list, total, roleRows] = await Promise.all([
      this.prisma.user.findMany({
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
      this.prisma.user.count({ where }),
      // 角色分布统计不受分页/搜索影响，保持仪表盘七角色计数准确
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);

    const roleCounts: Record<string, number> = {};
    for (const r of roleRows) roleCounts[r.role] = r._count._all;

    return { list, total, page: _page, pageSize: _pageSize, roleCounts };
  }

  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
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
  }

  async create(data: {
    username: string;
    password: string;
    realName?: string;
    phone?: string;
    email?: string;
    role?: string;
  }) {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
        username: data.username,
        password: hashedPassword,
        realName: data.realName,
        phone: data.phone,
        email: data.email,
        role: (data.role as any) || 'EDITOR',
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
  }

  async update(
    id: number,
    data: {
      realName?: string;
      phone?: string;
      email?: string;
      role?: string;
      status?: string;
      password?: string;
    },
    currentUser: { id: number; role?: string },
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('用户不存在');

    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
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

    const updateData: any = { ...data };
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    } else {
      delete updateData.password;
    }
    return this.prisma.user.update({
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
  }

  async delete(id: number) {
    return this.prisma.user.update({
      where: { id },
      data: { status: 'DISABLED' },
    });
  }
}
