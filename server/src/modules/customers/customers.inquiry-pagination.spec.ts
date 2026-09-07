import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { CustomerInquiryQueryDto } from "./dto/customer-inquiry-query.dto";
import { CustomersController } from "./customers.controller";
import { CustomerAuthGuard } from "./customer-auth.guard";
import { CustomersService } from "./customers.service";
import {
  CUSTOMER_INQUIRY_EXPORT_SELECT,
  CUSTOMER_INQUIRY_LIST_SELECT,
} from "../inquiries/customer-inquiry.response";
import {
  CUSTOMER_SELECTION_INQUIRY_EXPORT_SELECT,
  CUSTOMER_SELECTION_INQUIRY_LIST_SELECT,
} from "../selection-inquiry/customer-selection-inquiry.response";
import { CUSTOMER_CONSULTATION_DETAIL_SELECT } from "../leads/customer-lead-reply.response";

test("客户咨询分页参数拒绝越界页码和页大小", async () => {
  const dto = plainToInstance(CustomerInquiryQueryDto, { page: "0", pageSize: "51" });
  const errors = await validate(dto);
  assert.equal(errors.length, 2);
});

test("客户咨询按客户隔离、稳定倒序并返回完整分页元数据", async () => {
  const findCalls: unknown[] = [];
  const countCalls: unknown[] = [];
  const rows = [
    {
      id: 8,
      customerId: 42,
      status: "PENDING",
      message: "希望周六到店鉴赏。",
      createdAt: new Date("2026-09-06T00:00:00.000Z"),
      updatedAt: new Date("2026-09-06T00:30:00.000Z"),
      consultationType: "appointment",
      preferredContact: "phone",
      preferredTime: "weekend",
      budgetRange: "20k-50k",
      product: { name: "星河戒指", internalCost: "不可见" },
      lead: {
        id: 41,
        status: "CONTACTED",
        updatedAt: new Date("2026-09-07T01:00:00.000Z"),
        activities: [{
          id: 91,
          content: "已为您安排本周六到店鉴赏。",
          createdAt: new Date("2026-09-07T01:00:00.000Z"),
        }],
      },
      assignedTo: 9,
      internalNote: "仅管理员可见",
      nextFollowUpAt: new Date("2026-09-07T00:00:00.000Z"),
    },
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

  assert.deepEqual(result, {
    list: [{
      id: 8,
      leadId: 41,
      status: "CONTACTED",
      message: "希望周六到店鉴赏。",
      createdAt: new Date("2026-09-06T00:00:00.000Z"),
      updatedAt: new Date("2026-09-07T01:00:00.000Z"),
      consultationType: "appointment",
      preferredContact: "phone",
      preferredTime: "weekend",
      budgetRange: "20k-50k",
      product: { name: "星河戒指" },
      reply: {
        id: 91,
        content: "已为您安排本周六到店鉴赏。",
        createdAt: new Date("2026-09-07T01:00:00.000Z"),
      },
    }],
    total: 7,
    page: 2,
    pageSize: 3,
  });
  assert.deepEqual(findCalls, [{
    where: { customerId: 42 },
    select: CUSTOMER_INQUIRY_LIST_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: 3,
    take: 3,
  }]);
  assert.deepEqual(countCalls, [{ where: { customerId: 42 } }]);
  assert.equal("internalNote" in result.list[0], false);
  assert.equal("assignedTo" in result.list[0], false);
  assert.equal("nextFollowUpAt" in result.list[0], false);
});

test("客户选款咨询只返回展示所需字段并按客户隔离", async () => {
  const findCalls: unknown[] = [];
  const prisma = {
    selectionInquiry: {
      findMany: async (args: { where: { customerId: number } }) => {
        findCalls.push(args);
        if (args.where.customerId !== 42) return [];
        return [{
          id: 18,
          customerId: 42,
          status: "PROCESSING",
          message: "希望比较三件作品。",
          createdAt: new Date("2026-09-06T01:00:00.000Z"),
          updatedAt: new Date("2026-09-06T01:30:00.000Z"),
          items: [{
            productNameSnapshot: "云水手镯",
            productId: 21,
            productImageSnapshot: "/private/source.jpg",
          }],
          lead: {
            id: 42,
            status: "FOLLOWING",
            updatedAt: new Date("2026-09-07T02:00:00.000Z"),
            activities: [{
              id: 92,
              content: "到店时可逐一试戴比较。",
              createdAt: new Date("2026-09-07T02:00:00.000Z"),
            }],
          },
          internalNote: "内部备注",
          handledBy: 3,
          nextFollowUpAt: new Date("2026-09-08T00:00:00.000Z"),
        }];
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

  const own = await service.getSelectionInquiries(42);
  const anotherCustomer = await service.getSelectionInquiries(7);

  assert.deepEqual(own, [{
    id: 18,
    leadId: 42,
    status: "FOLLOWING",
    message: "希望比较三件作品。",
    createdAt: new Date("2026-09-06T01:00:00.000Z"),
    updatedAt: new Date("2026-09-07T02:00:00.000Z"),
    items: [{ productNameSnapshot: "云水手镯" }],
    reply: {
      id: 92,
      content: "到店时可逐一试戴比较。",
      createdAt: new Date("2026-09-07T02:00:00.000Z"),
    },
  }]);
  assert.deepEqual(anotherCustomer, []);
  assert.deepEqual(findCalls, [
    {
      where: { customerId: 42 },
      select: CUSTOMER_SELECTION_INQUIRY_LIST_SELECT,
      orderBy: { createdAt: "desc" },
    },
    {
      where: { customerId: 7 },
      select: CUSTOMER_SELECTION_INQUIRY_LIST_SELECT,
      orderBy: { createdAt: "desc" },
    },
  ]);
  assert.equal("internalNote" in own[0], false);
  assert.equal("handledBy" in own[0], false);
  assert.equal("nextFollowUpAt" in own[0], false);
  assert.deepEqual(Object.keys(own[0].items[0]), ["productNameSnapshot"]);
});

test("客户可按 Lead.id 定向读取本人两类咨询及唯一回复事实", async () => {
  const calls: unknown[] = [];
  const fixtures = [
    {
      id: 41,
      sourceType: "INQUIRY",
      status: "CONTACTED",
      createdAt: new Date("2026-09-06T00:00:00.000Z"),
      updatedAt: new Date("2026-09-07T01:00:00.000Z"),
      activities: [{
        id: 91,
        content: "已为您保留周六下午。",
        createdAt: new Date("2026-09-07T01:00:00.000Z"),
      }],
      inquiry: {
        id: 17,
        message: "希望周六到店。",
        consultationType: "appointment",
        preferredContact: "phone",
        preferredTime: "weekend",
        budgetRange: "20k-50k",
        product: { name: "星河戒指" },
      },
      selectionInquiry: null,
    },
    {
      id: 42,
      sourceType: "SELECTION_INQUIRY",
      status: "FOLLOWING",
      createdAt: new Date("2026-09-06T02:00:00.000Z"),
      updatedAt: new Date("2026-09-07T02:00:00.000Z"),
      activities: [{
        id: 92,
        content: "到店时可逐一试戴。",
        createdAt: new Date("2026-09-07T02:00:00.000Z"),
      }],
      inquiry: null,
      selectionInquiry: {
        id: 18,
        message: "希望比较两件作品。",
        items: [
          { productNameSnapshot: "云水手镯" },
          { productNameSnapshot: "流光项链" },
        ],
      },
    },
  ];
  const prisma = {
    lead: {
      findFirst: async (args: { where: { id: number; customerId: number } }) => {
        calls.push(args);
        return args.where.customerId === 42
          ? fixtures.find((fixture) => fixture.id === args.where.id) ?? null
          : null;
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

  const inquiry = await service.getConsultation(42, 41);
  const selection = await service.getConsultation(42, 42);

  assert.deepEqual(inquiry, {
    leadId: 41,
    status: "CONTACTED",
    updatedAt: new Date("2026-09-07T01:00:00.000Z"),
    reply: {
      id: 91,
      content: "已为您保留周六下午。",
      createdAt: new Date("2026-09-07T01:00:00.000Z"),
    },
    type: "inquiry",
    sourceId: 17,
    createdAt: new Date("2026-09-06T00:00:00.000Z"),
    message: "希望周六到店。",
    consultationType: "appointment",
    preferredContact: "phone",
    preferredTime: "weekend",
    budgetRange: "20k-50k",
    product: { name: "星河戒指" },
    items: [],
  });
  assert.equal(selection.type, "selection");
  assert.equal(selection.leadId, 42);
  assert.deepEqual(selection.items, [
    { productNameSnapshot: "云水手镯" },
    { productNameSnapshot: "流光项链" },
  ]);
  assert.deepEqual(calls, [41, 42].map((id) => ({
    where: { id, customerId: 42 },
    select: CUSTOMER_CONSULTATION_DETAIL_SELECT,
  })));
});

test("定向咨询对他人记录、不存在记录和非正整数统一返回 404", async () => {
  const calls: unknown[] = [];
  const prisma = {
    lead: {
      findFirst: async (args: unknown) => {
        calls.push(args);
        return null;
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

  await assert.rejects(service.getConsultation(7, 41), NotFoundException);
  await assert.rejects(service.getConsultation(42, 999), NotFoundException);
  await assert.rejects(service.getConsultation(42, 0), NotFoundException);
  assert.deepEqual(calls, [
    { where: { id: 41, customerId: 7 }, select: CUSTOMER_CONSULTATION_DETAIL_SELECT },
    { where: { id: 999, customerId: 42 }, select: CUSTOMER_CONSULTATION_DETAIL_SELECT },
  ]);
});

test("客户咨询空结果保持可用且不会退化为无条件查询", async () => {
  const queriedCustomerIds: number[] = [];
  const prisma = {
    inquiry: {
      findMany: async ({ where }: { where: { customerId: number } }) => {
        queriedCustomerIds.push(where.customerId);
        return [];
      },
      count: async ({ where }: { where: { customerId: number } }) => {
        queriedCustomerIds.push(where.customerId);
        return 0;
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

  assert.deepEqual(await service.getInquiries(99), {
    list: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  assert.deepEqual(queriedCustomerIds, [99, 99]);
});

test("客户数据导出沿用独立显式 allowlist 且只查询本人咨询", async () => {
  let inquiryArgs: unknown;
  let selectionArgs: unknown;
  const emptyFindMany = { findMany: async () => [] };
  const prisma = {
    customer: { findUnique: async () => null },
    customerAddress: emptyFindMany,
    order: emptyFindMany,
    inquiry: {
      findMany: async (args: unknown) => {
        inquiryArgs = args;
        return [];
      },
    },
    selectionInquiry: {
      findMany: async (args: unknown) => {
        selectionArgs = args;
        return [];
      },
    },
    customerFavorite: emptyFindMany,
    productReview: emptyFindMany,
    notification: emptyFindMany,
  };
  const service = new CustomersService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  await service.exportMyData(42);

  assert.deepEqual(inquiryArgs, {
    where: { customerId: 42 },
    select: CUSTOMER_INQUIRY_EXPORT_SELECT,
  });
  assert.deepEqual(selectionArgs, {
    where: { customerId: 42 },
    select: CUSTOMER_SELECTION_INQUIRY_EXPORT_SELECT,
  });
  assert.deepEqual(Object.keys(CUSTOMER_INQUIRY_EXPORT_SELECT), [
    "message",
    "reply",
    "status",
    "createdAt",
  ]);
  assert.deepEqual(Object.keys(CUSTOMER_SELECTION_INQUIRY_EXPORT_SELECT), [
    "message",
    "status",
    "createdAt",
  ]);
});

test("两类客户咨询查询均由 CustomerAuthGuard 拒绝未认证请求", async () => {
  const guardsOn = (
    methodName: "getInquiries" | "getSelectionInquiries" | "getConsultation" | "exportMyData",
  ) =>
    Reflect.getMetadata(
      GUARDS_METADATA,
      CustomersController.prototype[methodName],
    ) ?? [];
  assert.deepEqual(guardsOn("getInquiries"), [CustomerAuthGuard]);
  assert.deepEqual(guardsOn("getSelectionInquiries"), [CustomerAuthGuard]);
  assert.deepEqual(guardsOn("getConsultation"), [CustomerAuthGuard]);
  assert.deepEqual(guardsOn("exportMyData"), [CustomerAuthGuard]);

  const guard = new CustomerAuthGuard({} as any, {} as any);
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, cookies: {} }),
    }),
  };
  await assert.rejects(
    () => guard.canActivate(context as any),
    UnauthorizedException,
  );
});
