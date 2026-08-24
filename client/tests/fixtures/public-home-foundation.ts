const media = {
  heroDesktop: "/images/editorial/home-hero-immersive/home-hero-immersive-desktop-v2.png",
  heroMobile: "/images/editorial/home-hero-immersive/home-hero-immersive-mobile-v2.png",
  product: "/images/editorial/poster-gold-ring-v1.webp",
  productTwo: "/images/editorial/poster-gold-pendant-v1.webp",
  productThree: "/images/editorial/poster-gold-earrings-v1.webp",
  posterMain: "/images/錾刻.png",
  posterDetail: "/images/设计.png",
  booking: "/images/editorial/poster-gourd-v1.png",
} as const;

export const homeProductFixtures = ([
  [8101, "HOME-SAFE-01", "中性测试作品一", media.product],
  [8102, "HOME-SAFE-02", "中性测试作品二", media.productTwo],
  [8103, "HOME-SAFE-03", "中性测试作品三", media.productThree],
] as const).map(([id, code, name, image]) => ({
  id,
  code,
  name,
  price: 123456,
  status: "PUBLISHED",
  images: [
    {
      id,
      productId: id,
      url: image,
      type: "FRONT",
      sortOrder: 0,
      isVideo: false,
    },
  ],
}));

export const homeProductFixture = homeProductFixtures[0];

export const homePuckFixture = {
  content: [
    {
      type: "首屏主视觉",
      props: {
        id: "home-safe-hero",
        desktopImage: media.heroDesktop,
        mobileImage: media.heroMobile,
        eyebrow: "SAFE FIXTURE",
        title: "中性首页主标题",
        subtitle: "仅用于验证公开渲染结构与媒体稳定性。",
        actionText: "浏览作品",
        targetType: "page",
        linkUrl: "/catalog",
        altText: "中性首页主视觉测试图",
        alignment: "left",
      },
    },
    {
      type: "文字横幅",
      props: {
        id: "home-safe-text",
        eyebrow: "SAFE TEST",
        title: "中性文字章节",
        body: "该章节只验证标题、摘要与行动入口的公开 DOM。",
        buttonText: "了解说明",
        targetType: "page",
        linkUrl: "/about",
        template: "center",
      },
    },
    {
      type: "产品展示行",
      props: {
        id: "home-safe-products",
        title: "中性作品章节",
        subtitle: "作品通过公开接口按 code 解析。",
        productCodes: [homeProductFixture.code],
        productIds: [999999],
        layout: "grid-3",
        mobileColumns: 1,
        displayMode: "standard",
        showPrice: true,
        showButton: true,
        buttonText: "查看并购买",
      },
    },
    {
      type: "双图海报",
      props: {
        id: "home-safe-double",
        number: "04",
        label: "SAFE TEST",
        title: "中性双图章节",
        description: "主图与细节图只承担测试用途，不表达品牌事实。",
        mainImage: media.posterMain,
        detailImage: media.posterDetail,
        actionText: "查看流程",
        targetType: "page",
        linkUrl: "/custom",
        mainAltText: "中性主图测试素材",
        detailAltText: "中性细节测试素材",
      },
    },
    {
      type: "卡片网格",
      props: {
        id: "home-safe-points",
        title: "中性要点章节",
        subtitle: "只验证可组合的文字网格。",
        layout: "grid-3",
        cards: [
          { icon: "01", title: "测试要点一", body: "中性说明一。" },
          { icon: "02", title: "测试要点二", body: "中性说明二。" },
          { icon: "03", title: "测试要点三", body: "中性说明三。" },
        ],
      },
    },
    {
      type: "预约入口",
      props: {
        id: "home-safe-booking",
        backgroundImage: media.booking,
        title: "中性预约章节",
        subtitle: "仅验证预约入口的标题、摘要与站内链接。",
        buttonText: "提交联系需求",
        targetType: "page",
        linkUrl: "/contact",
        altText: "中性预约背景测试图",
      },
    },
  ],
  root: { props: {} },
};

export function createPublishedHomeFixture(
  puckData: typeof homePuckFixture = homePuckFixture,
) {
  return {
    id: 8801,
    pageKey: "home",
    puckData,
    metadata: { fixture: "public-home-foundation" },
    status: "PUBLISHED",
    version: 1,
  };
}

export function createMissingMediaHomeFixture() {
  const puckData = structuredClone(homePuckFixture);
  puckData.content[0].props.desktopImage = "";
  puckData.content[0].props.mobileImage = "";
  puckData.content[2].props.productCodes = ["HOME-MISSING-01"];
  puckData.content[3].props.detailImage = "";
  puckData.content[5].props.backgroundImage = "";
  return createPublishedHomeFixture(puckData);
}

export function createSolidHeaderHomeFixture() {
  const puckData = structuredClone(homePuckFixture);
  puckData.content = [puckData.content[1], puckData.content[0], ...puckData.content.slice(2)];
  return createPublishedHomeFixture(puckData);
}

export function createProductCountHomeFixture(count: 1 | 2 | 3) {
  const puckData = structuredClone(homePuckFixture);
  puckData.content[2].props.productCodes = homeProductFixtures
    .slice(0, count)
    .map((product) => String(product.code));
  return createPublishedHomeFixture(puckData);
}

export function createNoHeroHomeFixture() {
  const puckData = structuredClone(homePuckFixture);
  puckData.content = puckData.content.filter((block) => block.type !== "首屏主视觉");
  return createPublishedHomeFixture(puckData);
}

export function createUntitledHeroHomeFixture() {
  const puckData = structuredClone(homePuckFixture);
  puckData.content[0].props.title = "";
  return createPublishedHomeFixture(puckData);
}
