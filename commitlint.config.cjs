/**
 * Commitlint 配置
 *
 * 现有提交信息采用「英文 type(scope): 中文描述」格式。本配置沿用 Conventional Commits
 * 的基础格式、非空字段和允许 type 等校验，不额外限制中文描述风格。
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
