import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { QuotationsService } from "./quotations.service";

test("员工确认报价在读取或写入数据库前被拒绝", async () => {
  let databaseCalls = 0;
  const prisma = {
    quotation: new Proxy(
      {},
      {
        get: () => () => {
          databaseCalls += 1;
          throw new Error("不应访问数据库");
        },
      },
    ),
  };
  const service = new QuotationsService(prisma as unknown as PrismaService);

  await assert.rejects(
    () => service.changeStatus(1, "CONFIRMED"),
    ForbiddenException,
  );
  assert.equal(databaseCalls, 0);
});

test("客户确认状态机缺失时转单安全暂停且不创建订单", async () => {
  let databaseCalls = 0;
  const prisma = new Proxy(
    {},
    {
      get: () => {
        databaseCalls += 1;
        throw new Error("不应访问数据库");
      },
    },
  );
  const service = new QuotationsService(prisma as unknown as PrismaService);

  await assert.rejects(
    () => service.convertToOrder(1, { address: "测试地址" }),
    ServiceUnavailableException,
  );
  assert.equal(databaseCalls, 0);
});
