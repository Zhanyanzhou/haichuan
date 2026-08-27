import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CustomerInquiryQueryDto } from "./dto/customer-inquiry-query.dto";
import { CustomersService } from "./customers.service";

test("客户咨询分页参数拒绝越界页码和页大小", async () => {
  const dto = plainToInstance(CustomerInquiryQueryDto, { page: "0", pageSize: "51" });
  const errors = await validate(dto);
  assert.equal(errors.length, 2);
});

test("客户咨询按客户隔离、稳定倒序并返回完整分页元数据", async () => {
  const findCalls: unknown[] = [];
  const countCalls: unknown[] = [];
  const rows = [
    { id: 8, customerId: 42, status: "PENDING", createdAt: new Date() },
  ];
  const prisma = {
    inquiry: {
      findMany: async (args: unknown) => {
        findCalls.push(args);
        return rows;
      },
      count: async (args: unknown) => {
        countCalls.push(args);
        return 7;
      },
    },
  };
  const service = new CustomersService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const result = await service.getInquiries(42, { page: 2, pageSize: 3 });

  assert.deepEqual(result, { list: rows, total: 7, page: 2, pageSize: 3 });
  assert.deepEqual(findCalls, [{
    where: { customerId: 42 },
    include: { product: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: 3,
    take: 3,
  }]);
  assert.deepEqual(countCalls, [{ where: { customerId: 42 } }]);
});
