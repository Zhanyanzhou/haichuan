import assert from "node:assert/strict";

const { SelectionInquiryService } = await import(
  "../server/dist/modules/selection-inquiry/selection-inquiry.service.js"
);

const records = [];
let createdCount = 0;
const prisma = {
  async $transaction(callback, options) {
    assert.equal(options.isolationLevel, "Serializable");
    return callback(this);
  },
  selectionInquiry: {
    async findMany({ where }) {
      return records.filter(
        (record) =>
          record.phone === where.phone && record.createdAt >= where.createdAt.gte,
      );
    },
    async create({ data }) {
      const record = {
        id: ++createdCount,
        createdAt: new Date(),
        ...data,
        items: data.items.create,
      };
      records.push(record);
      return record;
    },
  },
};
const productsService = {
  async resolveVisibleProductSnapshots(productIds) {
    return new Map(
      productIds.map((productId) => [
        productId,
        { name: `作品 ${productId}`, mediaUrl: `/media/${productId}.jpg` },
      ]),
    );
  },
};
const service = new SelectionInquiryService(prisma, productsService);

const create = (overrides = {}) =>
  service.create({
    customerName: "测试顾客",
    phone: "13800138000",
    privacyConsent: true,
    items: [{ productId: 11 }, { productId: 22 }],
    ...overrides,
  });

const first = await create();
const duplicate = await create({ items: [{ productId: 22 }, { productId: 11 }] });
assert.equal(duplicate.id, first.id, "相同手机号和商品集合应复用已有咨询");
assert.equal(createdCount, 1, "重复提交不得额外创建咨询");

await create({ items: [{ productId: 11 }, { productId: 33 }] });
await create({ phone: "13900139000" });
assert.equal(createdCount, 3, "不同商品集合或手机号应可创建新咨询");

console.log("selection inquiry idempotency verification passed");
