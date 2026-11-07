import { MaterialType, Prisma } from "@prisma/client";

// 只收录明确的品类、工艺和主题。未知片段保留整体，避免单字碰巧凑成命中。
const JEWELRY_WORDS = [
  "圆牌", "吊坠", "挂坠", "项坠", "六字真言", "平安扣", "金刚杵", "花丝",
  "镂空", "莲花", "莲瓣", "珍珠", "竹叶", "古法金", "古法", "足金9999",
  "足金999", "足金", "18k金", "18k", "au750", "s925", "925银", "银925",
  "pt950", "铂金950", "铂金", "银", "黄金", "镶钻", "钻石", "玉石", "彩宝",
  "手镯", "手链", "手串", "项链", "戒指", "指环", "耳饰", "耳环", "耳钉",
  "耳坠", "戒面", "胸针", "佛牌", "藏佛牌", "葫芦", "如意", "兽面", "卷云纹",
  "鱼鳞纹", "花卉", "枝叶", "蝴蝶", "猫咪", "宝相花", "阿弥陀佛", "不动明王",
  "浮雕", "线雕", "线刻", "磨砂", "群镶", "镶嵌", "抛光", "拉丝", "喷砂",
  "錾刻", "3d硬金", "硬金", "珐琅", "正面", "背面", "素面", "素圈", "光圈",
  "细链", "圆石", "中央", "圆孔", "八瓣", "多瓣", "弧面", "外凸", "立体",
  "内外圈", "组合", "花纹",
].sort((left, right) => right.length - left.length);

const SEARCH_ALIASES = [
  ["吊坠", "挂坠", "项坠"],
  ["戒指", "指环"],
  ["s925", "925银", "银925"],
  ["au750", "18k金", "18k"],
] as const;

export interface ProductSearchQuery {
  keyword: string;
  phrase: string;
  groups: string[][];
}

export function normalizeProductSearch(value: string): string {
  return value.normalize("NFKC").trim().slice(0, 100);
}

function splitSearchChunk(chunk: string): string[] {
  const terms: string[] = [];
  const lowerChunk = chunk.toLowerCase();
  let unknown = "";
  let offset = 0;
  while (offset < chunk.length) {
    const word = JEWELRY_WORDS.find((entry) => lowerChunk.startsWith(entry, offset));
    // 款号中的连字符、下划线与数字属于同一段，不能拆坏完整编号。
    const code = chunk.slice(offset).match(/^[a-z0-9][a-z0-9_%\\-]*/i)?.[0];
    if (word || code) {
      if (unknown) {
        terms.push(unknown);
        unknown = "";
      }
      const term = code && code.length > (word?.length ?? 0) ? code : word ?? code!;
      terms.push(chunk.slice(offset, offset + term.length));
      offset += term.length;
    } else {
      unknown += chunk[offset];
      offset += 1;
    }
  }
  if (unknown) terms.push(unknown);
  return terms;
}

export function parseProductSearch(value: string): ProductSearchQuery {
  const keyword = normalizeProductSearch(value);
  const chunks = keyword.match(/[^\s,、/;|·•・()[\]{}「」『』【】《》〈〉]+/gu) ?? (keyword ? [keyword] : []);
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const term of chunks.flatMap(splitSearchChunk)) {
    const aliases = SEARCH_ALIASES.find((group) =>
      (group as readonly string[]).includes(term.toLowerCase()),
    );
    const group = aliases ? [...aliases] : [term];
    const key = group[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push(group);
  }
  return { keyword, phrase: chunks.join(""), groups };
}

