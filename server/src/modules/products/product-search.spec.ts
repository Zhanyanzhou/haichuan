import * as assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import {
  escapeSearchContains,
  normalizeProductSearch,
  parseProductSearch,
  productSearchFilters,
  productSearchRankBuckets,
  readRankedProductPage,
} from "./product-search";

test("连续中文按珠宝词切分，未知片段保持整体", () => {
  assert.deepEqual(parseProductSearch("圆牌镂空吊坠").groups, [
    ["圆牌"], ["镂空"], ["吊坠", "挂坠", "项坠"],
  ]);
  assert.deepEqual(parseProductSearch("六字真言吊坠").groups, [
    ["六字真言"], ["吊坠", "挂坠", "项坠"],
  ]);
  assert.deepEqual(parseProductSearch("圆牌不存在词吊坠").groups, [
    ["圆牌"], ["不存在词"], ["吊坠", "挂坠", "项坠"],
  ]);
  assert.deepEqual(parseProductSearch("小熊吊坠").groups, [
    ["小熊"], ["吊坠", "挂坠", "项坠"],
  ]);
});

test("全半角、词序、分隔符和重复别称得到一致词组，完整款号保留", () => {
  assert.equal(normalizeProductSearch("　ＡＴＰ３７５　"), "ATP375");
  assert.deepEqual(parseProductSearch("圆牌，挂坠/圆牌、项坠").groups, [
    ["圆牌"], ["吊坠", "挂坠", "项坠"],
  ]);
  assert.deepEqual(parseProductSearch("ＡＴＰ３７５吊坠").groups, [
    ["ATP375"], ["吊坠", "挂坠", "项坠"],
  ]);
  assert.deepEqual(parseProductSearch("ATP404-VAJRA_%").groups, [["ATP404-VAJRA_%"]]);
  assert.deepEqual(parseProductSearch("S925X AU750ABC S925-01").groups, [
    ["S925X"], ["AU750ABC"], ["S925-01"],
  ]);
  assert.deepEqual(parseProductSearch("18K金吊坠").groups, [
    ["au750", "18k金", "18k"], ["吊坠", "挂坠", "项坠"],
  ]);
  assert.equal(escapeSearchContains("ATP404-VAJRA_%\\"), "ATP404-VAJRA\\_\\%\\\\");
  assert.equal(parseProductSearch("金色吊坠").groups[0][0], "金色");
  assert.equal(normalizeProductSearch("a".repeat(101)).length, 100);
  assert.deepEqual(parseProductSearch("  ").groups, []);
});

test("别称组跨字段取或，未知词另成约束，分类链只接受有效分类", () => {
  const query = parseProductSearch("圆牌 挂坠 S925 不存在词");
  const filters = productSearchFilters(query, { S925: "银925", AU750: "18K金" });
  assert.equal(filters.length, 4);
  assert.deepEqual(filters[2].OR?.at(-1), { materialType: { in: ["S925"] } });
  assert.match(JSON.stringify(filters[1]), /挂坠/);
  assert.match(JSON.stringify(filters[1]), /项坠/);
  assert.equal(filters[1].OR?.filter((condition) => condition.category).length, 1);
  assert.match(JSON.stringify(filters[3]), /不存在词/);
  const category = (filters[0].OR as Prisma.ProductWhereInput[])[2].category as {
    is: Prisma.CategoryWhereInput;
  };
  let node = category.is;
  for (let depth = 0; depth < 4; depth += 1) {
    assert.equal(node.isActive, true);
    assert.equal(node.deletedAt, null);
    const next = node.OR?.[1]?.parent as { is?: Prisma.CategoryWhereInput } | undefined;
    if (depth < 3) {
      assert.ok(next?.is);
      node = next.is;
    } else {
      assert.equal(next, undefined);
    }
  }
});

test("间隔点与括号作为词间分隔，保留未知词和完整款号", () => {
  const expected = parseProductSearch("圆牌 镂空 吊坠").groups;
  for (const keyword of [
    "圆牌·镂空·吊坠",
    "圆牌・镂空•吊坠",
    "圆牌（镂空）吊坠",
    "圆牌【镂空】吊坠",
    "「圆牌」[镂空]吊坠",
  ]) {
    assert.deepEqual(parseProductSearch(keyword).groups, expected);
  }
  assert.deepEqual(parseProductSearch("圆牌（不存在词）吊坠").groups, [
    ["圆牌"], ["不存在词"], ["吊坠", "挂坠", "项坠"],
  ]);
  assert.deepEqual(parseProductSearch("（ATP404-VAJRA_%）").groups, [["ATP404-VAJRA_%"]]);
  assert.ok(parseProductSearch("（·）").groups.length > 0, "仅有标点时仍按字面约束查询");
});

type RankProduct = { id: number; code: string; name: string; status: string; sortOrder: number };

function matchesRankWhere(product: RankProduct, where: Prisma.ProductWhereInput): boolean {
  if (where.AND) {
    const entries = Array.isArray(where.AND) ? where.AND : [where.AND];
    if (!entries.every((entry) => matchesRankWhere(product, entry))) return false;
  }
  if (where.OR && !where.OR.some((entry) => matchesRankWhere(product, entry))) return false;
  if (where.NOT) {
    const entries = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
    if (entries.some((entry) => matchesRankWhere(product, entry))) return false;
  }
  if (typeof where.status === "string" && where.status !== product.status) return false;
  for (const field of ["code", "name"] as const) {
    const filter = where[field];
    if (typeof filter === "string" && filter !== product[field]) return false;
    if (filter && typeof filter !== "string") {
      if (typeof filter.equals === "string" && product[field].localeCompare(filter.equals, "de", { sensitivity: "base" }) !== 0) return false;
      if (typeof filter.contains === "string" && !product[field].includes(filter.contains)) return false;
    }
  }
  return true;
}

