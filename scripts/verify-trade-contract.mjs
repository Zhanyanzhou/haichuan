// 交易域关键链路跨层静态契约测试
// 验证：前端类型/API/路由权限与后端 DTO/Controller/角色一致；
//       客户认证旁通、下单入口职责、结算契约对齐、DIRECT_PURCHASE 校验。
// 运行：node scripts/verify-trade-contract.mjs

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (rel) => readFile(path.join(root, rel), "utf8");

async function readExportedTypeSurface(entry, visited = new Set()) {
  const normalized = entry.replaceAll("\\", "/");
  if (visited.has(normalized)) return "";
  visited.add(normalized);
  const source = await readSrc(normalized);
  const chunks = [source];
  for (const match of source.matchAll(
    /export\s+(?:type\s+)?\*\s+from\s+["'](\.[^"']+)["']/g,
  )) {
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(normalized), `${match[1]}.ts`),
    );
    chunks.push(await readExportedTypeSurface(target, visited));
  }
  return chunks.join("\n");
}

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("交易域跨层静态契约测试\n");

// ── 客户认证旁通（验收项 #1/#2：登录客户可下单，未登录不可）──
const customersController = await readSrc(
  "server/src/modules/customers/customers.controller.ts",
);
const customersService = await readSrc(
  "server/src/modules/customers/customers.service.ts",
);
const customerApi = await readSrc("client/src/services/api.ts");
const customerAfterSalesController = await readSrc(
  "server/src/modules/after-sales/customer-after-sales.controller.ts",
);
const afterSalesDto = await readSrc(
  "server/src/modules/after-sales/dto/after-sales.dto.ts",
);
const afterSalesService = await readSrc(
  "server/src/modules/after-sales/after-sales.service.ts",
);
const uploadController = await readSrc(
  "server/src/modules/upload/upload.controller.ts",
);
const uploadService = await readSrc(
  "server/src/modules/upload/upload.service.ts",
);
const uploadModule = await readSrc(
  "server/src/modules/upload/upload.module.ts",
);
const nginxConfig = await readSrc("client/nginx.conf");
const composeConfig = await readSrc("docker-compose.yml");

check(
  "客户接口：所有 CustomerAuthGuard 端点均有 @Public()（绕过全局 JwtAuthGuard）",
  () => {
    // 每个含 CustomerAuthGuard 的方法前必须有 @Public()
    const methodsWithGuard =
      customersController.match(/@UseGuards\([^)]*CustomerAuthGuard[^)]*\)/g) ||
      [];
    const publicGuardedBlocks =
      customersController.match(
        /@Public\(\)\s*@UseGuards\([^)]*CustomerAuthGuard[^)]*\)/g,
      ) || [];
    assert.ok(
      methodsWithGuard.length >= 11,
      `CustomerAuthGuard 端点应≥11 个，实际 ${methodsWithGuard.length}`,
    );
    assert.equal(
      publicGuardedBlocks.length,
      methodsWithGuard.length,
      `@Public() 必须紧邻覆盖所有 CustomerAuthGuard 端点（已覆盖 ${publicGuardedBlocks.length}/${methodsWithGuard.length}）`,
    );
  },
);

check("结算接口：使用 CustomerAuthGuard（登录客户才能下单）", () => {
  const checkoutBlock = customersController.match(
    /@Public\(\)\s*@UseGuards\([^)]*CustomerAuthGuard[^)]*\)[\s\S]*?@Post\(['"]checkout['"]\)[\s\S]*?checkout\(/,
  );
  assert.ok(checkoutBlock, "未找到 checkout 路由");
  assert.ok(
    checkoutBlock[0].includes("CustomerAuthGuard"),
    "checkout 必须用 CustomerAuthGuard",
  );
  assert.ok(
    checkoutBlock[0].includes("@Public()"),
    "checkout 必须有 @Public()",
  );
});

check("客户账户：订单号不可兑换访问令牌", () => {
  assert.ok(
    !customersController.includes("@Post('order-access')"),
    "不得暴露 order-access 接口",
  );
  assert.ok(
    !customersService.includes("accessByOrder"),
    "订单号不可用于签发客户访问令牌",
  );
  assert.ok(
    !customerApi.includes("accessByOrder"),
    "前端不可调用订单号访问接口",
  );
});

