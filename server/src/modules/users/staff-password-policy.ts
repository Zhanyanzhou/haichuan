import { BadRequestException } from "@nestjs/common";

/**
 * 员工与会员在新建或重置密码时共用的唯一长度合同。
 * 登录校验保留历史密码兼容，不能据此迁移或重置既有密码哈希。
 */
export const ACCOUNT_PASSWORD_MIN_LENGTH = 6;
export const ACCOUNT_PASSWORD_MAX_LENGTH = 18;
export const ACCOUNT_PASSWORD_MESSAGE =
  `密码长度必须为 ${ACCOUNT_PASSWORD_MIN_LENGTH}-${ACCOUNT_PASSWORD_MAX_LENGTH} 位`;

export function assertAccountPassword(password: unknown): asserts password is string {
  if (
    typeof password !== "string"
    || password.length < ACCOUNT_PASSWORD_MIN_LENGTH
    || password.length > ACCOUNT_PASSWORD_MAX_LENGTH
  ) {
    throw new BadRequestException(ACCOUNT_PASSWORD_MESSAGE);
  }
}

// 兼容既有员工域导入；数值与校验仍只来自上方账号级合同。
export const STAFF_PASSWORD_MIN_LENGTH = ACCOUNT_PASSWORD_MIN_LENGTH;
export const STAFF_PASSWORD_MAX_LENGTH = ACCOUNT_PASSWORD_MAX_LENGTH;
export const STAFF_PASSWORD_MESSAGE = ACCOUNT_PASSWORD_MESSAGE;
export const assertStaffPassword: typeof assertAccountPassword = assertAccountPassword;
