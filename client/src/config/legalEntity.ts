/**
 * 网站经营主体的公开登记信息。
 *
 * 这些字段同时供经营主体页、页脚与隐私说明使用，避免法定信息在多个页面重复维护。
 * 发生工商变更时，应先核对最新营业执照，再统一更新本文件。
 */
export const LEGAL_ENTITY = {
  name: "深圳市海川文化创意设计有限公司",
  unifiedSocialCreditCode: "91440300MA5HH1J83Y",
  legalRepresentative: "陈振洪",
  enterpriseType: "有限责任公司（自然人独资）",
  registeredCapital: "人民币 5 万元",
  establishedOn: "2022 年 9 月 22 日",
  registrationStatus: "开业（存续）",
  registeredAddress:
    "深圳市龙岗区横岗街道横岗社区富康路 88 号 A 栋 206",
  registrationAuthority: "深圳市市场监督管理局",
  verifiedOn: "2026 年 8 月 21 日",
  officialRegistryUrl: "https://www.gsxt.gov.cn/index.html",
} as const;
