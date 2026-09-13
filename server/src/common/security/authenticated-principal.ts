import type { Customer, Role, User } from '@prisma/client';
import type { Request } from 'express';

/** Passport 校验后允许进入控制器的员工身份；密码永远不进入请求对象。 */
export type StaffPrincipal = Omit<User, 'password'>;

/** 管理员 access token 的最小可信载荷；仍须在策略中做运行时校验。 */
export interface AdminAccessTokenPayload {
  sub: number;
  type: 'admin';
  tokenUse: 'access';
  /** 新签发的员工访问令牌绑定到服务端 refresh family，便于改密、禁用和退出后立即吊销。 */
  sessionFamilyId?: string;
  username?: string;
  role?: Role;
}

export type StaffRequest = Request & { user: StaffPrincipal };

/** 客户守卫向下游暴露经过数据库实时复核的最小身份与可见性事实。 */
export type CustomerPrincipal = Pick<Customer, 'id' | 'name' | 'phone' | 'email'> & {
  accountType: string;
  partnerStatus?: string | null;
};
export type CustomerRequest = Request & { customer: CustomerPrincipal };
export type OptionalCustomerRequest = Request & { customer?: CustomerPrincipal };

export type CustomerOrStaffRequest = Request & (
  | {
      authKind: 'customer';
      customer: CustomerPrincipal;
      user?: never;
    }
  | {
      authKind: 'staff';
      user: StaffPrincipal;
      customer?: never;
    }
);

export type RawBodyRequest = Request & { rawBody?: Buffer };
