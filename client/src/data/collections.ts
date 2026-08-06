/**
 * 海川珠宝 — 珠宝作品视觉展数据
 * TODO: Replace all images with official campaign photography.
 * Image quality tiers: A=cover/poster, B=auxiliary, C=not suitable
 */

/* ═══════ 图片 ═══════ */
export type ImgType = 'campaign' | 'model' | 'product' | 'detail';

export interface ExImage {
  src: string;
  alt: string;
  type: ImgType;
  ratio: string; // "3:2" | "4:5" | "3:4" | "1:1" | "16:9"
  objectPosition: string;
  tier: 'A' | 'B';
}

const ED = '/images/editorial';
const H = '/images/hero';
const C = (n: string) => `/images/${n}.png`;

/* ═══════ 封面 ═══════ */
export const coverImage: ExImage = {
  src: `${ED}/hero-gold-bangle-v1.png`,
  alt: '海川珠宝视觉展封面',
  type: 'campaign',
  ratio: '3:2',
  objectPosition: 'center 30%',
  tier: 'A',
};

/* ═══════ 核心系列：手镯 ═══════ */
export const signatureSeries = {
  id: 'bracelet',
  number: '01',
  name: '手镯系列',
  englishName: 'BRACELET',
  statement: '金线在腕间收束为形，錾刻与花丝共同完成一件作品对时间的回答。',
  poster: {
    src: `${ED}/poster-dragon-bangle-v1.png`,
    alt: '龙纹手镯主视觉',
    type: 'campaign' as const, ratio: '3:4', objectPosition: 'center 30%', tier: 'A' as const,
  } as ExImage,
  model: {
    src: `${ED}/hero-gold-bangle-v1.png`,
    alt: '手镯佩戴效果',
    type: 'model' as const, ratio: '3:2', objectPosition: 'center center', tier: 'A' as const,
  } as ExImage,
  still: {
    src: `${H}/oriental-water-bangle-v1.png`,
    alt: '手镯静物',
    type: 'product' as const, ratio: '3:2', objectPosition: 'center center', tier: 'A' as const,
  } as ExImage,
  detail: {
    src: C('錾刻'),
    alt: '錾刻工艺细节',
    type: 'detail' as const, ratio: '4:5', objectPosition: 'center center', tier: 'B' as const,
  } as ExImage,
};

/* ═══════ 次级系列 1：吊坠 ═══════ */
export const secondarySeries1 = {
  id: 'pendant',
  number: '02',
  name: '吊坠系列',
  englishName: 'PENDANT',
  statement: '平安扣、葫芦与如意的形态，在黄金材质中重新找到属于自己的轮廓。',
  poster: {
    src: `${ED}/poster-gold-pendant-v1.png`,
    alt: '吊坠系列主视觉',
    type: 'campaign' as const, ratio: '3:4', objectPosition: 'center 35%', tier: 'A' as const,
  } as ExImage,
  secondary: {
    src: C('熔炼'),
    alt: '黄金熔炼',
    type: 'detail' as const, ratio: '3:2', objectPosition: 'center center', tier: 'B' as const,
  } as ExImage,
};

/* ═══════ 次级系列 2：戒指 ═══════ */
export const secondarySeries2 = {
  id: 'ring',
  number: '03',
  name: '戒指系列',
  englishName: 'RING',
  statement: '戒圈上的每一道转折，都是线条与身体之间的对话。',
  poster: {
    src: `${ED}/poster-gold-ring-v1.png`,
    alt: '戒指系列主视觉',
    type: 'campaign' as const, ratio: '4:5', objectPosition: 'center 30%', tier: 'A' as const,
  } as ExImage,
  detail1: {
    src: C('镶嵌'),
    alt: '宝石镶嵌工艺',
    type: 'detail' as const, ratio: '3:2', objectPosition: 'center center', tier: 'B' as const,
  } as ExImage,
  detail2: {
    src: C('成型'),
    alt: '戒指成型工序',
    type: 'detail' as const, ratio: '4:5', objectPosition: 'center center', tier: 'B' as const,
  } as ExImage,
};

/* ═══════ 珠宝形态研究 ═══════ */
export const objectStudies: ExImage[] = [
  { src: C('镶嵌'), alt: '宝石镶嵌结构', type: 'detail', ratio: '3:2', objectPosition: 'center center', tier: 'B' },
  { src: C('抛光'), alt: '金属抛光表面', type: 'detail', ratio: '4:5', objectPosition: 'center center', tier: 'B' },
  { src: C('设计'), alt: '设计手稿', type: 'detail', ratio: '3:4', objectPosition: 'center center', tier: 'B' },
  { src: C('质检'), alt: '品质检验', type: 'detail', ratio: '3:2', objectPosition: 'center center', tier: 'B' },
];

/* ═══════ 系列海报档案 ═══════ */
export const campaignArchive = [
  {
    id: 'earring',
    number: '04',
    name: '耳饰系列',
    englishName: 'EARRING',
    image: {
      src: `${ED}/poster-gold-earrings-v1.png`,
      alt: '耳饰系列视觉',
      type: 'campaign' as const, ratio: '4:5', objectPosition: 'center 35%', tier: 'A' as const,
    } as ExImage,
  },
];

/* ═══════ 收尾 ═══════ */
export const closingImage: ExImage = {
  src: C('设计'),
  alt: '珠宝设计稿收尾',
  type: 'detail', ratio: '3:4', objectPosition: 'center center', tier: 'B',
};

/* ═══════ 大图浏览 — 所有可浏览图片 ═══════ */
export const allGalleryImages: (ExImage & { label?: string })[] = [
  { ...signatureSeries.poster, label: '手镯系列 · 主视觉' },
  { ...signatureSeries.model, label: '手镯系列 · 佩戴' },
  { ...signatureSeries.still, label: '手镯系列 · 静物' },
  { ...signatureSeries.detail, label: '手镯系列 · 细节' },
  { ...secondarySeries1.poster, label: '吊坠系列 · 主视觉' },
  { ...secondarySeries1.secondary, label: '吊坠系列 · 工艺' },
  { ...secondarySeries2.poster, label: '戒指系列 · 主视觉' },
  { ...secondarySeries2.detail1, label: '戒指系列 · 工艺' },
  ...objectStudies.map((img, i) => ({ ...img, label: `珠宝形态 · ${i + 1}` })),
  ...campaignArchive.map((s) => ({ ...s.image, label: `${s.name} · 视觉` })),
];
