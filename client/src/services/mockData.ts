import { productPlaceholder } from '@/utils/placeholder';

// ===== Mock Data for Demo Mode (no backend required) =====
// 由环境变量 VITE_USE_MOCK 控制；默认关闭（仅 VITE_USE_MOCK=true 时启用），生产环境不得开启。
export const USE_MOCK = (import.meta as any).env?.VITE_USE_MOCK === 'true';

// ===== Categories (4-level tree) =====
export const mockCategories = [
  {
    id: 1, name: '手镯', slug: 'bracelet', level: 1, sortOrder: 1, isActive: true,
    children: [
      { id: 5, name: '卡家手镯', slug: 'cartier-style', level: 2, sortOrder: 1, parentId: 1, isActive: true, children: [] },
      { id: 6, name: '传承手镯', slug: 'heritage', level: 2, sortOrder: 2, parentId: 1, isActive: true, children: [
        { id: 51, name: '素面传承', slug: 'plain-heritage', level: 3, sortOrder: 1, parentId: 6, isActive: true, children: [] },
        { id: 52, name: '雕花传承', slug: 'carved-heritage', level: 3, sortOrder: 2, parentId: 6, isActive: true, children: [] },
      ]},
      { id: 7, name: '抽拉手镯', slug: 'adjustable', level: 2, sortOrder: 3, parentId: 1, isActive: true, children: [] },
      { id: 8, name: '镂空手镯', slug: 'hollow-bangle', level: 2, sortOrder: 4, parentId: 1, isActive: true, children: [] },
    ],
  },
  {
    id: 2, name: '吊坠', slug: 'pendant', level: 1, sortOrder: 2, isActive: true,
    children: [
      {
        id: 9, name: '\u5e73\u5b89\u6263', slug: 'pingan-kou', level: 2, sortOrder: 1, parentId: 2, isActive: true,
        children: [
          { id: 53, name: '\u7d20\u9762\u5e73\u5b89\u6263', slug: 'plain-pingan', level: 3, sortOrder: 1, parentId: 9, isActive: true, children: [] },
          { id: 54, name: '\u96d5\u82b1\u5e73\u5b89\u6263', slug: 'carved-pingan', level: 3, sortOrder: 2, parentId: 9, isActive: true, children: [] },
          { id: 55, name: '\u9576\u94bb\u5e73\u5b89\u6263', slug: 'diamond-pingan', level: 3, sortOrder: 3, parentId: 9, isActive: true, children: [] },
        ],
      },
      { id: 10, name: '葫芦', slug: 'gourd', level: 2, sortOrder: 2, parentId: 2, isActive: true, children: [] },
      { id: 11, name: '锁包', slug: 'lock-pendant', level: 2, sortOrder: 3, parentId: 2, isActive: true, children: [] },
      { id: 12, name: '佛公', slug: 'buddha', level: 2, sortOrder: 4, parentId: 2, isActive: true, children: [] },
      { id: 13, name: '叶子', slug: 'leaf', level: 2, sortOrder: 5, parentId: 2, isActive: true, children: [] },
      { id: 14, name: '如意', slug: 'ruyi', level: 2, sortOrder: 6, parentId: 2, isActive: true, children: [] },
    ],
  },
  {
    id: 3, name: '戒指', slug: 'ring', level: 1, sortOrder: 3, isActive: true,
    children: [
      { id: 15, name: '花戒', slug: 'flower-ring', level: 2, sortOrder: 1, parentId: 3, isActive: true, children: [] },
      { id: 16, name: '光圈戒', slug: 'plain-band', level: 2, sortOrder: 2, parentId: 3, isActive: true, children: [] },
      { id: 17, name: '镶钻戒', slug: 'diamond-ring', level: 2, sortOrder: 3, parentId: 3, isActive: true, children: [] },
      { id: 18, name: '情侣对戒', slug: 'couple-ring', level: 2, sortOrder: 4, parentId: 3, isActive: true, children: [] },
    ],
  },
  {
    id: 4, name: '耳饰', slug: 'earring', level: 1, sortOrder: 4, isActive: true,
    children: [
      { id: 19, name: '耳钉', slug: 'stud', level: 2, sortOrder: 1, parentId: 4, isActive: true, children: [] },
      { id: 20, name: '耳环', slug: 'hoop', level: 2, sortOrder: 2, parentId: 4, isActive: true, children: [] },
      { id: 21, name: '耳坠', slug: 'dangle', level: 2, sortOrder: 3, parentId: 4, isActive: true, children: [] },
    ],
  },
];

