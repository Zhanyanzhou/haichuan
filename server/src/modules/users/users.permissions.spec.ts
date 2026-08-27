import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { AfterSalesController } from "../after-sales/after-sales.controller";
import { PaymentsController } from "../payments/payments.controller";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { PrismaService } from "../../common/prisma/prisma.service";

test("WAREHOUSE 不在付款审核角色中，CUSTOMER_SERVICE 保留售后动作", () => {
  const approveRoles = Reflect.getMetadata(
    ROLES_KEY,
    PaymentsController.prototype.approve,
  ) as string[];
  const afterSalesRoles = Reflect.getMetadata(ROLES_KEY, AfterSalesController) as string[];
  assert.deepEqual(approveRoles, ["SUPER_ADMIN", "ADMIN"]);
  assert.equal(approveRoles.includes("WAREHOUSE"), false);
  assert.equal(afterSalesRoles.includes("CUSTOMER_SERVICE"), true);
  assert.equal(afterSalesRoles.includes("WAREHOUSE"), false);
});

test("员工删除接口仅 SUPER_ADMIN，服务端实际执行 DISABLED 而非物理删除", async () => {
  const roles = Reflect.getMetadata(
    ROLES_KEY,
    UsersController.prototype.delete,
  ) as string[];
  assert.deepEqual(roles, ["SUPER_ADMIN"]);

  let disabled = false;
  let deleted = false;
  const tx = {
    user: {
      findUnique: async () => ({ id: 2, role: "ADMIN", status: "ACTIVE" }),
      count: async () => 2,
      update: async ({ data }: any) => {
        disabled = data.status === "DISABLED";
        return { id: 2, status: data.status };
      },
      delete: async () => {
        deleted = true;
      },
    },
    adminRefreshSession: {
      updateMany: async () => ({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: async (callback: (client: any) => Promise<any>) => callback(tx),
  };
  const service = new UsersService(prisma as unknown as PrismaService);
  await service.delete(2, { id: 1, role: "SUPER_ADMIN" });
  assert.equal(disabled, true);
  assert.equal(deleted, false);
});
