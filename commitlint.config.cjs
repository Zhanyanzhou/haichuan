/**
 * Commitlint 配置
 *
 * 现有提交信息已是「英文 type(scope): 中文描述」格式，本配置沿用 Conventional Commits，
 * 仅拦截不规范 type（如错拼、遗漏），不改变中文描述风格。
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
};