// ===== Products =====
const pImg = (id: number, name: string) => productPlaceholder(id, name);
const productImages = [
  pImg(1, '平安扣'), pImg(2, '戒指'), pImg(3, '手镯'), pImg(4, '耳坠'),
];

export const mockProducts = [
  { id: 1, code: 'JH-ZD-001', name: '星云系列 · 足金平安扣吊坠', description: '精选足金999材质，匠心雕刻星云纹理，平安扣造型圆润饱满，寓意平安吉祥。采用3D硬金工艺，立体感强，佩戴舒适。', categoryId: 53, category: { id: 53, name: '素面平安扣' }, materialType: 'GOLD_999', goldWeight: 8.88, craftFee: 380, price: 5280, weight: 9.20, size: '直径2.5cm', gemInfo: null, craftTechnique: ['3D硬金', '抛光'], status: 'PUBLISHED', isHot: true, isNew: false, isRecommended: true, isLimited: false, isCustom: false, viewCount: 3280, salesCount: 156, images: [{ id: 101, productId: 1, url: productImages[0], type: 'FRONT', sortOrder: 1, isVideo: false }, { id: 102, productId: 1, url: productImages[1], type: 'SIDE', sortOrder: 2, isVideo: false }, { id: 103, productId: 1, url: productImages[2], type: 'WEARING', sortOrder: 3, isVideo: false }], skus: [{ id: 201, productId: 1, skuCode: 'JH-ZD-001-G999', material: 'GOLD_999', size: '标准', goldWeight: 8.88, price: 5280, stock: 25, safetyStock: 5, isActive: true }, { id: 202, productId: 1, skuCode: 'JH-ZD-001-G9999', material: 'GOLD_9999', size: '标准', goldWeight: 9.05, price: 5680, stock: 10, safetyStock: 3, isActive: true }], certificates: [{ id: 301, productId: 1, certType: 'NATIONAL', certNumber: 'GJ2024-08888', certImage: '', expireDate: '2026-07-31' }], tags: [{ id: 401, productId: 1, tagName: '热卖' }, { id: 402, productId: 1, tagName: '推荐' }], createdAt: '2024-07-15' },
  { id: 2, code: 'JH-JZ-001', name: '银河之眼 · 18K金镶钻戒指', description: '18K金戒托，镶嵌0.5克拉高品质钻石，经典六爪镶嵌工艺，璀璨夺目。', categoryId: 17, category: { id: 17, name: '镶钻戒' }, materialType: 'DIAMOND', goldWeight: 5.20, craftFee: 580, price: 8999, weight: 5.80, size: '圈号14', gemInfo: { type: 'diamond', carat: 0.5, clarity: 'VVS1', color: 'D', cut: 'EX', quantity: 1 }, craftTechnique: ['镶嵌', '抛光', '拉丝'], status: 'PUBLISHED', isHot: true, isNew: true, isRecommended: false, isLimited: false, isCustom: false, viewCount: 4560, salesCount: 89, images: [{ id: 104, productId: 2, url: productImages[2], type: 'FRONT', sortOrder: 1, isVideo: false }, { id: 105, productId: 2, url: productImages[3], type: 'WEARING', sortOrder: 2, isVideo: false }], skus: [{ id: 203, productId: 2, skuCode: 'JH-JZ-001-AU750', material: 'AU750', size: '圈号14', goldWeight: 5.20, price: 8999, stock: 8, safetyStock: 3, isActive: true }], certificates: [{ id: 302, productId: 2, certType: 'GIA', certNumber: 'GIA2024-12345', certImage: '', expireDate: null }], tags: [{ id: 403, productId: 2, tagName: '热卖' }, { id: 404, productId: 2, tagName: '新品' }], createdAt: '2024-07-28' },
  { id: 3, code: 'JH-SZ-001', name: '流光溢彩 · 古法金花丝手镯', description: '传承古法金工艺，纯手工花丝编织，每一根金丝都经过精心拉制，呈现流光溢彩的视觉效果。', categoryId: 6, category: { id: 6, name: '传承手镯' }, materialType: 'GOLD_9999', goldWeight: 28.50, craftFee: 1200, price: 16800, weight: 30.20, size: '内径5.8cm', gemInfo: null, craftTechnique: ['古法金', '花丝', '錾刻', '抛光'], status: 'PUBLISHED', isHot: false, isNew: false, isRecommended: true, isLimited: true, isCustom: false, viewCount: 2100, salesCount: 32, images: [{ id: 106, productId: 3, url: productImages[1], type: 'FRONT', sortOrder: 1, isVideo: false }, { id: 107, productId: 3, url: productImages[0], type: 'DETAIL', sortOrder: 2, isVideo: false }], skus: [{ id: 204, productId: 3, skuCode: 'JH-SZ-001-G9999', material: 'GOLD_9999', size: '内径5.8cm', goldWeight: 28.50, price: 16800, stock: 3, safetyStock: 2, isActive: true }], certificates: [{ id: 303, productId: 3, certType: 'NATIONAL', certNumber: 'GJ2024-06666', certImage: '', expireDate: '2026-06-30' }], tags: [{ id: 405, productId: 3, tagName: '限量' }, { id: 406, productId: 3, tagName: '推荐' }], createdAt: '2024-06-20' },
  { id: 4, code: 'JH-ES-001', name: '星辰之泪 · 铂金钻石耳坠', description: 'Pt950铂金镶嵌钻石耳坠，流线型设计，佩戴摇曳生姿，尽显优雅气质。', categoryId: 21, category: { id: 21, name: '耳坠' }, materialType: 'PT950', goldWeight: 3.60, craftFee: 680, price: 12600, weight: 4.10, size: '长度4.5cm', gemInfo: { type: 'diamond', carat: 0.3, clarity: 'VS1', color: 'E', cut: 'VG', quantity: 2 }, craftTechnique: ['镶嵌', '抛光', '镂空'], status: 'PUBLISHED', isHot: true, isNew: false, isRecommended: false, isLimited: false, isCustom: true, viewCount: 1890, salesCount: 45, images: [{ id: 108, productId: 4, url: productImages[3], type: 'FRONT', sortOrder: 1, isVideo: false }, { id: 109, productId: 4, url: productImages[2], type: 'WEARING', sortOrder: 2, isVideo: false }], skus: [{ id: 205, productId: 4, skuCode: 'JH-ES-001-PT950', material: 'PT950', size: '标准', goldWeight: 3.60, price: 12600, stock: 15, safetyStock: 5, isActive: true }], certificates: [{ id: 304, productId: 4, certType: 'PROVINCIAL', certNumber: 'SJ2024-07777', certImage: '', expireDate: '2026-08-15' }], tags: [{ id: 407, productId: 4, tagName: '热卖' }, { id: 408, productId: 4, tagName: '定制' }], createdAt: '2024-07-10' },
  { id: 5, code: 'JH-ZD-002', name: '浩瀚宇宙 · 3D硬金葫芦吊坠', description: '3D硬金工艺打造立体葫芦造型，葫芦谐音"福禄"，寓意福禄双全。', categoryId: 10, category: { id: 10, name: '葫芦' }, materialType: 'GOLD_999', goldWeight: 6.20, craftFee: 280, price: 3980, weight: 6.50, size: '2.0cm×1.2cm', gemInfo: null, craftTechnique: ['3D硬金', '喷砂', '抛光'], status: 'PUBLISHED', isHot: false, isNew: true, isRecommended: true, isLimited: false, isCustom: false, viewCount: 1560, salesCount: 78, images: [{ id: 110, productId: 5, url: productImages[0], type: 'FRONT', sortOrder: 1, isVideo: false }], skus: [{ id: 206, productId: 5, skuCode: 'JH-ZD-002-G999', material: 'GOLD_999', size: '标准', goldWeight: 6.20, price: 3980, stock: 40, safetyStock: 10, isActive: true }], certificates: [{ id: 305, productId: 5, certType: 'NATIONAL', certNumber: 'GJ2024-09999', certImage: '', expireDate: '2026-09-01' }], tags: [{ id: 409, productId: 5, tagName: '新品' }, { id: 410, productId: 5, tagName: '推荐' }], createdAt: '2024-07-25' },
  { id: 6, code: 'JH-ZD-003', name: '福运锁包 · 足金镶玉吊坠', description: '传统锁包造型，足金包边镶嵌和田玉，寓意锁住平安富贵。', categoryId: 11, category: { id: 11, name: '锁包' }, materialType: 'JADE', goldWeight: 4.50, craftFee: 420, price: 6800, weight: 12.30, size: '2.5cm×1.8cm', gemInfo: { type: 'jade', carat: null, clarity: null, color: null, cut: null, quantity: 1 }, craftTechnique: ['古法金', '镶嵌', '抛光'], status: 'PUBLISHED', isHot: false, isNew: false, isRecommended: false, isLimited: true, isCustom: false, viewCount: 980, salesCount: 23, images: [{ id: 111, productId: 6, url: productImages[1], type: 'FRONT', sortOrder: 1, isVideo: false }], skus: [{ id: 207, productId: 6, skuCode: 'JH-ZD-003-G999', material: 'GOLD_999', size: '标准', goldWeight: 4.50, price: 6800, stock: 5, safetyStock: 2, isActive: true }], certificates: [{ id: 306, productId: 6, certType: 'NATIONAL', certNumber: 'GJ2024-05555', certImage: '', expireDate: '2026-05-31' }], tags: [{ id: 411, productId: 6, tagName: '限量' }], createdAt: '2024-05-15' },
  { id: 7, code: 'JH-JZ-002', name: '简约之光 · 足金光圈戒指', description: '经典光圈设计，足金999材质，简约大方，适合日常佩戴。', categoryId: 16, category: { id: 16, name: '光圈戒' }, materialType: 'GOLD_999', goldWeight: 3.80, craftFee: 120, price: 2280, weight: 3.95, size: '圈号13-18可选', gemInfo: null, craftTechnique: ['抛光'], status: 'PUBLISHED', isHot: false, isNew: false, isRecommended: false, isLimited: false, isCustom: false, viewCount: 4200, salesCount: 210, images: [{ id: 112, productId: 7, url: productImages[2], type: 'FRONT', sortOrder: 1, isVideo: false }], skus: [{ id: 208, productId: 7, skuCode: 'JH-JZ-002-G999-14', material: 'GOLD_999', size: '圈号14', goldWeight: 3.80, price: 2280, stock: 30, safetyStock: 10, isActive: true }], certificates: null, tags: [], createdAt: '2024-04-10' },
  { id: 8, code: 'JH-ES-002', name: '珍珠之吻 · 18K金珍珠耳钉', description: '精选南洋珍珠，18K金镶嵌，简约精致，优雅百搭。', categoryId: 19, category: { id: 19, name: '耳钉' }, materialType: 'PEARL', goldWeight: 1.50, craftFee: 200, price: 3200, weight: 3.20, size: '珍珠直径8mm', gemInfo: { type: 'pearl', carat: null, clarity: null, color: null, cut: null, quantity: 2 }, craftTechnique: ['镶嵌', '抛光'], status: 'PUBLISHED', isHot: true, isNew: false, isRecommended: false, isLimited: false, isCustom: false, viewCount: 2350, salesCount: 132, images: [{ id: 113, productId: 8, url: productImages[3], type: 'FRONT', sortOrder: 1, isVideo: false }], skus: [{ id: 209, productId: 8, skuCode: 'JH-ES-002-AU750', material: 'AU750', size: '标准', goldWeight: 1.50, price: 3200, stock: 20, safetyStock: 5, isActive: true }], certificates: null, tags: [{ id: 412, productId: 8, tagName: '热卖' }], createdAt: '2024-07-20' },
  { id: 9, code: 'JH-SZ-002', name: '花开富贵 · 镂空雕花手镯', description: '纯手工镂空雕花工艺，足金9999材质，牡丹花纹寓意富贵吉祥。', categoryId: 8, category: { id: 8, name: '镂空手镯' }, materialType: 'GOLD_9999', goldWeight: 22.00, craftFee: 900, price: 12800, weight: 23.50, size: '内径6.0cm', gemInfo: null, craftTechnique: ['镂空', '浮雕', '錾刻', '抛光'], status: 'DRAFT', isHot: false, isNew: true, isRecommended: false, isLimited: false, isCustom: false, viewCount: 340, salesCount: 0, images: [{ id: 114, productId: 9, url: productImages[0], type: 'FRONT', sortOrder: 1, isVideo: false }], skus: [], certificates: null, tags: [{ id: 413, productId: 9, tagName: '新品' }], createdAt: '2024-07-30' },
  { id: 10, code: 'JH-ZD-004', name: '福寿如意 · 古法金如意吊坠', description: '古法金工艺如意造型，錾刻祥云纹饰，寓意事事如意。', categoryId: 14, category: { id: 14, name: '如意' }, materialType: 'GOLD_999', goldWeight: 10.50, craftFee: 450, price: 6200, weight: 11.00, size: '3.0cm×1.5cm', gemInfo: null, craftTechnique: ['古法金', '錾刻', '抛光'], status: 'PUBLISHED', isHot: false, isNew: false, isRecommended: true, isLimited: false, isCustom: false, viewCount: 870, salesCount: 41, images: [{ id: 115, productId: 10, url: productImages[1], type: 'FRONT', sortOrder: 1, isVideo: false }], skus: [{ id: 210, productId: 10, skuCode: 'JH-ZD-004-G999', material: 'GOLD_999', size: '标准', goldWeight: 10.50, price: 6200, stock: 12, safetyStock: 5, isActive: true }], certificates: [{ id: 307, productId: 10, certType: 'PROVINCIAL', certNumber: 'SJ2024-04444', certImage: '', expireDate: '2026-04-30' }], tags: [{ id: 414, productId: 10, tagName: '推荐' }], createdAt: '2024-06-01' },
];

