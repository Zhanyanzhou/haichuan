/** 新建或重置员工、会员密码时使用的统一前端合同。 */
export const ACCOUNT_PASSWORD_MIN_LENGTH = 6;
export const ACCOUNT_PASSWORD_MAX_LENGTH = 18;
export const ACCOUNT_PASSWORD_HINT = "密码需为 6–18 位";

export function isAccountPasswordValid(password: string) {
  return (
    password.length >= ACCOUNT_PASSWORD_MIN_LENGTH
    && password.length <= ACCOUNT_PASSWORD_MAX_LENGTH
  );
}
