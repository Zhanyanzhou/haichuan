/** 新建或重置密码的前端合同：员工域更严（后台为资金入口），客户域由登录分级挑战防爆破。 */

// 客户（会员）域：注册 / 找回重置
export const ACCOUNT_PASSWORD_MIN_LENGTH = 8;
export const ACCOUNT_PASSWORD_MAX_LENGTH = 64;
export const ACCOUNT_PASSWORD_HINT = "密码需为 8–64 位";

// 员工域：后台新建 / 改密 / 重置（服务端另有常见弱口令黑名单）
export const STAFF_PASSWORD_MIN_LENGTH = 12;
export const STAFF_PASSWORD_MAX_LENGTH = 64;
export const STAFF_PASSWORD_HINT = "密码需为 12–64 位，且不能是常见弱口令";

/** 登录、注销确认和绑定既有账号继续兼容历史密码。 */
export const EXISTING_PASSWORD_MAX_LENGTH = 128;

export function isAccountPasswordValid(password: string) {
  return (
    password.length >= ACCOUNT_PASSWORD_MIN_LENGTH
    && password.length <= ACCOUNT_PASSWORD_MAX_LENGTH
  );
}
