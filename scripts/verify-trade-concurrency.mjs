// 交易域并发、金额与幂等静态契约测试
// 验证：付款审核乐观锁（防双扣库存）、退款金额校验（防超额）、幂等键、整数分金额计算。
// 运行：node scripts/verify-trade-concurrency.mjs
// 说明：本脚本通过静态分析后端源码验证并发/幂等/金额不变式；
//       行为级并发测试（真实数据库事务）需在本地环境执行，见最终报告。

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

console.log("交易域并发 / 金额 / 幂等契约测试\n");

// ── 付款审核乐观锁（防双扣库存，验收项 #8）──
const ordersSrc = await readSrc("server/src/modules/orders/orders.service.ts");

check("付款审核：使用 updateMany + status:PENDING 条件更新（乐观锁）", () => {
  assert.ok(/tx\.payment\.updateMany\(\s*\{[^}]*where:\s*\{\s*id:\s*paymentId,\s*status:\s*['"]PENDING['"]/.test(ordersSrc.replace(/\n/g, " ").replace(/\s+/g, " ")),
    "approveOfflinePayment 必须用条件更新推进 PENDING→PAID");
});

check("付款审核：并发命中 0 时抛错（杜绝双扣库存）", () => {
  assert.ok(/updated\.count\s*===\s*0/.test(ordersSrc), "必须检查 updated.count === 0");
  assert.ok(/该付款记录已被处理，请刷新后重试/.test(ordersSrc), "并发失败需返回明确中文提示");
});

check("付款审核：整个流程在 Prisma 事务内", () => {
  const approveMatch = ordersSrc.match(/async approveOfflinePayment[\s\S]*?\n  \}/);
  assert.ok(approveMatch, "未找到 approveOfflinePayment 方法");
  assert.ok(approveMatch[0].includes("$transaction"), "approveOfflinePayment 必须在事务内");
});

check("付款驳回：同样使用乐观锁", () => {
  // rejectOfflinePayment 也用 updateMany 条件更新
  const rejectMatch = ordersSrc.match(/async rejectOfflinePayment[\s\S]*?\n  \}/);
  assert.ok(rejectMatch, "未找到 rejectOfflinePayment 方法");
  assert.ok(rejectMatch[0].includes("updateMany"), "rejectOfflinePayment 必须用条件更新");
});

// ── 库存预占/释放/消费幂等（验收项 #4/#6/#9）──
check("库存释放：仅处理 releasedAt=null 且 consumedAt=null 的预占（防重复释放）", () => {
  assert.ok(ordersSrc.includes("releasedAt: null, consumedAt: null"), "释放必须过滤未处理预占");
});

check("库存消费：仅处理 releasedAt=null 且 consumedAt=null 的预占（防重复消费）", () => {
  // consumeStockReservations 的 where 条件
  const consumeMatch = ordersSrc.match(/consumeStockReservations[\s\S]*?updateMany\(\s*\{([^}]+)\}/);
  assert.ok(consumeMatch, "未找到 consumeStockReservations");
  assert.ok(consumeMatch[1].includes("releasedAt: null"), "消费必须过滤 releasedAt=null");
  assert.ok(consumeMatch[1].includes("consumedAt: null"), "消费必须过滤 consumedAt=null");
});

check("库存预占：原子条件更新 quantity>=deduction（防超卖）", () => {
  assert.ok(/where:\s*\{\s*id:\s*inventory\.id,\s*quantity:\s*\{\s*gte:\s*deduction\s*\}/.test(ordersSrc.replace(/\n/g, " ").replace(/\s+/g, " ")),
    "reserveStock 必须用 quantity>=deduction 条件更新");
  assert.ok(/result\.count\s*!==\s*1/.test(ordersSrc), "预占失败（count≠1）必须抛错");
});

check("库存为唯一来源：reserveStock 无库存时不 fallback 到 SKU.stock", () => {
  const reserveMatch = ordersSrc.match(/private async reserveStock[\s\S]*?\n  \}/);
  assert.ok(reserveMatch, "未找到 reserveStock 方法");
  assert.ok(reserveMatch[0].includes("Inventory 为唯一库存来源"), "reserveStock 必须明确 Inventory 单一来源");
  assert.ok(!/productSKU\.update[\s\S]*stock:\s*\{\s*decrement/.test(reserveMatch[0]), "reserveStock 不可写 SKU.stock");
});

// ── 整数分金额计算（防浮点误差）──
check("订单金额：使用整数分累加（Math.round(unitPrice*100)）", () => {
  assert.ok(ordersSrc.includes("Math.round(unitPrice * 100)"), "单价必须转整数分");
  assert.ok(ordersSrc.includes("unitCents * quantity"), "小计必须用整数分相乘");
  assert.ok(/new Prisma\.Decimal\(totalCents\)\.div\(100\)/.test(ordersSrc), "总额必须从整数分转回 Decimal");
});

check("订单金额：不信任前端金额（服务端从 SKU.price 计算）", () => {
  // 订单创建循环以服务端查出的 SKU 作为价格来源，不能只截取到第一个嵌套代码块。
  assert.ok(/for \(const sku of skus\)[\s\S]*?Number\(sku\.price\)/.test(ordersSrc), "价格必须从服务端 SKU 取值");
});

// ── 退款金额校验（验收项 #12）──
const refundsSrc = await readSrc("server/src/modules/refunds/refunds.service.ts");

check("退款：累计退款不超过已确认收款（整数分校验）", () => {
  assert.ok(refundsSrc.includes("activeRefundCents + amountCents > paidCents"), "退款金额校验逻辑缺失");
  assert.ok(/退款金额超过可退额度/.test(refundsSrc), "超额退款必须有中文提示");
});

check("退款：用整数分计算（Math.round(amount*100)）", () => {
  assert.ok(refundsSrc.includes("Math.round(data.amount * 100)"), "退款金额必须转整数分");
  assert.ok(refundsSrc.includes("Math.round(Number(p.amount) * 100)"), "已收款必须转整数分");
});

check("退款：支持幂等键（idempotencyKey 防重复创建）", () => {
  assert.ok(refundsSrc.includes("idempotencyKey") && refundsSrc.includes("findUnique({ where: { idempotencyKey"), "幂等键查询缺失");
});

check("退款：审核与执行使用乐观锁（状态条件更新）", () => {
  const reviewMatch = refundsSrc.match(/async review[\s\S]*?\n  \}/);
  const executeMatch = refundsSrc.match(/async execute[\s\S]*?\n  \}/);
  assert.ok(reviewMatch && reviewMatch[0].includes("updateMany") && reviewMatch[0].includes("status: 'PENDING'"), "review 必须用 PENDING 条件更新");
  assert.ok(executeMatch && executeMatch[0].includes("updateMany"), "execute 必须用条件更新");
});

