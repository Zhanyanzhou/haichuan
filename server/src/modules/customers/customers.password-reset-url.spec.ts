import * as assert from "node:assert/strict";
import { test } from "node:test";
import { CustomersService } from "./customers.service";

test("密码重置邮件把 bearer token 放在 fragment 而不是 HTTP 查询串", async () => {
  let sentHtml = "";
  const prisma = {
    customer: {
      findFirst: async () => ({ id: 7, name: "测试会员", phone: "13800138000" }),
    },
    customerPasswordResetToken: {
      updateMany: async () => ({ count: 1 }),
      create: async () => ({ id: 1 }),
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const mailer = {
    isAvailable: () => true,
    getSiteBaseUrl: () => "https://shop.example.test",
    renderShell: (html: string) => html,
    send: async ({ html }: { html: string }) => {
      sentHtml = html;
      return { delivered: true };
    },
  };
  const service = new CustomersService(
    prisma as any,
    {} as any,
    {} as any,
    mailer as any,
    {} as any,
    {} as any,
  );

  await service.requestPasswordReset("member@example.test");

  assert.match(sentHtml, /\/customer\/reset#token=[0-9a-f]{64}/);
  assert.doesNotMatch(sentHtml, /\/customer\/reset\?token=/);
});