test("相关性桶完整互斥，先命中完整款号、名称，再短语，跨桶分页不漏不重", async () => {
  const products: RankProduct[] = [
    { id: 1, code: "ATP375", name: "完整款号", status: "PUBLISHED", sortOrder: 90 },
    { id: 2, code: "SECOND", name: "ATP375", status: "PUBLISHED", sortOrder: 80 },
    { id: 3, code: "THIRD", name: "圆牌ATP375吊坠", status: "PUBLISHED", sortOrder: 10 },
    { id: 4, code: "FOURTH", name: "ATP375花丝", status: "PUBLISHED", sortOrder: 5 },
    { id: 5, code: "FIFTH", name: "无关作品", status: "PUBLISHED", sortOrder: 1 },
    { id: 6, code: "ATP375", name: "草稿", status: "DRAFT", sortOrder: 0 },
  ];
  const where: Prisma.ProductWhereInput = { status: "PUBLISHED" };
  const buckets = productSearchRankBuckets(where, where, parseProductSearch("ATP375"));
  for (const product of products) {
    assert.equal(buckets.filter((bucket) => matchesRankWhere(product, bucket)).length, product.status === "PUBLISHED" ? 1 : 0);
  }
  const listCalls: Array<{ skip: number; take: number }> = [];
  const read = (page: number) => readRankedProductPage(
    where,
    buckets,
    page,
    2,
    async (filter) => products.filter((product) => matchesRankWhere(product, filter)).length,
    async (filter, skip, take) => {
      listCalls.push({ skip, take });
      return products.filter((product) => matchesRankWhere(product, filter))
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .slice(skip, skip + take);
    },
  );
  const first = await read(1);
  const second = await read(2);
  const third = await read(3);
  assert.deepEqual(first.list.map(({ id }) => id), [1, 2]);
  assert.deepEqual(second.list.map(({ id }) => id), [4, 3]);
  assert.deepEqual(third.list.map(({ id }) => id), [5]);
  assert.deepEqual([first.total, second.total, third.total], [5, 5, 5]);
  assert.equal(new Set([...first.list, ...second.list, ...third.list].map(({ id }) => id)).size, 5);
  assert.ok(listCalls.every(({ take }) => take <= 2));
  const callsBeforeEmptyPage = listCalls.length;
  assert.deepEqual((await read(4)).list, []);
  assert.equal(listCalls.length, callsBeforeEmptyPage);
});

test("名称连续短语排在分散词前，跨字段候选位于完整名称匹配之后", () => {
  const products: RankProduct[] = [
    { id: 1, code: "FIRST", name: "圆牌吊坠", status: "PUBLISHED", sortOrder: 50 },
    { id: 2, code: "SECOND", name: "镶嵌圆牌吊坠", status: "PUBLISHED", sortOrder: 40 },
    { id: 3, code: "THIRD", name: "圆牌六字真言花丝吊坠", status: "PUBLISHED", sortOrder: 1 },
    { id: 4, code: "FOURTH", name: "其他字段匹配", status: "PUBLISHED", sortOrder: 0 },
  ];
  const where: Prisma.ProductWhereInput = { status: "PUBLISHED" };
  const buckets = productSearchRankBuckets(where, where, parseProductSearch("圆牌 吊坠"));
  assert.deepEqual(products.map((product) => buckets.findIndex((bucket) => matchesRankWhere(product, bucket))), [1, 2, 3, 4]);
});

test("带空格完整商品名优先于紧凑写法的长名称，单一名称写法不生成重复条件", () => {
  const products: RankProduct[] = [
    { id: 1, code: "ATP404", name: "金刚杵吊坠 ATP404", status: "PUBLISHED", sortOrder: 90 },
    { id: 2, code: "OTHER", name: "金刚杵吊坠ATP404镶钻", status: "PUBLISHED", sortOrder: 1 },
  ];
  const where: Prisma.ProductWhereInput = { status: "PUBLISHED" };
  const buckets = productSearchRankBuckets(where, where, parseProductSearch("金刚杵吊坠 ATP404"));
  assert.deepEqual(products.map((product) => buckets.findIndex((bucket) => matchesRankWhere(product, bucket))), [1, 2]);

  const singleVariantBuckets = productSearchRankBuckets({}, {}, parseProductSearch("圆牌"));
  assert.deepEqual((singleVariantBuckets[1].AND as Prisma.ProductWhereInput[])[1], {
    name: { equals: "圆牌" },
  });
  assert.deepEqual((singleVariantBuckets[2].AND as Prisma.ProductWhereInput[])[1], {
    name: { contains: "圆牌" },
  });
});

test("排序精确匹配不能引入不满足 LIKE 词组的排序规则等价项", () => {
  const query = parseProductSearch("straße");
  const structuralWhere: Prisma.ProductWhereInput = { status: "PUBLISHED" };
  const matchingWhere: Prisma.ProductWhereInput = { ...structuralWhere, name: { contains: "ß" } };
  const buckets = productSearchRankBuckets(structuralWhere, matchingWhere, query);
  const collationEquivalent: RankProduct = {
    id: 1, code: "strasse", name: "strasse", status: "PUBLISHED", sortOrder: 1,
  };
  // 模拟等值比较可视为相同、LIKE 按字符匹配时却不相同的数据库排序规则。
  assert.equal(collationEquivalent.name.localeCompare(query.keyword, "de", { sensitivity: "base" }), 0);
  assert.equal(buckets.some((bucket) => matchesRankWhere(collationEquivalent, bucket)), false);
});
