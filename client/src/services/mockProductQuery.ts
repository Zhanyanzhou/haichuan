export type MockProductFilterParams = {
  exactCode?: string;
  keyword?: string;
  categoryId?: number | string;
  categoryIds?: string;
  materialType?: string;
  materialTypes?: string;
  salesMode?: string;
  minPrice?: number;
  maxPrice?: number;
  craftTechniques?: string;
  sizes?: string;
  weightRanges?: string;
  status?: string;
  isHot?: string;
  isNew?: string;
  isRecommended?: string;
  sortBy?: string;
  sortOrder?: string;
  /** 公开目录专用：价格条件只能消费 DIRECT_PURCHASE 的公开成交价。 */
  publicPriceOnly?: boolean;
};

type FilterableMockProduct = {
  id: number;
  code: string;
  name: string;
  categoryId: number;
  category?: { name?: string } | null;
  materialType: string;
  craftTechnique?: string | string[] | null;
  size?: string | null;
  goldWeight?: number | null;
  weight?: number | null;
  price?: number | null;
  salesMode?: string;
  status: string;
  isHot?: boolean;
  isNew?: boolean;
  isRecommended?: boolean;
};

const MATERIAL_LABELS: Record<string, string> = {
  GOLD_999: "足金999",
  GOLD_9999: "足金9999",
  AU750: "18K金",
  PT950: "铂金950",
  S925: "银925",
  DIAMOND: "镶钻",
  JADE: "玉石",
  PEARL: "珍珠",
  COLOR_GEM: "彩宝",
  OTHER: "其他",
};

function csv(value: unknown) {
  return typeof value === "string"
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

export function filterProducts<T extends FilterableMockProduct>(
  products: readonly T[],
  params: MockProductFilterParams,
) {
  let result = [...products];
  if (params.exactCode) {
    result = result.filter((product) => product.code === params.exactCode);
  }
  if (params.keyword) {
    const keyword = params.keyword.toLowerCase();
    result = result.filter(
      (product) =>
        product.name.toLowerCase().includes(keyword) ||
        product.code.toLowerCase().includes(keyword) ||
        product.category?.name?.toLowerCase().includes(keyword) ||
        (MATERIAL_LABELS[product.materialType] || product.materialType)
          .toLowerCase()
          .includes(keyword),
    );
  }
  if (params.categoryId) {
    result = result.filter(
      (product) => product.categoryId === Number(params.categoryId),
    );
  }
  const categoryIds = new Set(csv(params.categoryIds).map(Number));
  if (categoryIds.size) {
    result = result.filter((product) => categoryIds.has(product.categoryId));
  }
  if (params.materialType) {
    result = result.filter(
      (product) => product.materialType === params.materialType,
    );
  }
  const materialTypes = new Set(csv(params.materialTypes));
  if (materialTypes.size) {
    result = result.filter((product) => materialTypes.has(product.materialType));
  }
  if (params.salesMode) {
    result = result.filter((product) => product.salesMode === params.salesMode);
  }
  const crafts = csv(params.craftTechniques);
  if (crafts.length) {
    result = result.filter((product) => {
      const craft = Array.isArray(product.craftTechnique)
        ? product.craftTechnique.join("、")
        : typeof product.craftTechnique === "string"
          ? product.craftTechnique
          : "";
      return crafts.some((item) => craft.includes(item));
    });
  }
  const sizes = new Set(csv(params.sizes));
  if (sizes.size) {
    result = result.filter(
      (product) => Boolean(product.size && sizes.has(product.size)),
    );
  }
  const ranges = csv(params.weightRanges).map((range) => {
    const [min, max] = range
      .split(":")
      .map((value) => (value ? Number(value) : undefined));
    return { min, max };
  });
  if (ranges.length) {
    result = result.filter((product) => {
      const weight =
        Number(product.goldWeight) > 0
          ? Number(product.goldWeight)
          : Number(product.weight);
      return ranges.some(
        ({ min, max }) =>
          typeof min === "number" &&
          Number.isFinite(min) &&
          weight >= min &&
          (max === undefined || weight < max),
      );
    });
  }
  if (params.status) {
    result = result.filter((product) => product.status === params.status);
  }
  if (params.isHot === "true") {
    result = result.filter((product) => product.isHot);
  }
  if (params.isNew === "true") {
    result = result.filter((product) => product.isNew);
  }
  if (params.isRecommended === "true") {
    result = result.filter((product) => product.isRecommended);
  }
  const usesPrice =
    params.minPrice !== undefined ||
    params.maxPrice !== undefined ||
    params.sortBy === "price_asc" ||
    params.sortBy === "price_desc";
  if (params.publicPriceOnly && usesPrice) {
    result = result.filter((product) => product.salesMode === "DIRECT_PURCHASE");
  }
  if (params.minPrice !== undefined) {
    result = result.filter((product) => Number(product.price) >= params.minPrice!);
  }
  if (params.maxPrice !== undefined) {
    result = result.filter((product) => Number(product.price) <= params.maxPrice!);
  }
  if (params.sortBy === "sortOrder") {
    result.sort((left, right) => left.id - right.id);
  }
  if (params.sortBy === "updated_desc") {
    result.sort((left, right) => right.id - left.id);
  }
  if (params.sortBy === "code_asc") {
    result.sort((left, right) => left.code.localeCompare(right.code));
  }
  if (params.sortBy === "price_asc") {
    result.sort((left, right) => (left.price || 0) - (right.price || 0));
  }
  if (params.sortBy === "price_desc") {
    result.sort((left, right) => (right.price || 0) - (left.price || 0));
  }
  if (params.sortBy === "price" && params.sortOrder === "asc") {
    result.sort((left, right) => (left.price || 0) - (right.price || 0));
  }
  if (params.sortBy === "price" && params.sortOrder === "desc") {
    result.sort((left, right) => (right.price || 0) - (left.price || 0));
  }
  return result;
}
