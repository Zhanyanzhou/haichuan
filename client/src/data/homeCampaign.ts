/** 首页品牌展映数据 — 集中管理所有媒体和文案 */

export const homeCampaign = {
  heroFilm: {
    desktopVideo: '',
    mobileVideo: '',
    poster: '/images/editorial/hero-gold-bangle-v1.webp',
    mobilePoster: '/images/editorial/hero-gold-bangle-mobile-v1.webp',
    eyebrow: 'CAMPAIGN / 01',
    // TODO: Replace with final verified campaign copy.
    title: '东方之形，\n自有光华。',
    action: 'EXPLORE THE COLLECTION',
    href: '/products',
    focusX: 50,
    focusY: 50,
  },

  manifesto: {
    // TODO: Replace with final verified brand copy.
    text: '珠宝不是被观看的物件，\n它会在光、触碰与时间里，\n逐渐成为佩戴者的一部分。',
  },

  signaturePoster: {
    image: '/images/editorial/poster-dragon-bangle-v1.webp',
    number: '01',
    label: 'SIGNATURE',
    // TODO: Replace with actual series name.
    title: '龙纹鎏光',
    subtitle: '东方金工 · 当代新境',
    href: '/products?categoryId=6',
    focusX: 50,
    focusY: 50,
  },

  editorialPair: {
    mainImage: '/images/editorial/poster-gold-ring-v1.webp',
    detailImage: '/images/editorial/poster-gold-pendant-v1.webp',
    number: '02',
    label: 'FORM',
    // TODO: Replace with actual series name and description.
    title: '金环有序',
    description: '线条、比例与轮廓的共同表达。',
    href: '/products?categoryId=17',
    mainFocusX: 50, mainFocusY: 50,
    detailFocusX: 50, detailFocusY: 50,
  },

  craftPoster: {
    image: '/images/editorial/poster-gold-earrings-v1.webp',
    number: '03',
    label: 'CRAFT',
    // TODO: Replace with verified craft copy.
    title: '细节之中，\n自有秩序。',
    href: '/products',
    focusX: 50,
    focusY: 50,
  },

  closingIndex: {
    entries: [
      { number: '01', label: '探索珠宝作品', href: '/products' },
      { number: '02', label: '进入选款中心', href: '/catalog' },
      { number: '03', label: '了解定制服务', href: '/custom' },
      { number: '04', label: '预约专属咨询', href: '/contact' },
    ],
  },
} as const;
