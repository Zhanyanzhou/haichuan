/** 新建页面共用的最小首屏测试种子；它不是模板目录中的独立模板身份。 */
import type { PuckBlock, PuckDocument } from "@/page-builder/types";

const HERO_MODULE_TYPE = "首屏主视觉";

function createHeroTestBlock(id: string): PuckBlock {
  return {
    type: HERO_MODULE_TYPE,
    props: {
      id,
      eyebrow: "",
      title: "",
      subtitle: "",
      desktopImage: "",
      mobileImage: "",
      actionText: "",
      linkUrl: "",
      targetType: "none",
      productId: 0,
      altText: "",
      alignment: "center",
      desktopFocusX: 50,
      desktopFocusY: 50,
      mobileFocusX: 50,
      mobileFocusY: 50,
      locked: false,
    },
  };
}

export function createHeroTestPageSeed(pageKey: string): PuckDocument {
  return {
    content: [createHeroTestBlock(`${pageKey}-hero-test`)],
    root: { props: {} },
  };
}
