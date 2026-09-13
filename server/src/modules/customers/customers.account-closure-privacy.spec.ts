import assert from "node:assert/strict";
import test from "node:test";
import * as bcrypt from "bcrypt";
import { CustomersService } from "./customers.service";

test("账户注销在同一事务清除联系方式、换绑目标、安全事件关联和会话哈希", async () => {
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
        avatarStorageKey: "9/123e4567-e89b-42d3-a456-426614174000.webp",
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
    customerContactChange: {
      updateMany: capture("customerContactChange.updateMany", { count: 2 }),
    },
    customerSecurityEvent: {
      updateMany: capture("customerSecurityEvent.updateMany", { count: 3 }),
    },
    customerAddress: {
      deleteMany: capture("customerAddress.deleteMany", { count: 1 }),
    },
    customerFavorite: {
      deleteMany: capture("customerFavorite.deleteMany", { count: 1 }),
    },
    notificationPreference: {
      deleteMany: capture("notificationPreference.deleteMany", { count: 2 }),
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
  const avatarRemovalSteps: string[] = [];
  const service = new CustomersService(
    prisma,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      prepareRemoval: async (storageKey: string) => {
        avatarRemovalSteps.push(`prepare:${storageKey}`);
        return true;
      },
      completePreparedRemoval: async (storageKey: string) => {
        avatarRemovalSteps.push(`complete:${storageKey}`);
      },
      cancelPreparedRemoval: async (storageKey: string) => {
        avatarRemovalSteps.push(`cancel:${storageKey}`);
      },
      remove: async (storageKey: string) => {
        avatarRemovalSteps.push(`remove:${storageKey}`);
      },
    } as never,
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
  assert.equal(customerWrite?.args.data.avatarStorageKey, null);
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

  const deliveryWrite = writes.find((write) => write.model === "notificationDelivery.updateMany");
  assert.equal(deliveryWrite?.args.data.status, "CANCELLED");
  assert.equal(deliveryWrite?.args.data.destinationHash, null);
  const preferenceWrite = writes.find((write) => write.model === "notificationPreference.deleteMany");
  assert.deepEqual(preferenceWrite?.args.where, { customerId: 9 });

  const contactWrites = writes.filter((write) => write.model === "customerContactChange.updateMany");
  assert.equal(contactWrites.length, 2);
  assert.equal(contactWrites[0].args.where.customerId, 9);
  assert.equal(contactWrites[0].args.data.targetValue, "closed-9");
  assert.match(contactWrites[0].args.data.verificationHash, /^[0-9a-f]{64}$/);
  assert.equal(contactWrites[1].args.where.completedAt, null);
  assert.equal(contactWrites[1].args.where.cancelledAt, null);
  assert.ok(contactWrites[1].args.data.cancelledAt instanceof Date);

  const securityWrite = writes.find((write) => write.model === "customerSecurityEvent.updateMany");
  assert.equal(securityWrite?.args.where.customerId, 9);
  assert.equal(securityWrite?.args.data.ipHash, null);
  assert.equal(securityWrite?.args.data.userAgentHash, null);
  assert.deepEqual(avatarRemovalSteps, [
    "prepare:9/123e4567-e89b-42d3-a456-426614174000.webp",
    "complete:9/123e4567-e89b-42d3-a456-426614174000.webp",
  ]);
});
