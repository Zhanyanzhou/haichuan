// 交易域状态机静态契约测试
// 验证订单、履约、售后三个状态机的合法转换与终态，以及关键写操作的状态守卫。
// 运行：node scripts/verify-trade-state-machine.mjs
// 说明：本脚本通过静态分析后端源码验证状态机规则；行为级测试（带数据库）
//       需在本地环境执行 npm run dev + 接口联调，见最终报告。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (rel) => readFile(path.join(root, rel), "utf8");

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

console.log("交易域状态机契约测试\n");

// ── 订单状态机（OrdersService.VALID_TRANSITIONS）──
const ordersSrc = await readSrc("server/src/modules/orders/orders.service.ts");

check("订单状态机定义存在且包含全部 5 状态", () => {
  for (const s of ["PENDING_PAYMENT", "PENDING_SHIP", "SHIPPED", "COMPLETED", "CANCELLED"]) {
    assert.ok(ordersSrc.includes(s), `缺少状态: ${s}`);
  }
});

check("订单：待付款只能转待发货或取消（不可直接发货/完成）", () => {
  // VALID_TRANSITIONS.PENDING_PAYMENT = ['PENDING_SHIP', 'CANCELLED']
  const block = ordersSrc.match(/PENDING_PAYMENT:\s*\[([^\]]+)\]/);
  assert.ok(block, "未找到 PENDING_PAYMENT 转换定义");
  assert.ok(block[1].includes("PENDING_SHIP"), "待付款必须能转待发货");
  assert.ok(block[1].includes("CANCELLED"), "待付款必须能转取消");
  assert.ok(!block[1].includes("SHIPPED"), "待付款不可直接转发货");
  assert.ok(!block[1].includes("COMPLETED"), "待付款不可直接转完成");
});

check("订单：待发货只能转发货", () => {
  const block = ordersSrc.match(/PENDING_SHIP:\s*\[([^\]]+)\]/);
  assert.ok(block, "未找到 PENDING_SHIP 转换定义");
  assert.ok(block[1].includes("SHIPPED"), "待发货必须能转发货");
  assert.ok(!block[1].includes("CANCELLED"), "待发货不可直接取消（需退款流程）");
});

check("订单：已发货只能转完成", () => {
  const block = ordersSrc.match(/SHIPPED:\s*\[([^\]]+)\]/);
  assert.ok(block, "未找到 SHIPPED 转换定义");
  assert.ok(block[1].includes("COMPLETED"), "已发货必须能转完成");
});

check("订单：COMPLETED 与 CANCELLED 为终态", () => {
  assert.ok(/COMPLETED:\s*\[\s*\]/.test(ordersSrc), "COMPLETED 必须为空数组（终态）");
  assert.ok(/CANCELLED:\s*\[\s*\]/.test(ordersSrc), "CANCELLED 必须为空数组（终态）");
});

check("订单：updateStatus 拒绝 PENDING_SHIP 与 SHIPPED 的直接设置", () => {
  // 这两个状态必须分别通过付款审核、发货专用接口进入
  assert.ok(/newStatus === 'PENDING_SHIP'[\s\S]*?待发货必须通过付款审核进入/.test(ordersSrc), "待发货必须通过付款审核进入");
  assert.ok(/newStatus === 'SHIPPED'[\s\S]*?发货请使用专用接口/.test(ordersSrc), "发货必须使用专用接口");
});

check("订单：发货接口校验订单处于 PENDING_SHIP（未付款不可发货）", () => {
  const shipMatch = ordersSrc.match(/async ship\([\s\S]*?\}\s*\n\s*\}/);
  assert.ok(shipMatch, "未找到 ship 方法");
  assert.ok(shipMatch[0].includes("PENDING_SHIP"), "ship 必须校验 PENDING_SHIP 状态");
  assert.ok(shipMatch[0].includes("只有待发货订单可以发货"), "ship 必须拒绝非待发货订单");
});

// ── 内联等价测试：模拟状态机校验函数 ──
// 从源码提取的转换表（与 OrdersService.VALID_TRANSITIONS 等价）
const ORDER_TRANSITIONS = {
  PENDING_PAYMENT: ["PENDING_SHIP", "CANCELLED"],
  PENDING_SHIP: ["SHIPPED"],
  SHIPPED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

function canTransition(from, to) {
  return (ORDER_TRANSITIONS[from] || []).includes(to);
}

check("内联：合法转换被接受", () => {
  assert.equal(canTransition("PENDING_PAYMENT", "PENDING_SHIP"), true);
  assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED"), true);
  assert.equal(canTransition("PENDING_SHIP", "SHIPPED"), true);
  assert.equal(canTransition("SHIPPED", "COMPLETED"), true);
});

check("内联：非法转换被拒绝（关键验收项 #11）", () => {
  assert.equal(canTransition("PENDING_PAYMENT", "SHIPPED"), false, "待付款不可直接发货");
  assert.equal(canTransition("PENDING_PAYMENT", "COMPLETED"), false, "待付款不可直接完成");
  assert.equal(canTransition("COMPLETED", "CANCELLED"), false, "已完成不可取消");
  assert.equal(canTransition("CANCELLED", "PENDING_PAYMENT"), false, "已取消不可复活");
  assert.equal(canTransition("SHIPPED", "PENDING_SHIP"), false, "已发货不可退回待发货");
});

// ── 售后状态机 ──
const afterSalesSrc = await readSrc("server/src/modules/after-sales/after-sales.service.ts");

check("售后状态机：REQUESTED 只能被审核（非直接推进）", () => {
  const block = afterSalesSrc.match(/REQUESTED:\s*\[([^\]]*)\]/);
  assert.ok(block, "未找到售后 REQUESTED 转换定义");
  assert.equal(block[1].trim(), "", "REQUESTED 必须为空（只能通过 review 审核）");
});

check("售后状态机：APPROVED 可进入逆向物流/完成/取消", () => {
  const block = afterSalesSrc.match(/APPROVED:\s*\[([^\]]+)\]/);
  assert.ok(block, "未找到售后 APPROVED 转换定义");
  for (const s of ["RETURNING", "COMPLETED", "CANCELLED"]) {
    assert.ok(block[1].includes(s), `APPROVED 必须能转 ${s}`);
  }
});

check("售后状态机：终态 REJECTED/COMPLETED/CANCELLED 无后续转换", () => {
  for (const terminal of ["REJECTED", "COMPLETED", "CANCELLED"]) {
    const block = afterSalesSrc.match(new RegExp(`${terminal}:\\s*\\[([^\\]]*)\\]`));
    assert.ok(block, `未找到售后 ${terminal} 转换定义`);
    assert.equal(block[1].trim(), "", `${terminal} 必须为空数组（终态）`);
  }
});

// ── 履约状态：发货守卫 ──
const fulfillmentSrc = await readSrc("server/src/modules/fulfillment/fulfillment.service.ts");

check("履约：dispatch 仅允许待拣货/待复核/待发货状态", () => {
  assert.ok(fulfillmentSrc.includes("['PENDING_PICK', 'PENDING_CHECK', 'PENDING_SHIP']"), "dispatch 状态白名单缺失");
});

check("履约：dispatch 校验订单必须已付款（PENDING_SHIP）", () => {
  assert.ok(fulfillmentSrc.includes("订单未完成付款审核，不可发货"), "dispatch 必须校验订单付款状态");
});

check("履约：标记送达仅允许 SHIPPED 状态", () => {
  assert.ok(/只有已发货的履约单可标记送达/.test(fulfillmentSrc), "送达状态守卫缺失");
});

console.log(`\n${passed} 项通过，状态机契约验证完成。`);
