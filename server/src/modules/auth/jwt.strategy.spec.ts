import assert from "node:assert/strict";
import test from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "./jwt.strategy";

const FAMILY_ID = "00000000-0000-4000-8000-000000000001";

function strategyWith(findFirst: (args: unknown) => Promise<unknown>) {
  return new JwtStrategy(
    { user: { findFirst } } as never,
    { get: (key: string) => key === "JWT_SECRET" ? "unit-test-secret" : "test" } as never,
  );
}

test("员工 access token 带 session family 时只接受仍启用的服务端会话", async () => {
  let where: unknown;
  const strategy = strategyWith(async (args: any) => {
    where = args.where;
    return {
      id: 7,
      username: "staff-7",
      role: "EDITOR",
      status: "ACTIVE",
    };
  });

  const result = await strategy.validate({
    sub: 7,
    type: "admin",
    tokenUse: "access",
    sessionFamilyId: FAMILY_ID,
  });
  assert.equal(result.id, 7);
  assert.deepEqual((where as any).adminRefreshSessions.some, {
    familyId: FAMILY_ID,
    revokedAt: null,
    expiresAt: { gt: (where as any).adminRefreshSessions.some.expiresAt.gt },
  });
  assert.equal(
    (where as any).adminRefreshSessions.some.expiresAt.gt instanceof Date,
    true,
  );
});

test("员工 access token 对应 family 已吊销时立即拒绝", async () => {
  const strategy = strategyWith(async () => null);
  await assert.rejects(
    strategy.validate({
      sub: 7,
      type: "admin",
      tokenUse: "access",
      sessionFamilyId: FAMILY_ID,
    }),
    UnauthorizedException,
  );
});

test("员工令牌继续拒绝客户域与畸形 session family", async () => {
  let databaseCalls = 0;
  const strategy = strategyWith(async () => {
    databaseCalls += 1;
    return null;
  });
  for (const payload of [
    { sub: 7, type: "customer", tokenUse: "access" },
    { sub: 7, type: "admin", tokenUse: "access", sessionFamilyId: { value: FAMILY_ID } },
  ]) {
    await assert.rejects(strategy.validate(payload), UnauthorizedException);
  }
  assert.equal(databaseCalls, 0);
});
