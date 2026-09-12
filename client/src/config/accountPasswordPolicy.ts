/** 新建或重置密码的前端合同：员工与会员统一为 6–18 位。 */

// 客户（会员）域：注册 / 找回重置
export const ACCOUNT_PASSWORD_MIN_LENGTH = 6;
export const ACCOUNT_PASSWORD_MAX_LENGTH = 18;
export const ACCOUNT_PASSWORD_HINT = "密码需为 6–18 位，并同时包含字母和数字";

// 员工域：后台新建 / 改密 / 重置（服务端另有常见弱口令黑名单）
export const STAFF_PASSWORD_MIN_LENGTH = 6;
export const STAFF_PASSWORD_MAX_LENGTH = 18;
export const STAFF_PASSWORD_HINT = "密码需为 6–18 位，且不能是常见弱口令";

/** 登录、注销确认和绑定既有账号继续兼容历史密码。 */
export const EXISTING_PASSWORD_MAX_LENGTH = 128;

export function isAccountPasswordValid(password: string) {
  return (
    password.length >= ACCOUNT_PASSWORD_MIN_LENGTH
    && password.length <= ACCOUNT_PASSWORD_MAX_LENGTH
    && /[A-Za-z]/.test(password)
    && /\d/.test(password)
  );
}
