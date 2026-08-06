/**
 * 选款中心 — 分类结构 + 临时产品数据
 */
export interface PrimaryCategory { id: string; name: string; sortOrder: number; }
export interface SecondaryCategory { id: string; parentId: string; name: string; displayGroup?: string; sortOrder: number; }

export const primaryCategories: PrimaryCategory[] = [
  { id: 'pendant', name: '吊坠', sortOrder: 1 },
  { id: 'bracelet', name: '手镯', sortOrder: 2 },
  { id: 'ring', name: '戒指', sortOrder: 3 },
  { id: 'earring', name: '耳饰', sortOrder: 4 },
];

export const secondaryCategories: SecondaryCategory[] = [
  /* ═══ 吊坠 — 按吉祥寓意造型分类 ═══ */
  { id: 'pingan-kou', parentId: 'pendant', name: '平安扣', displayGroup: '吉祥符号', sortOrder: 1 },
  { id: 'gourd', parentId: 'pendant', name: '葫芦', displayGroup: '吉祥符号', sortOrder: 2 },
  { id: 'ruyi', parentId: 'pendant', name: '如意', displayGroup: '吉祥符号', sortOrder: 3 },
  { id: 'suanpan', parentId: 'pendant', name: '算盘', displayGroup: '吉祥符号', sortOrder: 4 },
  { id: 'coin', parentId: 'pendant', name: '钱币', displayGroup: '吉祥符号', sortOrder: 5 },
  { id: 'lock-pendant', parentId: 'pendant', name: '锁包', displayGroup: '传统守护', sortOrder: 6 },
  { id: 'changming-suo', parentId: 'pendant', name: '长命锁', displayGroup: '传统守护', sortOrder: 7 },
  { id: 'wushi-pai', parentId: 'pendant', name: '无事牌', displayGroup: '传统守护', sortOrder: 8 },
  { id: 'baoping', parentId: 'pendant', name: '宝瓶', displayGroup: '传统守护', sortOrder: 9 },
  { id: 'buddha', parentId: 'pendant', name: '佛公', displayGroup: '人物瑞兽', sortOrder: 10 },
  { id: 'guanyin', parentId: 'pendant', name: '观音', displayGroup: '人物瑞兽', sortOrder: 11 },
  { id: 'zodiac', parentId: 'pendant', name: '生肖', displayGroup: '人物瑞兽', sortOrder: 12 },
  { id: 'dragon-phoenix', parentId: 'pendant', name: '龙凤', displayGroup: '人物瑞兽', sortOrder: 13 },
  { id: 'flower', parentId: 'pendant', name: '花形', displayGroup: '自然之美', sortOrder: 14 },
  { id: 'leaf', parentId: 'pendant', name: '叶片', displayGroup: '自然之美', sortOrder: 15 },

  /* ═══ 手镯 — 按结构形态分类 ═══ */
  { id: 'fixed-bangle', parentId: 'bracelet', name: '固口手镯', sortOrder: 1 },
  { id: 'open-bangle', parentId: 'bracelet', name: '开口手镯', sortOrder: 2 },
  { id: 'expandable-bangle', parentId: 'bracelet', name: '抽拉手镯', sortOrder: 3 },
  { id: 'chain-bracelet', parentId: 'bracelet', name: '链镯', sortOrder: 4 },
  { id: 'beaded-bracelet', parentId: 'bracelet', name: '串珠手镯', sortOrder: 5 },

  /* ═══ 戒指 — 按款式形态分类 ═══ */
  { id: 'plain-band', parentId: 'ring', name: '光圈戒', sortOrder: 1 },
  { id: 'flower-ring', parentId: 'ring', name: '花戒', sortOrder: 2 },
  { id: 'diamond-ring', parentId: 'ring', name: '镶钻戒', sortOrder: 3 },
  { id: 'eternity-band', parentId: 'ring', name: '排戒', sortOrder: 4 },
  { id: 'signet-ring', parentId: 'ring', name: '印章戒', sortOrder: 5 },
  { id: 'couple-ring', parentId: 'ring', name: '情侣对戒', sortOrder: 6 },

  /* ═══ 耳饰 — 按佩戴结构分类 ═══ */
  { id: 'stud', parentId: 'earring', name: '耳钉', sortOrder: 1 },
  { id: 'hoop', parentId: 'earring', name: '耳环', sortOrder: 2 },
  { id: 'dangle', parentId: 'earring', name: '耳坠', sortOrder: 3 },
  { id: 'hook', parentId: 'earring', name: '耳钩', sortOrder: 4 },
  { id: 'threader', parentId: 'earring', name: '耳线', sortOrder: 5 },
];

export function getSecondaryByPrimary(primaryId: string): SecondaryCategory[] {
  return secondaryCategories.filter(c => c.parentId === primaryId).sort((a, b) => a.sortOrder - b.sortOrder);
}

