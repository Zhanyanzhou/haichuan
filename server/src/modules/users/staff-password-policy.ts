import { BadRequestException } from "@nestjs/common";

/**
 * 账号密码合同：员工域与客户域分别定长（后台是资金入口，取更严标准）。
 * 登录校验保留历史密码兼容（最长 128），不能据此迁移或重置既有密码哈希。
 * 员工域额外拒绝常见弱口令；客户域依赖登录分级挑战（图形/短信验证码）防爆破。
 */
export const STAFF_PASSWORD_MIN_LENGTH = 12;
export const STAFF_PASSWORD_MAX_LENGTH = 64;
export const STAFF_PASSWORD_MESSAGE = `员工密码长度必须为 ${STAFF_PASSWORD_MIN_LENGTH}-${STAFF_PASSWORD_MAX_LENGTH} 位，且不能使用常见弱口令`;

export const ACCOUNT_PASSWORD_MIN_LENGTH = 8;
export const ACCOUNT_PASSWORD_MAX_LENGTH = 64;
export const ACCOUNT_PASSWORD_MESSAGE =
  `密码长度必须为 ${ACCOUNT_PASSWORD_MIN_LENGTH}-${ACCOUNT_PASSWORD_MAX_LENGTH} 位`;

/** 常见弱口令小写集合（新密码与"弱口令+任意后缀数字"形态均拒绝） */
const COMMON_WEAK_PASSWORDS = new Set([
  "password", "passwd", "passw0rd", "admin123456", "administrator",
  "admin12345678", "admin123456789", "admin@123456",
  "123456789012", "12345678901", "qwertyuiop", "asdfghjkl", "zxcvbnm",
  "haichuan123", "jewelry123", "a1234567890", "abc12345678",
  "111111111111", "000000000000", "666666666666", "888888888888",
  "woaini1314", "1qaz2wsx3edc", "qazwsx123456", "p@ssw0rd123",
]);

function isCommonWeakPassword(password: string): boolean {
  const normalized = password.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(normalized)) return true;
  // 去除尾部数字/符号后命中黑名单的也视为弱口令（如 password2024!）
  const stripped = normalized.replace(/[0-9!@#$%^&*._-]+$/, "");
  return stripped.length >= 6 && COMMON_WEAK_PASSWORDS.has(stripped);
}

/** 客户域（注册/重置）密码校验：长度合同即可，防爆破由分级挑战承担 */
export function assertAccountPassword(password: unknown): asserts password is string {
  if (
    typeof password !== "string"
    || password.length < ACCOUNT_PASSWORD_MIN_LENGTH
    || password.length > ACCOUNT_PASSWORD_MAX_LENGTH
  ) {
    throw new BadRequestException(ACCOUNT_PASSWORD_MESSAGE);
  }
}

/** 员工域（新建/改密/重置）密码校验：更严长度 + 常见弱口令拒绝 */
export function assertStaffPassword(password: unknown): asserts password is string {
  if (
    typeof password !== "string"
    || password.length < STAFF_PASSWORD_MIN_LENGTH
    || password.length > STAFF_PASSWORD_MAX_LENGTH
  ) {
    throw new BadRequestException(STAFF_PASSWORD_MESSAGE);
  }
  if (isCommonWeakPassword(password)) {
    throw new BadRequestException("密码过于常见，请更换更独特的密码");
  }
}
