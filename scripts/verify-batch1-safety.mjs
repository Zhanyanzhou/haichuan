import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const productsService = read("server/src/modules/products/products.service.ts");
assert.match(productsService, /status:\s*status \?\? "DRAFT"/);
assert.match(productsService, /visibility:\s*visibility \?\? "MEMBER"/);
const createBody = productsService.slice(
  productsService.indexOf("  async create(dto: CreateProductDto)"),
  productsService.indexOf("  /** 上架门禁"),
);
assert.match(createBody, /data\.status === "PUBLISHED"/);
assert.match(createBody, /await this\.canPublish\(created\.id, tx\)/);

const productEditor = read("client/src/pages/admin/ProductEditor/index.tsx");
assert.match(productEditor, /initialValues=\{\{ status: "DRAFT", salesMode: "DISPLAY_ONLY", visibility: "MEMBER"/);

const usersController = read("server/src/modules/users/users.controller.ts");
assert.match(
  usersController,
  /@Get\(['"]assignable['"]\)[\s\S]*?@Roles\([\s\S]*?['"]CUSTOMER_SERVICE['"][\s\S]*?findAssignable/,
);

const usersService = read("server/src/modules/users/users.service.ts");
assert.match(usersService, /UnprocessableEntityException/);
assert.match(usersService, /role:\s*['"]SUPER_ADMIN['"],\s*status:\s*['"]ACTIVE['"]/);

const leadManage = read("client/src/pages/admin/LeadManage/index.tsx");
assert.match(leadManage, /role === "CUSTOMER_SERVICE"/);
assert.match(leadManage, /api\.get\("\/users\/assignable"/);
assert.match(leadManage, /人员列表加载失败/);

const customersController = read("server/src/modules/customers/customers.controller.ts");
for (const dto of [
  "CustomerRegisterDto",
  "CustomerLoginDto",
  "ForgotPasswordDto",
  "ResetPasswordDto",
  "RequestSmsCodeDto",
  "UpdateCustomerProfileDto",
  "CloseCustomerAccountDto",
]) {
  assert.match(customersController, new RegExp(`@Body\\(\\) (?:body|dto): ${dto}`));
}

const customerDtos = read("server/src/modules/customers/dto/customer-auth.dto.ts");
assert.match(customerDtos, /\^1\[3-9\]\\d\{9\}\$/);
assert.match(customerDtos, /@MinLength\(8/);
assert.ok(customerDtos.includes("@Matches(/^(?=.*[A-Za-z])(?=.*\\d).+$/"));

console.log("Batch 1 safety assertions passed.");