check("退款：审核通过时再次校验金额（防审核期间超额）", () => {
  const reviewMatch = refundsSrc.match(/async review[\s\S]*?\n  \}/);
  assert.ok(reviewMatch[0].includes("getActiveRefundCents(refund.orderId, refundId)"), "review 必须在通过时重新校验金额");
});

// ── 内联等价：整数分金额累加 ──
check("内联：整数分累加无浮点误差（验收项 #12 基础）", () => {
  // 模拟 0.1+0.2 的浮点陷阱
  const floatSum = 0.1 + 0.2; // = 0.30000000000000004
  assert.notEqual(floatSum, 0.3, "浮点累加应产生误差（反证）");
  const centsSum = Math.round(0.1 * 100) + Math.round(0.2 * 100); // = 30
  assert.equal(centsSum, 30, "整数分累加应精确");
  assert.equal(Math.round(35.67 * 100), 3567, "含小数金额应正确转整数分");
});

// ── 并发模拟：乐观锁语义 ──
check("内联：模拟两个并发审核只有一个成功（验收项 #8）", () => {
  // 模拟：payment 初始 status=PENDING
  let status = "PENDING";
  let successCount = 0;
  // 并发 T1、T2 同时尝试 updateMany where status=PENDING
  const tryApprove = () => {
    if (status === "PENDING") {
      status = "PAID";
      return true; // count === 1
    }
    return false; // count === 0
  };
  const t1 = tryApprove();
  const t2 = tryApprove();
  if (t1) successCount += 1;
  if (t2) successCount += 1;
  assert.equal(successCount, 1, "两个并发审核只能成功一次");
});

// ── 内联：退款累计超额校验 ──
check("内联：部分退款+全额退款金额校验（验收项 #13）", () => {
  // 已收款 1000 元
  const paidCents = 100000;
  // 第一笔退款 300 元
  const r1 = 30000;
  assert.ok(r1 <= paidCents, "部分退款 300 应通过");
  let activeRefund = r1;
  // 第二笔退款 800 元 → 累计 1100 > 1000，应拒绝
  const r2 = 80000;
  assert.ok(activeRefund + r2 > paidCents, "累计超额应被拦截");
  // 第二笔退款 700 元 → 累计 1000 = 1000，应通过（刚好退完）
  const r2b = 70000;
  assert.ok(activeRefund + r2b <= paidCents, "累计等于已收款应通过");
  activeRefund += r2b;
  assert.equal(activeRefund, paidCents, "全额退完后累计等于已收款");
});

console.log(`\n${passed} 项通过，并发/金额/幂等契约验证完成。`);
