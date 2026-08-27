import assert from "node:assert/strict";
import test from "node:test";
import * as bcrypt from "bcrypt";
import { CustomersService } from "./customers.service";

test("账户注销在同一事务清除手机号、微信身份、会话哈希和同意关联", async () => {
  const passwordHash = await bcrypt.hash("member123", 4);
  const writes: Array<{ model: string; args: any }> = [];
  const capture = (model: string, result: unknown) => async (args: any) => {
    writes.push({ model, args });
    return result;
  };
  const prisma: any = {
    customer: {
      findUnique: async () => ({
        id: 9,
        phone: "13800000009",
        passwordHash,
        wechatOpenId: "openid-private",
        wechatUnionId: "unionid-private",
      }),
      update: capture("customer.update", { id: 9 }),
    },
    lead: { findMany: async () => [] },
    inquiry: { findMany: async () => [] },
    selectionInquiry: { findMany: async () => [] },
    customerPasswordResetToken: {
      updateMany: capture("customerPasswordResetToken.updateMany", { count: 1 }),
    },
    customerSmsCode: {
      updateMany: capture("customerSmsCode.updateMany", { count: 2 }),
    },
    customerAddress: {
      deleteMany: capture("customerAddress.deleteMany", { count: 1 }),
    },
    customerFavorite: {
      deleteMany: capture("customerFavorite.deleteMany", { count: 1 }),
    },
    notificationDelivery: {
      updateMany: capture("notificationDelivery.updateMany", { count: 1 }),
    },
    notification: {
      updateMany: capture("notification.updateMany", { count: 1 }),
    },
    customerRefreshSession: {
      updateMany: capture("customerRefreshSession.updateMany", { count: 1 }),
    },
    consentRecord: {
      updateMany: capture("consentRecord.updateMany", { count: 1 }),
    },
    $transaction: async (callback: (transaction: any) => unknown) => callback(prisma),
  };
  const service = new CustomersService(
    prisma,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const result = await service.closeAccount(9, "member123");
  assert.equal(result.retainedUnderLegalHold, 0);

  const customerWrite = writes.find((write) => write.model === "customer.update");
  assert.equal(customerWrite?.args.data.phone, "closed-9");
  assert.equal(customerWrite?.args.data.name, "已注销会员");
  assert.equal(customerWrite?.args.data.email, null);
  assert.equal(customerWrite?.args.data.wechatOpenId, null);
  assert.equal(customerWrite?.args.data.wechatUnionId, null);
  assert.equal(customerWrite?.args.data.status, "DISABLED");
  assert.notEqual(customerWrite?.args.data.passwordHash, passwordHash);

  const smsWrite = writes.find((write) => write.model === "customerSmsCode.updateMany");
  assert.equal(smsWrite?.args.where.phone, "13800000009");
  assert.equal(smsWrite?.args.data.phone, "closed-9");
  assert.ok(smsWrite?.args.data.usedAt instanceof Date);

  const sessionWrite = writes.find((write) => write.model === "customerRefreshSession.updateMany");
  assert.equal(sessionWrite?.args.data.userAgentHash, null);
  assert.equal(sessionWrite?.args.data.ipHash, null);

  const consentWrite = writes.find((write) => write.model === "consentRecord.updateMany");
  assert.equal(consentWrite?.args.data.customerId, null);
  assert.equal(consentWrite?.args.data.anonymousIdHash, null);
});