/* ═══════ 筛选选项 ═══════ */
export const MATERIALS = ['足金999', '足金9999', '18K金', '铂金950', '镶钻', '玉石', '珍珠'];
export const CRAFTS = ['古法金', '3D硬金', '花丝', '錾刻', '镂空', '镶嵌', '抛光', '拉丝', '喷砂'];
export const WEIGHT_RANGES = ['0—5克', '5—10克', '10—20克', '20—50克', '50克以上'];
export const SIZES: Record<string, string[]> = {
  pendant: ['实心', '空心'],
  bracelet: ['52—54mm', '55—57mm', '58—60mm', '61—63mm', '开口', '闭口', '推拉'],
  ring: ['8—10号', '11—13号', '14—16号', '17—19号', '开口', '闭口'],
  earring: ['耳针', '耳钩', '耳夹', '单只', '成对'],
};
export const SCENES = ['日常佩戴', '婚嫁', '赠礼', '收藏', '传承'];  // 适用场景

/* ═══════ 开发占位图 ═══════ */
const devPlaceholder = (id: number): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="#FAF9F7"/>
    <text x="200" y="210" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#C5BFB2">产品图片</text>
    <text x="200" y="234" text-anchor="middle" font-family="monospace" font-size="11" fill="#D4CFC5">IMG-${String(id).padStart(3,'0')}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
};

/* ═══════ 产品 ═══════ */
export interface CatalogProduct {
  id: number;
  sku: string;
  name: string;
  primaryCategoryId: string;
  secondaryCategoryId: string;
  material: string;
  craft: string;
  weight: string;
  size: string;
  series: string;
  scene: string;
  images: string[];
}

/** 按货号获取产品图片路径（兜底） */
const img = (sku: string) => `/images/products/${sku}.jpg`;

/** 真实产品图片映射（ATP编码 → 测试产品） */
const realImg = (atp: string) => `/images/products/${atp}.png`;