// ===== Orders =====
export const mockOrders = [
  { id: 1, orderNo: 'JH20240731001', customerName: '张先生', customerPhone: '138****8888', address: '广东省深圳市福田区xxx路xxx号', totalAmount: 5280, discountAmount: 0, finalAmount: 5280, status: 'PENDING_SHIP', logisticsCompany: null, logisticsNo: null, items: [{ id: 1, productId: 1, skuId: 201, quantity: 1, unitPrice: 5280, subtotal: 5280, product: { id: 1, name: '星云系列 · 足金平安扣吊坠' } }], createdAt: '2024-07-31 10:30' },
  { id: 2, orderNo: 'JH20240731002', customerName: '李女士', customerPhone: '139****9999', address: '北京市朝阳区国贸xxx', totalAmount: 16800, discountAmount: 0, finalAmount: 16800, status: 'PENDING_PAYMENT', logisticsCompany: null, logisticsNo: null, items: [{ id: 2, productId: 3, skuId: 204, quantity: 1, unitPrice: 16800, subtotal: 16800, product: { id: 3, name: '流光溢彩 · 古法金花丝手镯' } }], createdAt: '2024-07-31 10:25' },
  { id: 3, orderNo: 'JH20240730003', customerName: '王先生', customerPhone: '136****7777', address: '上海市浦东新区xxx', totalAmount: 14279, discountAmount: 0, finalAmount: 14279, status: 'SHIPPED', logisticsCompany: '顺丰速运', logisticsNo: 'SF1234567890', items: [{ id: 3, productId: 1, skuId: 201, quantity: 1, unitPrice: 5280, subtotal: 5280, product: { id: 1, name: '星云系列 · 足金平安扣吊坠' } }, { id: 4, productId: 2, skuId: 203, quantity: 1, unitPrice: 8999, subtotal: 8999, product: { id: 2, name: '银河之眼 · 18K金镶钻戒指' } }], createdAt: '2024-07-30 16:00' },
  { id: 4, orderNo: 'JH20240730004', customerName: '赵女士', customerPhone: '135****6666', address: '广州市天河区xxx路', totalAmount: 3980, discountAmount: 0, finalAmount: 3980, status: 'COMPLETED', logisticsCompany: '京东物流', logisticsNo: 'JD9876543210', items: [{ id: 5, productId: 5, skuId: 206, quantity: 1, unitPrice: 3980, subtotal: 3980, product: { id: 5, name: '浩瀚宇宙 · 3D硬金葫芦吊坠' } }], createdAt: '2024-07-30 14:20' },
  { id: 5, orderNo: 'JH20240729005', customerName: '陈先生', customerPhone: '137****5555', address: '杭州市西湖区xxx', totalAmount: 22800, discountAmount: 500, finalAmount: 22300, status: 'CANCELLED', logisticsCompany: null, logisticsNo: null, items: [], createdAt: '2024-07-29 09:00' },
];

