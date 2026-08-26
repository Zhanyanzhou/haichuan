import { getPageDocumentMediaReferences } from "./content-template-contract";

const BASE_FORMAL_PAGE_METADATA = Object.freeze({
  seoTitle: "海川珠宝测试页面",
  seoDescription: "仅用于页面模块确定性测试的正式页面描述。",
  ogImage: "https://example.com/haichuan-page-share.jpg",
  contentOwner: "品牌内容组",
});

/** 非发布设置用例仍使用真实媒体授权合同，不再依赖空授权的旧前提。 */
export function makeFormalPageMetadata(puckData: unknown) {
  return {
    ...BASE_FORMAL_PAGE_METADATA,
    mediaRights: getPageDocumentMediaReferences(
      puckData,
      BASE_FORMAL_PAGE_METADATA,
    ).map((reference, index) => ({
      assetUrl: reference.url,
      source: "测试夹具授权素材",
      authorizationId: `TEST-MEDIA-${index + 1}`,
    })),
  };
}