check("客户售后：本人认证入口与后台售后入口隔离", () => {
  assert.ok(
    customerAfterSalesController.includes("@UseGuards(CustomerAuthGuard)"),
    "客户售后必须使用 CustomerAuthGuard",
  );
  assert.ok(
    customerAfterSalesController.includes("@Public()"),
    "客户售后必须绕过后台全局 JWT 后再执行客户认证",
  );
  assert.ok(
    !customerAfterSalesController.includes("CustomerCommerceGuard"),
    "交易暂停时仍应允许客户查看并处理历史售后",
  );
});

check("客户售后：DTO 只接收订单商品、类型和原因", () => {
  const customerDto = afterSalesDto.match(
    /export class CreateCustomerAfterSalesDto \{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(customerDto, "缺少 CreateCustomerAfterSalesDto");
  for (const field of ["orderItemId", "type", "reason"]) {
    assert.ok(customerDto.includes(field), `客户售后 DTO 缺少 ${field}`);
  }
  for (const field of [
    "customerId",
    "requestedRefundAmount",
    "evidenceUrls",
    "adminNote",
  ]) {
    assert.ok(!customerDto.includes(field), `客户售后 DTO 不可含 ${field}`);
  }
});

check("客户售后：服务端校验归属、商品、状态并串行化重复申请", () => {
  assert.ok(afterSalesService.includes("await this.lockOrder(tx, orderId)"));
  assert.ok(afterSalesService.includes("where: { id: orderId, customerId }"));
  assert.ok(afterSalesService.includes("item.id === data.orderItemId"));
  assert.ok(afterSalesService.includes("ACTIVE_AFTER_SALES_STATUSES"));
  assert.ok(afterSalesService.includes("requestedRefundAmount: null"));
});

check("付款凭证：新上传文件使用私有存储且读取需要鉴权", () => {
  const paymentProofUpload = uploadController.match(
    /@Post\('payment-proof'\)[\s\S]*?async uploadPaymentProof[\s\S]*?\n  \}/,
  );
  assert.ok(
    paymentProofUpload?.[0].includes("uploadPrivatePaymentProof"),
    "付款凭证上传必须进入私有存储方法",
  );
  assert.ok(
    uploadController.includes("@Get('payment-proofs/:orderId')"),
    "客户读取付款凭证必须经过受保护接口",
  );
  assert.ok(
    uploadService.includes("private-media', 'payment-proofs"),
    "付款凭证不可保存到公开 uploads 目录",
  );
  assert.ok(
    !paymentProofUpload?.[0].includes("uploadFile(file)"),
    "付款凭证不可复用公开上传接口",
  );
});

check("静态上传文件：缺失资源不触发 SPA 回退", () => {
  assert.ok(
    uploadModule.includes(
      "renderPath: '/__uploads_static_fallback_disabled__'",
    ),
    "uploads 静态映射必须禁用默认 index.html 回退",
  );
});

check("受控图片：CSP 允许 Blob URL，且范围限定在 img-src", () => {
  const csp = nginxConfig.match(/Content-Security-Policy\s+"([^"]+)"/);
  assert.ok(csp, "未找到 Nginx CSP 配置");
  const imgSource = csp[1].match(/img-src\s+([^;]+)/)?.[1] || "";
  assert.ok(
    /\bblob:/.test(imgSource),
    "受控图片使用 Blob URL，img-src 必须允许 blob:",
  );
  assert.ok(
    !/script-src\s+[^;]*\bblob:/.test(csp[1]),
    "script-src 不可放宽 blob:",
  );
});

check("Redis：已移除（OR 批决策，服务端零消费方）", () => {
  assert.ok(
    !/^\s*redis:\s*$/m.test(composeConfig),
    "Compose 不应再定义 redis 服务（queue 已删，无消费方）",
  );
  assert.ok(
    !composeConfig.includes("REDIS_URL"),
    "Compose 不应再拼接 Redis 连接地址",
  );
  assert.ok(
    !composeConfig.includes("REDIS_PASSWORD"),
    "Compose 不应再传递 Redis 密码",
  );
});

// ── 结算契约对齐（验收项 #3）──
const checkoutDto = await readSrc(
  "server/src/modules/customers/dto/checkout.dto.ts",
);
check(
  "结算 DTO：不收集 customerName/customerPhone/paymentMethod（后端从登录态取）",
  () => {
    assert.ok(
      !/customerName/.test(checkoutDto),
      "CheckoutDto 不可含 customerName",
    );
    assert.ok(
      !/customerPhone/.test(checkoutDto),
      "CheckoutDto 不可含 customerPhone",
    );
    assert.ok(
      !/paymentMethod/.test(checkoutDto),
      "CheckoutDto 不可含 paymentMethod",
    );
    assert.ok(checkoutDto.includes("address"), "CheckoutDto 必须含 address");
    assert.ok(checkoutDto.includes("items"), "CheckoutDto 必须含 items");
  },
);