export function escapeSearchContains(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function activeCategoryMatch(contains: string[], levels: number): Prisma.CategoryWhereInput {
  return {
    isActive: true,
    deletedAt: null,
    OR: [
      ...contains.map((value) => ({ name: { contains: value } })),
      ...(levels > 1 ? [{ parent: { is: activeCategoryMatch(contains, levels - 1) } }] : []),
    ],
  };
}

export function productSearchFilters(
  query: ProductSearchQuery,
  materialLabels: Record<string, string>,
): Prisma.ProductWhereInput[] {
  return query.groups.map((group) => {
    const contains = group.map(escapeSearchContains);
    const filters: Prisma.ProductWhereInput[] = [
      ...contains.flatMap((value) => [
        { name: { contains: value } },
        { code: { contains: value } },
      ]),
      { category: { is: activeCategoryMatch(contains, 4) } },
    ];
    const materialTypes = Object.entries(materialLabels)
      .filter(([type, label]) => group.some((term) =>
        type.toLowerCase() === term.toLowerCase()
          || label.toLowerCase().includes(term.toLowerCase()),
      ))
      .map(([type]) => type as MaterialType);
    if (materialTypes.length) filters.push({ materialType: { in: materialTypes } });
    return { OR: filters };
  });
}

/** 各桶互斥且覆盖完整候选集，分页在数据库执行，不把全库载入内存。 */
export function productSearchRankBuckets(
  structuralWhere: Prisma.ProductWhereInput,
  matchingWhere: Prisma.ProductWhereInput,
  query: ProductSearchQuery,
): Prisma.ProductWhereInput[] {
  // 商品名称可含内部空格，同时保留原查询与紧凑写法的名称优先级。
  const nameVariants = [...new Set([query.keyword, query.phrase])];
  const exactNames: Prisma.ProductWhereInput[] = nameVariants.map((value) => ({
    name: { equals: value },
  }));
  const namePhrases: Prisma.ProductWhereInput[] = nameVariants.map((value) => ({
    name: { contains: escapeSearchContains(value) },
  }));
  // MySQL 的等值比较与 LIKE 在某些字符上不同，排序桶仍须逐组校验字段命中。
  const matchesTerms = (field: "code" | "name"): Prisma.ProductWhereInput => ({
    AND: query.groups.map((group) => ({
      OR: group.map((term) => ({ [field]: { contains: escapeSearchContains(term) } })),
    })),
  });
  const exactCode: Prisma.ProductWhereInput = {
    AND: [{ code: { equals: query.keyword } }, matchesTerms("code")],
  };
  const matchingName = matchesTerms("name");
  const namePriorities: Prisma.ProductWhereInput[] = [
    nameVariants.length === 1 ? exactNames[0] : { OR: exactNames },
    nameVariants.length === 1 ? namePhrases[0] : { OR: namePhrases },
    {},
  ];
  // 前四桶只按款号或名称校验词组，跨字段桶才展开完整分类匹配。
  return [
    { AND: [structuralWhere, exactCode] },
    ...namePriorities.map((priority, index) => ({
      AND: [
        structuralWhere,
        priority,
        matchingName,
        { NOT: { OR: [exactCode, ...namePriorities.slice(0, index)] } },
      ],
    })),
    { AND: [matchingWhere, { NOT: { OR: [exactCode, matchingName] } }] },
  ];
}

export async function readRankedProductPage<T>(
  matchingWhere: Prisma.ProductWhereInput,
  buckets: Prisma.ProductWhereInput[],
  page: number,
  pageSize: number,
  count: (where: Prisma.ProductWhereInput) => Promise<number>,
  find: (where: Prisma.ProductWhereInput, skip: number, take: number) => Promise<T[]>,
): Promise<{ list: T[]; total: number }> {
  const total = await count(matchingWhere);
  let skip = (page - 1) * pageSize;
  if (skip >= total) return { list: [], total };
  if (total === 1) return { list: await find(matchingWhere, 0, 1), total };

  const limit = Math.min(pageSize, total - skip);
  const list: T[] = [];
  for (const [index, bucket] of buckets.entries()) {
    // 首页直接按剩余容量读取，只有跨页跳过前桶时才需要计数。
    if (skip > 0 && index < buckets.length - 1) {
      const bucketCount = await count(bucket);
      if (skip >= bucketCount) {
        skip -= bucketCount;
        continue;
      }
    }
    list.push(...await find(bucket, skip, limit - list.length));
    if (list.length >= limit) break;
    skip = 0;
  }
  return { list, total };
}