// ===== Users =====
export const mockUsers = [
  { id: 1, username: 'haichuan', realName: '超级管理员', phone: '13800000000', email: 'admin@jewelryhub.com', role: 'SUPER_ADMIN', status: 'ACTIVE', lastLoginAt: '2024-07-31 10:30', createdAt: '2024-01-01' },
  { id: 2, username: 'zhangwei', realName: '张伟', phone: '13811111111', role: 'ADMIN', status: 'ACTIVE', lastLoginAt: '2024-07-31 09:15', createdAt: '2024-01-15' },
  { id: 3, username: 'liming', realName: '李明', phone: '13822222222', role: 'EDITOR', status: 'ACTIVE', lastLoginAt: '2024-07-30 16:00', createdAt: '2024-02-01' },
  { id: 4, username: 'wangfang', realName: '王芳', phone: '13833333333', role: 'CUSTOMER_SERVICE', status: 'ACTIVE', lastLoginAt: '2024-07-30 14:20', createdAt: '2024-03-01' },
  { id: 5, username: 'zhaoqiang', realName: '赵强', phone: '13844444444', role: 'WAREHOUSE', status: 'DISABLED', lastLoginAt: '2024-07-20 08:00', createdAt: '2024-03-15' },
];

// ===== Gold Price =====
export const mockGoldPrice = { id: 1, price: 485.60, source: 'AUTO', recordDate: new Date().toISOString(), change: 2.30, changePercent: '0.48' };