export const catalogProducts: CatalogProduct[] = [
  // 吊坠 (9)
  { id: 1, sku: 'JH-ZD-001', name: '祥瑞平安扣', primaryCategoryId: 'pendant', secondaryCategoryId: 'pingan-kou', material: '足金999', craft: '3D硬金', weight: '6.8g', size: '实心', series: '平安扣系列', scene: '日常佩戴', images: [realImg('ATP1020素金正面')] },
  { id: 5, sku: 'JH-ZD-002', name: '福禄葫芦', primaryCategoryId: 'pendant', secondaryCategoryId: 'gourd', material: '足金999', craft: '3D硬金', weight: '5.2g', size: '空心', series: '福禄系列', scene: '赠礼', images: [realImg('ATP1020镶嵌正面')] },
  { id: 6, sku: 'JH-ZD-003', name: '长命锁包', primaryCategoryId: 'pendant', secondaryCategoryId: 'lock-pendant', material: '玉石', craft: '镶嵌', weight: '8.1g', size: '实心', series: '护佑系列', scene: '传承', images: [realImg('ATP2121佛正面')] },
  { id: 10, sku: 'JH-ZD-004', name: '如意吉祥', primaryCategoryId: 'pendant', secondaryCategoryId: 'ruyi', material: '足金999', craft: '古法金', weight: '12.5g', size: '实心', series: '如意系列', scene: '日常佩戴', images: [realImg('ATP1883转经筒正面')] },
  { id: 13, sku: 'JH-ZD-005', name: '如意呈祥', primaryCategoryId: 'pendant', secondaryCategoryId: 'ruyi', material: '足金999', craft: '古法金', weight: '9.3g', size: '实心', series: '如意系列', scene: '赠礼', images: [img('JH-ZD-005')] },
  { id: 16, sku: 'JH-ZD-006', name: '金叶轻语', primaryCategoryId: 'pendant', secondaryCategoryId: 'leaf', material: '足金9999', craft: '錾刻', weight: '7.2g', size: '空心', series: '自然系列', scene: '日常佩戴', images: [img('JH-ZD-006')] },
  { id: 19, sku: 'JH-ZD-007', name: '玲珑平安扣', primaryCategoryId: 'pendant', secondaryCategoryId: 'pingan-kou', material: '足金999', craft: '3D硬金', weight: '4.5g', size: '空心', series: '平安扣系列', scene: '日常佩戴', images: [img('JH-ZD-007')] },
  { id: 20, sku: 'JH-ZD-008', name: '宝相佛公', primaryCategoryId: 'pendant', secondaryCategoryId: 'buddha', material: '足金9999', craft: '古法金', weight: '15.8g', size: '实心', series: '宝相系列', scene: '收藏', images: [img('JH-ZD-008')] },
  { id: 24, sku: 'JH-ZD-009', name: '富贵锁包', primaryCategoryId: 'pendant', secondaryCategoryId: 'lock-pendant', material: '足金999', craft: '古法金', weight: '7.6g', size: '实心', series: '护佑系列', scene: '传承', images: [img('JH-ZD-009')] },
  // 手镯 (5)
  { id: 3, sku: 'JH-SZ-001', name: '传世固口镯', primaryCategoryId: 'bracelet', secondaryCategoryId: 'fixed-bangle', material: '足金9999', craft: '古法金', weight: '32.5g', size: '55—57mm', series: '传世系列', scene: '婚嫁', images: [realImg('ATP480正面')] },
  { id: 9, sku: 'JH-SZ-002', name: '镂空花丝镯', primaryCategoryId: 'bracelet', secondaryCategoryId: 'open-bangle', material: '足金9999', craft: '镂空', weight: '28.3g', size: '58—60mm', series: '花丝系列', scene: '日常佩戴', images: [realImg('ATP346正面')] },
  { id: 14, sku: 'JH-SZ-003', name: '古韵固口镯', primaryCategoryId: 'bracelet', secondaryCategoryId: 'fixed-bangle', material: '足金9999', craft: '古法金', weight: '35.1g', size: '55—57mm', series: '传世系列', scene: '婚嫁', images: [img('JH-SZ-003')] },
  { id: 17, sku: 'JH-SZ-004', name: '灵动抽拉镯', primaryCategoryId: 'bracelet', secondaryCategoryId: 'expandable-bangle', material: '18K金', craft: '拉丝', weight: '18.7g', size: '推拉', series: '灵动系列', scene: '日常佩戴', images: [img('JH-SZ-004')] },
  { id: 21, sku: 'JH-SZ-005', name: '素韵开口镯', primaryCategoryId: 'bracelet', secondaryCategoryId: 'open-bangle', material: '足金999', craft: '抛光', weight: '22.4g', size: '开口', series: '素韵系列', scene: '赠礼', images: [img('JH-SZ-005')] },
  // 戒指 (5)
  { id: 2, sku: 'JH-JZ-001', name: '璀璨镶钻戒', primaryCategoryId: 'ring', secondaryCategoryId: 'diamond-ring', material: '镶钻', craft: '镶嵌', weight: '4.2g', size: '11—13号', series: '璀璨系列', scene: '婚嫁', images: [realImg('ATP1101正面')] },
  { id: 7, sku: 'JH-JZ-002', name: '素金光圈戒', primaryCategoryId: 'ring', secondaryCategoryId: 'plain-band', material: '足金999', craft: '抛光', weight: '5.6g', size: '14—16号', series: '素金系列', scene: '日常佩戴', images: [img('JH-JZ-002')] },
  { id: 11, sku: 'JH-JZ-003', name: '花开富贵戒', primaryCategoryId: 'ring', secondaryCategoryId: 'flower-ring', material: '足金9999', craft: '錾刻', weight: '6.3g', size: '11—13号', series: '花漾系列', scene: '赠礼', images: [img('JH-JZ-003')] },
  { id: 15, sku: 'JH-JZ-004', name: '古法花戒', primaryCategoryId: 'ring', secondaryCategoryId: 'flower-ring', material: '足金999', craft: '古法金', weight: '5.8g', size: '14—16号', series: '花漾系列', scene: '日常佩戴', images: [img('JH-JZ-004')] },
  { id: 22, sku: 'JH-JZ-005', name: '同心对戒', primaryCategoryId: 'ring', secondaryCategoryId: 'couple-ring', material: '18K金', craft: '镶嵌', weight: '3.9g', size: '开口', series: '同心系列', scene: '婚嫁', images: [img('JH-JZ-005')] },
  // 耳饰 (5)
  { id: 4, sku: 'JH-ES-001', name: '星芒耳钩', primaryCategoryId: 'earring', secondaryCategoryId: 'hook', material: '铂金950', craft: '镶嵌', weight: '3.2g', size: '耳钩', series: '星芒系列', scene: '日常佩戴', images: [realImg('ATP137正面')] },
  { id: 8, sku: 'JH-ES-002', name: '珍珠耳钉', primaryCategoryId: 'earring', secondaryCategoryId: 'stud', material: '珍珠', craft: '镶嵌', weight: '2.1g', size: '耳针', series: '珍珠系列', scene: '赠礼', images: [img('JH-ES-002')] },
  { id: 12, sku: 'JH-ES-003', name: '流光耳环', primaryCategoryId: 'earring', secondaryCategoryId: 'hoop', material: '足金999', craft: '抛光', weight: '5.4g', size: '成对', series: '流光系列', scene: '日常佩戴', images: [img('JH-ES-003')] },
  { id: 18, sku: 'JH-ES-004', name: '古韵耳钩', primaryCategoryId: 'earring', secondaryCategoryId: 'hook', material: '足金999', craft: '古法金', weight: '4.8g', size: '耳钩', series: '古韵系列', scene: '收藏', images: [img('JH-ES-004')] },
  { id: 23, sku: 'JH-ES-005', name: '花丝耳钉', primaryCategoryId: 'earring', secondaryCategoryId: 'stud', material: '足金999', craft: '花丝', weight: '2.8g', size: '耳针', series: '花丝系列', scene: '日常佩戴', images: [img('JH-ES-005')] },
];
