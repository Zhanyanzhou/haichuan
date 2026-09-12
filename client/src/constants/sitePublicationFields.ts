/** 店铺资料页面可定位的字段；页面发布检查与表单共享标签和白名单。 */
export const SITE_PUBLICATION_FIELD_LABELS = {
  siteName: "网站名称",
  siteDescription: "网站描述",
  logo: "网站 Logo",
  brandPresentationMode: "品牌呈现方式",
  brandReviewReference: "品牌审核记录",
  contactPhone: "联系电话",
  contactEmail: "联系邮箱",
  contactAddress: "联系地址",
  storeName: "门店名称",
  businessHours: "营业时间",
  storeMapUrl: "门店地图链接",
  legalEntityReviewReference: "经营主体审核记录",
  privacyPolicyReviewReference: "隐私说明审核记录",
  seoTitle: "默认页面标题",
  seoDescription: "默认页面描述",
  seoKeywords: "默认关键词",
  seoReviewReference: "搜索信息审核记录",
  canonicalBaseUrl: "正式站点网址",
  defaultLocale: "默认语言",
  publishedLocales: "公开语言",
} as const;

export function getSitePublicationField(value: string | null): keyof typeof SITE_PUBLICATION_FIELD_LABELS | null {
  const field = value?.replace(/^siteSettings\./, "");
  return field && Object.prototype.hasOwnProperty.call(SITE_PUBLICATION_FIELD_LABELS, field)
    ? field as keyof typeof SITE_PUBLICATION_FIELD_LABELS : null;
}
