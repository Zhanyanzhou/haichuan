import { BadRequestException } from "@nestjs/common";

/**
 * 账号密码合同：员工域与客户域的新密码长度统一为 6–18 位。
 * 登录校验保留历史密码兼容（最长 128），不能据此迁移或重置既有密码哈希。
 * 员工域拒绝常见弱口令；客户域还要求同时包含字母和数字，并复用弱口令黑名单。
 */
export const STAFF_PASSWORD_MIN_LENGTH = 6;
export const STAFF_PASSWORD_MAX_LENGTH = 18;
export const STAFF_PASSWORD_MESSAGE = `员工密码长度必须为 ${STAFF_PASSWORD_MIN_LENGTH}-${STAFF_PASSWORD_MAX_LENGTH} 位，且不能使用常见弱口令`;

export const ACCOUNT_PASSWORD_MIN_LENGTH = 6;
export const ACCOUNT_PASSWORD_MAX_LENGTH = 18;
export const ACCOUNT_PASSWORD_MESSAGE =
  `密码必须为 ${ACCOUNT_PASSWORD_MIN_LENGTH}-${ACCOUNT_PASSWORD_MAX_LENGTH} 位，并同时包含字母和数字`;

/** 常见弱口令小写集合（新密码与"弱口令+任意后缀数字"形态均拒绝） */
const COMMON_WEAK_PASSWORDS = new Set([
  "password", "passwd", "passw0rd", "qwerty", "abc123", "123456",
  "admin123456", "administrator",
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

/** 客户域（注册/重置/主动修改）密码校验。 */
export function assertAccountPassword(password: unknown): asserts password is string {
  if (
    typeof password !== "string"
    || password.length < ACCOUNT_PASSWORD_MIN_LENGTH
    || password.length > ACCOUNT_PASSWORD_MAX_LENGTH
  ) {
    throw new BadRequestException(ACCOUNT_PASSWORD_MESSAGE);
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new BadRequestException(ACCOUNT_PASSWORD_MESSAGE);
  }
  if (isCommonWeakPassword(password)) {
    throw new BadRequestException("密码过于常见，请更换更独特的密码");
  }
}

/** 员工域（新建/改密/重置）密码校验：统一长度 + 常见弱口令拒绝 */
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
