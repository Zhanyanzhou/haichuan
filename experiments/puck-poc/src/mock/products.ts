/** 模拟商品数据 — PoC 用，不连接数据库 */

export interface MockProduct {
  id: number;
  name: string;
  image: string;
  price: number;
  category: string;
  categoryId: number;
  material: string;
}

export const mockProducts: MockProduct[] = [
  {
    id: 1,
    name: "足金花开富贵吊坠",
    image: "https://placehold.co/300x300/E8D5B7/5C4A2E?text=吊坠1",
    price: 3280,
    category: "黄金吊坠",
    categoryId: 1,
    material: "足金999",
  },
  {
    id: 2,
    name: "18K金钻石戒指",
    image: "https://placehold.co/300x300/D4C8B0/5C4A2E?text=戒指2",
    price: 5680,
    category: "钻石戒指",
    categoryId: 2,
    material: "AU750",
  },
  {
    id: 3,
    name: "和田玉平安扣",
    image: "https://placehold.co/300x300/C8DFC8/3A5A3A?text=玉扣3",
    price: 1980,
    category: "玉石挂件",
    categoryId: 3,
    material: "和田玉",
  },
  {
    id: 4,
    name: "珍珠项链礼盒装",
    image: "https://placehold.co/300x300/F0EDE4/7A6E5E?text=珍珠4",
    price: 4280,
    category: "珍珠项链",
    categoryId: 4,
    material: "淡水珍珠",
  },
  {
    id: 5,
    name: "铂金对戒套装",
    image: "https://placehold.co/300x300/E0DCD0/6B5B4A?text=对戒5",
    price: 8800,
    category: "钻石戒指",
    categoryId: 2,
    material: "PT950",
  },
  {
    id: 6,
    name: "翡翠手镯冰种",
    image: "https://placehold.co/300x300/A8C8A0/3A5A3A?text=手镯6",
    price: 15800,
    category: "玉石手镯",
    categoryId: 5,
    material: "翡翠",
  },
  {
    id: 7,
    name: "彩宝耳坠",
    image: "https://placehold.co/300x300/D4B0C8/5C3A4E?text=耳坠7",
    price: 2680,
    category: "彩宝饰品",
    categoryId: 6,
    material: "彩宝",
  },
  {
    id: 8,
    name: "银镶琥珀胸针",
    image: "https://placehold.co/300x300/C8B898/5C4A2E?text=胸针8",
    price: 1280,
    category: "银饰",
    categoryId: 7,
    material: "S925",
  },
];

export const mockCategories = [
  ...new Set(mockProducts.map((p) => p.category)),
].map((c, i) => ({
  id: i + 1,
  name: c,
}));

/** 模拟 productApi — 模拟未来正式项目中的真实 API 调用 */
export const mockProductApi = {
  search: async (
    query: string,
    categoryId?: number,
  ): Promise<MockProduct[]> => {
    // 模拟异步延迟
    await new Promise((r) => setTimeout(r, 300));
    return mockProducts.filter((p) => {
      const matchQuery =
        !query || p.name.includes(query) || p.material.includes(query);
      const matchCategory = !categoryId || p.categoryId === categoryId;
      return matchQuery && matchCategory;
    });
  },
  getByIds: async (ids: number[]): Promise<MockProduct[]> => {
    await new Promise((r) => setTimeout(r, 100));
    return mockProducts.filter((p) => ids.includes(p.id));
  },
  getCategories: async () => mockCategories,
};