export const mockGoldPriceHistory = [
  { id: 1, price: 485.60, source: 'AUTO', change: 2.30, recordDate: '2024-07-31', operator: '系统' },
  { id: 2, price: 483.30, source: 'AUTO', change: -1.20, recordDate: '2024-07-30', operator: '系统' },
  { id: 3, price: 484.50, source: 'AUTO', change: 3.50, recordDate: '2024-07-29', operator: '系统' },
  { id: 4, price: 481.00, source: 'MANUAL', change: 0, recordDate: '2024-07-28', operator: '管理员' },
];

// ===== Mock API Delay =====
export const mockDelay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

// ===== Helper: Paginate =====
export function paginate<T>(list: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { list: list.slice(start, start + pageSize), total: list.length, page, pageSize };
}

// ===== Helper: Filter products =====
export function filterProducts(products: typeof mockProducts, params: any) {
  let result = [...products];
  const csv = (value: unknown) =>
    typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
  const materialLabel: Record<string, string> = {
    GOLD_999: '足金999', GOLD_9999: '足金9999', AU750: '18K金', PT950: '铂金950',
    S925: '银925', DIAMOND: '镶钻', JADE: '玉石', PEARL: '珍珠', COLOR_GEM: '彩宝', OTHER: '其他',
  };
  if (params.exactCode) result = result.filter((p) => p.code === params.exactCode);
  if (params.keyword) {
    const kw = params.keyword.toLowerCase();
    result = result.filter((p) =>
      p.name.toLowerCase().includes(kw) ||
      p.code.toLowerCase().includes(kw) ||
      p.category?.name?.toLowerCase().includes(kw) ||
      (materialLabel[p.materialType] || p.materialType).toLowerCase().includes(kw),
    );
  }
  if (params.categoryId) result = result.filter((p) => p.categoryId === +params.categoryId);
  const categoryIds = new Set(csv(params.categoryIds).map(Number));
  if (categoryIds.size) result = result.filter((p) => categoryIds.has(p.categoryId));
  if (params.materialType) result = result.filter((p) => p.materialType === params.materialType);
  const materialTypes = new Set(csv(params.materialTypes));
  if (materialTypes.size) result = result.filter((p) => materialTypes.has(p.materialType));
  const crafts = csv(params.craftTechniques);
  if (crafts.length) {
    result = result.filter((p) => {
      const craft = Array.isArray(p.craftTechnique)
        ? p.craftTechnique.join('、')
        : typeof p.craftTechnique === 'string' ? p.craftTechnique : '';
      return crafts.some((item) => craft.includes(item));
    });
  }
  const sizes = new Set(csv(params.sizes));
  if (sizes.size) result = result.filter((p) => Boolean(p.size && sizes.has(p.size)));
  const ranges = csv(params.weightRanges).map((range) => {
    const [min, max] = range.split(':').map((value) => value ? Number(value) : undefined);
    return { min, max };
  });
  if (ranges.length) {
    result = result.filter((p) => {
      const weight = Number(p.goldWeight) > 0 ? Number(p.goldWeight) : Number(p.weight);
      return ranges.some(({ min, max }) =>
        Number.isFinite(min) && weight >= Number(min) && (max === undefined || weight < max),
      );
    });
  }
  if (params.status) result = result.filter((p) => p.status === params.status);
  if (params.isHot === 'true') result = result.filter((p) => p.isHot);
  if (params.isNew === 'true') result = result.filter((p) => p.isNew);
  if (params.isRecommended === 'true') result = result.filter((p) => p.isRecommended);
  if (params.sortBy === 'sortOrder') result.sort((a, b) => a.id - b.id);
  if (params.sortBy === 'updated_desc') result.sort((a, b) => b.id - a.id);
  if (params.sortBy === 'code_asc') result.sort((a, b) => a.code.localeCompare(b.code));
  if (params.sortBy === 'price_asc') result.sort((a, b) => (a.price || 0) - (b.price || 0));
  if (params.sortBy === 'price_desc') result.sort((a, b) => (b.price || 0) - (a.price || 0));
  if (params.sortBy === 'price' && params.sortOrder === 'asc') result.sort((a, b) => (a.price || 0) - (b.price || 0));
  if (params.sortBy === 'price' && params.sortOrder === 'desc') result.sort((a, b) => (b.price || 0) - (a.price || 0));
  return result;
}