const checkoutPage = await readSrc(
  "client/src/pages/public/Checkout/index.tsx",
);
check("结算页：前端不再提交后端忽略的 customerName/phone/paymentMethod", () => {
  // checkout 调用仅传 address/customerEmail/items
  const callMatch = checkoutPage.match(/customerApi\.checkout\(\{[\s\S]*?\}\)/);
  assert.ok(callMatch, "未找到 checkout 调用");
  assert.ok(callMatch[0].includes("address"), "前端必须提交 address");
  assert.ok(callMatch[0].includes("items"), "前端必须提交 items");
  assert.ok(
    !/values\.customerName/.test(checkoutPage),
    "前端不应传 customerName",
  );
});

// ── 下单入口职责（验收项 #4 前置：DIRECT_PURCHASE 校验）──
const ordersService = await readSrc(
  "server/src/modules/orders/orders.service.ts",
);
const productEligibility = await readSrc(
  "server/src/modules/products/product-eligibility.ts",
);
const directPurchaseBaseWhereBlock = productEligibility.match(
  /export function directPurchaseProductBaseWhere\(\): Prisma\.ProductWhereInput \{[\s\S]*?\n\}/,
)?.[0];
const directPurchaseCreateBlock = ordersService.match(
  /async create\(data:[\s\S]*?\n  async createFromQuotation/,
)?.[0];

check("下单：仅 DIRECT_PURCHASE 商品可下单（非直接购买被拒绝）", () => {
  assert.ok(
    ordersService.includes("directPurchaseProductBaseWhere") &&
      ordersService.includes("directPurchaseProductWhere"),
    "订单服务必须使用共享的直接购买商品门禁",
  );
  assert.ok(
    directPurchaseBaseWhereBlock &&
      /salesMode:\s*['"]DIRECT_PURCHASE['"]/.test(directPurchaseBaseWhereBlock),
    "必须校验 salesMode=DIRECT_PURCHASE",
  );
  assert.ok(
    /订单中包含不可直接购买的商品/.test(ordersService),
    "非 DIRECT_PURCHASE 必须有明确拒绝提示",
  );
});

check("下单：商品必须 PUBLISHED 且未软删除", () => {
  assert.ok(
    directPurchaseBaseWhereBlock &&
      /status:\s*['"]PUBLISHED['"]/.test(directPurchaseBaseWhereBlock),
    "必须校验商品 PUBLISHED",
  );
  assert.ok(
    directPurchaseBaseWhereBlock?.includes("deletedAt: null"),
    "必须过滤软删除商品",
  );
});

check("下单：SKU 必须 isActive", () => {
  assert.ok(ordersService.includes("isActive: true"), "必须校验 SKU isActive");
});

check("下单：库存不足时拒绝（无超卖）", () => {
  assert.ok(
    ordersService.includes("availableStock < quantity"),
    "必须校验库存充足",
  );
  assert.ok(/库存不足/.test(ordersService), "库存不足必须有明确提示");
});

check("固定价直购：成交价只认 SKU.price 且不读取金价", () => {
  assert.ok(directPurchaseCreateBlock, "未找到标准零售 create 方法");
  assert.ok(directPurchaseCreateBlock.includes("Number(sku.price)"), "固定价必须读取 ProductSKU.price");
  assert.ok(!directPurchaseCreateBlock.includes("goldPrice"), "固定价直购不得依赖金价查询");
  assert.ok(directPurchaseCreateBlock.includes("lockedGoldPrice: null"), "固定价订单不得伪造金价锁定语义");
});

// ── 双下单入口职责（DECISIONS D.7）──
const ordersController = await readSrc(
  "server/src/modules/orders/orders.controller.ts",
);
const manualCreateBlock = ordersController.match(
  /@ApiBearerAuth\(\)\s*@Roles\("SUPER_ADMIN", "ADMIN"\)\s*@Post\(\)[\s\S]*?create\(/,
);

check("后台建单：POST /orders 标注为非公开（后台人工建单）", () => {
  assert.ok(
    /后台人工建单|非公开/.test(ordersController),
    "POST /orders 必须标注为后台人工建单、非公开",
  );
  assert.ok(manualCreateBlock, "未找到后台建单路由");
  assert.ok(
    !manualCreateBlock[0].includes("@Public()"),
    "POST /orders 不可标注 @Public()",
  );
});

check("后台建单：POST /orders 限 SUPER_ADMIN/ADMIN（不含 EDITOR）", () => {
  assert.ok(manualCreateBlock, "未找到 create 路由");
  assert.ok(manualCreateBlock[0].includes("@Roles"), "create 必须有 @Roles");
  assert.ok(
    manualCreateBlock[0].includes("SUPER_ADMIN") &&
      manualCreateBlock[0].includes("ADMIN"),
    "create 限 SUPER_ADMIN/ADMIN",
  );
  assert.ok(
    !/@Roles\([^)]*EDITOR/.test(manualCreateBlock[0]),
    "create 不可含 EDITOR",
  );
});

// ── 角色权限一致性（验收项 #14）──
check("订单/付款控制器：EDITOR 无交易写权限", () => {
  // 类级 @Roles 含 EDITOR 吗？查看是否有方法级覆盖
  // OrdersController 类级应含 CUSTOMER_SERVICE/WAREHOUSE，不含 EDITOR
  const classRoles = ordersController.match(
    /@Roles\(([^)]+)\)[\s\S]*?@Controller\(['"]orders['"]\)/,
  );
  assert.ok(classRoles, "未找到 OrdersController 类级 @Roles");
  assert.ok(
    !classRoles[1].includes("EDITOR"),
    "OrdersController 类级 @Roles 不可含 EDITOR",
  );
});

const paymentsController = await readSrc(
  "server/src/modules/payments/payments.controller.ts",
);
check("付款控制器：查看含 CUSTOMER_SERVICE，审核限 ADMIN，不含 EDITOR", () => {
  const paymentRoles = paymentsController.match(/@Roles\(([^)]*)\)/g) || [];
  assert.ok(
    paymentRoles.some((roles) => roles.includes("CUSTOMER_SERVICE")),
    "付款查看应含 CUSTOMER_SERVICE",
  );
  assert.ok(
    paymentRoles.every((roles) => !roles.includes("EDITOR")),
    "付款控制器不可含 EDITOR",
  );
  // approve/reject 限 SUPER_ADMIN/ADMIN
  const approveMatch = paymentsController.match(
    /@Put\(['"]:id\/approve['"]\)[\s\S]*?approve\(/,
  );
  assert.ok(
    approveMatch && approveMatch[0].includes("SUPER_ADMIN"),
    "approve 必须限 SUPER_ADMIN/ADMIN",
  );
});

const routeAccess = await readSrc("client/src/config/adminRouteAccess.ts");
check("前端路由：/admin/orders 含 CS/WAREHOUSE，不含 EDITOR", () => {
  const orderRule = routeAccess.match(
    /prefix:\s*["']\/admin\/orders["'],\s*roles:\s*(\w+)/,
  );
  assert.ok(orderRule, "未找到 /admin/orders 路由规则");
  const roleSource = routeAccess.match(
    new RegExp(`const ${orderRule[1]}:[^=]*=\\s*\\[([^\\]]*)\\]`),
  );
  assert.ok(roleSource, "/admin/orders 路由角色常量未定义");
  assert.ok(
    roleSource[1].includes("CUSTOMER_SERVICE"),
    "/admin/orders 应含 CUSTOMER_SERVICE",
  );
  assert.ok(
    roleSource[1].includes("WAREHOUSE"),
    "/admin/orders 应含 WAREHOUSE",
  );
  assert.ok(!roleSource[1].includes("EDITOR"), "/admin/orders 不可含 EDITOR");
});

check("前端路由：交易域子页面路由已定义", () => {
  for (const prefix of [
    "/admin/trade/payments",
    "/admin/trade/fulfillment",
    "/admin/trade/refunds",
    "/admin/trade/after-sales",
  ]) {
    assert.ok(routeAccess.includes(prefix), `缺少路由规则: ${prefix}`);
  }
});

// ── TradeEvent 审计（验收项：交易写操作有事件记录）──
check("交易事件：orders.service 在关键写操作记录 TradeEvent", () => {
  for (const ev of [
    "ORDER_CREATED",
    "STOCK_RESERVED",
    "PAYMENT_APPROVED",
    "ORDER_CANCELLED",
    "SHIPMENT_DISPATCHED",
    "STOCK_RELEASED",
  ]) {
    assert.ok(ordersService.includes(ev), `OrdersService 必须记录 ${ev} 事件`);
  }
});

const tradeEventsConstants = await readSrc(
  "server/src/modules/trade-events/trade-events.constants.ts",
);
check("交易事件：常量文件包含全部 14 种必需事件", () => {
  const required = [
    "ORDER_CREATED",
    "STOCK_RESERVED",
    "STOCK_RELEASED",
    "PAYMENT_PROOF_SUBMITTED",
    "PAYMENT_APPROVED",
    "PAYMENT_REJECTED",
    "FULFILLMENT_CREATED",
    "SHIPMENT_DISPATCHED",
    "ORDER_COMPLETED",
    "AFTER_SALES_REQUESTED",
    "AFTER_SALES_APPROVED",
    "REFUND_REQUESTED",
    "REFUND_APPROVED",
    "REFUND_COMPLETED",
  ];
  for (const ev of required) {
    assert.ok(tradeEventsConstants.includes(ev), `缺少必需事件类型: ${ev}`);
  }
});

// ── 前端 API 与类型覆盖 ──
const apiSrc = await readSrc("client/src/services/api.ts");
check(
  "前端 API：交易域四套 API 已接入（fulfillment/refund/afterSales + payment）",
  () => {
    assert.ok(apiSrc.includes("fulfillmentApi"), "缺少 fulfillmentApi");
    assert.ok(apiSrc.includes("refundApi"), "缺少 refundApi");
    assert.ok(apiSrc.includes("afterSalesApi"), "缺少 afterSalesApi");
    assert.ok(apiSrc.includes("createAfterSales"), "缺少客户售后申请 API");
    assert.ok(apiSrc.includes("cancelAfterSales"), "缺少客户售后撤销 API");
    const orderApiBlock = apiSrc.match(
      /export const orderApi\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(orderApiBlock?.[0].includes("exportList"), "缺少订单导出 API");
  },
);

const typesSrc = await readExportedTypeSurface("client/src/types/index.ts");
check("前端类型：交易域扩展类型已定义", () => {
  for (const t of [
    "TradeEvent",
    "Fulfillment",
    "FulfillmentStatus",
    "Refund",
    "RefundStatus",
    "AfterSalesCase",
    "AfterSalesType",
    "AfterSalesStatus",
  ]) {
    assert.ok(typesSrc.includes(t), `缺少前端类型: ${t}`);
  }
});

// ── Schema 完整性 ──
const schemaSrc = await readSrc("server/prisma/schema.prisma");
check("Prisma Schema：包含交易域新模型", () => {
  assert.ok(schemaSrc.includes("model TradeEvent {"), "缺少 TradeEvent 模型");
  assert.ok(schemaSrc.includes("model Fulfillment {"), "缺少 Fulfillment 模型");
  assert.ok(
    schemaSrc.includes("model AfterSalesCase {"),
    "缺少 AfterSalesCase 模型",
  );
  assert.ok(
    schemaSrc.includes("enum FulfillmentStatus {"),
    "缺少 FulfillmentStatus 枚举",
  );
  assert.ok(
    schemaSrc.includes("enum AfterSalesStatus {"),
    "缺少 AfterSalesStatus 枚举",
  );
});

check("Prisma Schema：Refund 已扩展审核/幂等字段", () => {
  const refundBlock = schemaSrc.match(/model Refund \{[\s\S]*?\}/);
  assert.ok(refundBlock, "缺少 Refund 模型");
  for (const f of [
    "requestedBy",
    "reviewedBy",
    "processedBy",
    "idempotencyKey",
    "completedAt",
  ]) {
    assert.ok(refundBlock[0].includes(f), `Refund 缺少字段: ${f}`);
  }
});

check(
  "Prisma Schema：Order 关联 tradeEvents/fulfillments/afterSalesCases",
  () => {
    const orderBlock = schemaSrc.match(
      /model Order \{[\s\S]*?@@map\(["']orders["']\)/,
    );
    assert.ok(orderBlock, "缺少 Order 模型");
    assert.ok(
      orderBlock[0].includes("tradeEvents"),
      "Order 缺少 tradeEvents 关联",
    );
    assert.ok(
      orderBlock[0].includes("fulfillments"),
      "Order 缺少 fulfillments 关联",
    );
    assert.ok(
      orderBlock[0].includes("afterSalesCases"),
      "Order 缺少 afterSalesCases 关联",
    );
  },
);

console.log(`\n${passed} 项通过，跨层静态契约验证完成。`);
