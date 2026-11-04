import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLocalCatalogDatabase,
  buildPilotProductDraft,
  legacyCategorySlug,
  legacyImageUrl,
  legacyProductCode,
  mapMaterial,
  parseSourceProduct,
  planPilotImages,
  readPilotArgs,
} from "./legacy-catalog-pilot";

test("数据库门禁只接受本机库，并且不回显密码", () => {
  assert.deepEqual(
    assertLocalCatalogDatabase("mysql://user:s3cret@127.0.0.1:3306/jewelry_db"),
    { host: "127.0.0.1", database: "jewelry_db" },
  );
  assert.throws(
    () => assertLocalCatalogDatabase("mysql://user:s3cret@db.example.com:3306/jewelry_db"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes("s3cret"), false);
      assert.equal(error.message.includes("db.example.com"), true);
      return true;
    },
  );
});

test("试导入参数不能超过 8 件", () => {
  assert.deepEqual(readPilotArgs(["--apply", "--limit", "8", "--category-id", "114"]), {
    apply: true,
    limit: 8,
    categoryId: 114,
  });
  assert.throws(() => readPilotArgs(["--limit", "20"]), /最多 8 件/);
});

test("分类 slug、货号和图片地址按本站约束收口", () => {
  assert.equal(legacyCategorySlug(114), "legacy-cat-114");
  assert.deepEqual(legacyProductCode(4416, "HC-ATP3669"), { code: "HC-ATP3669" });
  assert.equal(legacyProductCode(12, "货号 中文").code, "LEGACY-12");
  assert.equal(
    legacyImageUrl("/uploads/products/file.png"),
    "https://haichuanzhubao.com/public/uploads/products/file.png",
  );
  assert.equal(legacyImageUrl("/uploads/../secret.png"), null);
  assert.equal(legacyImageUrl("https://example.com/uploads/products/file.png"), null);
});

test("商品草稿不接收来源售价、库存和证书", () => {
  const product = parseSourceProduct({
    id: 4416,
    name: "测试吊坠",
    category_id: 334,
    description: "来源介绍里可能夹着报价",
    main_image: "/uploads/products/file.png",
    images: ["https://example.com/other.png"],
    detail_images: ["/uploads/products/detail.png"],
    params: [
      { name: "贵金属成色", value: "足金" },
      { name: "鉴定证书", value: "不附带证书" },
      { name: "增值服务", value: "支持定制" },
    ],
    key_params: [
      { name: "货号", value: "HC-ATP3669" },
      { name: "工艺", value: "古法金" },
    ],
    specs: [{ name: "红蜡", price: 25, weight: 40, quantity: 1000 }],
    fixed_price: "1000.00",
    stock: 1000,
  });
  const draft = buildPilotProductDraft(product, "吊坠 / 火焰守护神");
  const images = planPilotImages(product);

  assert.equal(draft.code, "HC-ATP3669");
  assert.equal(draft.materialType, "GOLD_999");
  assert.equal(draft.includesCertificate, false);
  assert.equal(draft.visibility, "INTERNAL");
  assert.equal(draft.salesMode, "DISPLAY_ONLY");
  assert.equal(draft.status, "DRAFT");
  assert.equal("price" in draft, false);
  assert.equal(draft.description.includes("1000"), false);
  assert.equal(draft.description.includes("25"), false);
  assert.ok(draft.issues.some((issue) => issue.includes("未写入成交价")));
  assert.ok(draft.issues.some((issue) => issue.includes("未写入可售库存")));
  assert.deepEqual(images.jobs.map((job) => job.type), ["FRONT", "DETAIL"]);
  assert.ok(images.issues.some((issue) => issue.includes("不安全")));
});

test("参数使用 key 时仍能读到货号和成色", () => {
  const product = parseSourceProduct({
    id: 856,
    name: "ATP980平安扣",
    category_id: 114,
    main_image: "/uploads/products/main.png",
    main_images: ["/uploads/products/main.png", "/uploads/products/side.png"],
    detail_images: ["/uploads/products/detail.png"],
    params: [
      { key: "货号", value: "HC-ATP980" },
      { key: "镶嵌材质", value: "未镶嵌素金" },
      { key: "贵金属成色", value: "足金" },
      { key: "工艺", value: "古法金" },
      { key: "鉴定证书", value: "不附带证书" },
    ],
    specs: [{ price: 1, weight: 12 }],
    stock: 1,
  });
  const draft = buildPilotProductDraft(product, "平安扣");

  assert.equal(draft.code, "HC-ATP980");
  assert.equal(draft.materialType, "GOLD_999");
  assert.deepEqual(draft.craftTechnique, ["古法金"]);
  assert.equal(planPilotImages(product).jobs.length, 3);
});

test("足金9999 不会被收成普通足金", () => {
  assert.equal(
    mapMaterial([{ name: "贵金属成色", value: "足金9999" }], []).materialType,
    "GOLD_9999",
  );
});
