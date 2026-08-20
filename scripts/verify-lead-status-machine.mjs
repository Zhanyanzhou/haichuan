import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { LeadsService } = require(
  path.join(root, "server/dist/modules/leads/leads.service.js"),
);

const inquiry = { id: 7, status: "PENDING" };
const selectionInquiry = { id: 8, status: "FOLLOWING" };
const prisma = {
  inquiry: {
    findUnique: async ({ where }) =>
      where.id === inquiry.id ? { status: inquiry.status } : null,
    update: async ({ where, data }) => {
      assert.equal(where.id, inquiry.id);
      Object.assign(inquiry, data);
      return { ...inquiry };
    },
  },
  selectionInquiry: {
    findUnique: async ({ where }) =>
      where.id === selectionInquiry.id ? { status: selectionInquiry.status } : null,
    update: async ({ where, data }) => {
      assert.equal(where.id, selectionInquiry.id);
      Object.assign(selectionInquiry, data);
      return { ...selectionInquiry };
    },
  },
};
const service = new LeadsService(prisma);
const is422 = (error) => error?.getStatus?.() === 422;

await assert.rejects(
  () => service.updateLead("inquiry", 7, { status: "ARBITRARY" }),
  is422,
  "任意字符串不得写入线索状态",
);
await assert.rejects(
  () => service.updateLead("inquiry", 7, { status: "COMPLETED" }),
  is422,
  "待处理不能跳过联系和跟进直接完成",
);
const contacted = await service.updateLead("inquiry", 7, {
  status: "CONTACTED",
});
assert.equal(contacted.status, "CONTACTED", "合法状态流转必须成功");
await service.updateLead("inquiry", 7, { status: "COMPLETED" });
await assert.rejects(
  () => service.updateLead("inquiry", 7, { status: "FOLLOWING" }),
  is422,
  "终态不能被重新打开",
);
await assert.rejects(
  () => service.updateLead("other", 7, { status: "CONTACTED" }),
  is422,
  "未知线索类型不得被当作选款咨询处理",
);
await assert.rejects(
  () => service.updateLead("selection", 404, { status: "COMPLETED" }),
  (error) => error?.getStatus?.() === 404,
  "不存在的线索必须明确返回 404",
);

console.log("咨询状态机验证通过：状态白名单、合法流转、终态和不存在记录均受服务端保护。");
