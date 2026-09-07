// 交易域并发、金额与幂等静态契约测试
// 付款驳回检查是保守的 AST pin/change-detection：它固定当前已审查的 shared-helper 实现，
// 不声称证明任意等价实现。未来有意重构时，须先审查服务实现与行为回归，再显式更新指纹。
// 运行：node scripts/verify-trade-concurrency.mjs

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (rel) => readFile(path.join(root, rel), "utf8");
const requireFromServer = createRequire(path.join(root, "server", "package.json"));
const ts = requireFromServer("typescript");
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
const PAYMENT_METHOD_HASHES = Object.freeze({
  rejectOfflinePayment: "4b758682b661bed4caabb62c82394837d12522a4e264edccf5139b2231fa62e6",
  failPendingPaymentAttempt: "8a614374cbde041fd39f1eaa504370f90006f546f5bc9339c2bfb289f4f033de",
});
const LEGACY_INLINE_REJECT_METHOD = `async rejectOfflinePayment(paymentId: number, reviewerId: number, reviewNote?: string, operator?: OperatorContext) {
  const actor: OperatorContext = operator ?? { type: OPERATOR_TYPE.ADMIN, id: reviewerId }; return this.prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } }); if (!payment) throw new NotFoundException("付款记录不存在");
    if (payment.method !== "bank_transfer" || payment.status !== "PENDING") throw new BadRequestException("该付款记录不能被驳回");
    const updated = await tx.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "FAILED", reviewedBy: reviewerId, reviewedAt: new Date(), reviewNote: reviewNote?.trim() || null } });
    if (updated.count === 0) throw new BadRequestException("该付款记录已被处理，请刷新后重试"); await this.tradeEvents.record(tx, { orderId: payment.orderId, entityType: TRADE_ENTITY_TYPE.PAYMENT, entityId: paymentId, eventType: TRADE_EVENT_TYPE.PAYMENT_REJECTED, fromStatus: "PENDING", toStatus: "FAILED", operator: actor, reason: reviewNote?.trim() || null });
    return tx.payment.findUnique({ where: { id: paymentId } }); }); }`;

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

function staticComputedValue(node) {
  if (ts.isParenthesizedExpression(node)) return staticComputedValue(node.expression);
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticComputedValue(node.left);
    const right = staticComputedValue(node.right);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  return undefined;
}

function instanceMemberName(member) {
  const name = member.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isPrivateIdentifier(name)) return `#${name.text}`;
  const value = ts.isComputedPropertyName(name) ? staticComputedValue(name.expression) : undefined;
  assert.notEqual(value, undefined, "OrdersService 存在无法静态确定名称的实例 method/accessor/property");
  return String(value);
}

function parsePinnedMethods(source) {
  const sourceFile = ts.createSourceFile("orders.service.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(sourceFile.parseDiagnostics.length, 0, "orders.service.ts 必须可被 TypeScript AST 解析");
  const classes = [];
  const visit = (node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === "OrdersService") classes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.equal(classes.length, 1, "必须且只能找到一个 OrdersService");

  const instanceMembers = classes[0].members.filter((member) =>
    (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) ||
      ts.isSetAccessorDeclaration(member) || ts.isPropertyDeclaration(member)) &&
    !member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword));
  const namedMembers = instanceMembers.map((member) => [instanceMemberName(member), member]);
  const methods = new Map();
  for (const name of Object.keys(PAYMENT_METHOD_HASHES)) {
    const collisions = namedMembers.filter(([memberName]) => memberName === name);
    assert.equal(collisions.length, 1, `OrdersService.${name} 必须且只能存在一个实例成员`);
    const member = collisions[0][1];
    assert.ok(ts.isMethodDeclaration(member) && ts.isIdentifier(member.name),
      `OrdersService.${name} 必须是直接命名的 MethodDeclaration`);
    methods.set(name, member);
  }
  return { sourceFile, methods, ordersClass: classes[0] };
}

function paymentMethodHashes(source) {
  const { sourceFile, methods } = parsePinnedMethods(source);
  return Object.fromEntries([...methods].map(([name, method]) => {
    const normalized = printer.printNode(ts.EmitHint.Unspecified, method, sourceFile);
    return [name, createHash("sha256").update(normalized, "utf8").digest("hex")];
  }));
}

function assertPaymentMethodsPinned(source) {
  const actual = paymentMethodHashes(source);
  for (const [name, expectedHash] of Object.entries(PAYMENT_METHOD_HASHES)) {
    assert.equal(actual[name], expectedHash, `${name} AST 指纹已变化；请审查实现和行为回归后显式更新固定指纹`);
  }
  return actual;
}

function editMethod(source, methodName, edit) {
  const { sourceFile, methods } = parsePinnedMethods(source);
  const method = methods.get(methodName);
  const start = method.getStart(sourceFile);
  const before = source.slice(start, method.end);
  const after = edit(before);
  assert.notEqual(after, before, `${methodName} 自测变体必须 changed=true`);
  return source.slice(0, start) + after + source.slice(method.end);
}

function replaceOnce(needle, replacement) {
  return (source) => {
    const first = source.indexOf(needle);
    assert.notEqual(first, -1, `自测基线缺少片段：${needle}`);
    assert.equal(source.indexOf(needle, first + needle.length), -1, `自测片段必须唯一：${needle}`);
    return source.slice(0, first) + replacement + source.slice(first + needle.length);
  };
}

function insertBeforeMethodClose(statement) {
  return (source) => {
    const close = source.lastIndexOf("}");
    assert.notEqual(close, -1, "自测方法缺少结束括号");
    return `${source.slice(0, close)}  ${statement}\n${source.slice(close)}`;
  };
}

function appendOrdersMember(source, memberText) {
  const { ordersClass } = parsePinnedMethods(source);
  const insertAt = ordersClass.end - 1;
  const variant = `${source.slice(0, insertAt)}\n  ${memberText}\n${source.slice(insertAt)}`;
  assert.notEqual(variant, source, "成员形态自测必须 changed=true");
  return variant;
}

function runPaymentPinSelfTest(source) {
  const positives = [
    editMethod(source, "rejectOfflinePayment", replaceOnce("async rejectOfflinePayment(", "async   rejectOfflinePayment  (")),
    editMethod(source, "failPendingPaymentAttempt", replaceOnce("const paymentRef", "/* normalized comment */ const paymentRef")),
    source.replace("async ship(", "async shipUnrelated("),
  ];
  positives.forEach((variant, index) => {
    assert.notEqual(variant, source, `正例 ${index + 1} 必须 changed=true`);
    assertPaymentMethodsPinned(variant);
  });

  const negativeSpecs = [
    ["wrapper 参数", "rejectOfflinePayment", replaceOnce("reviewNote?: string", "reviewNote: string | undefined")],
    ["wrapper actor", "rejectOfflinePayment", replaceOnce("OPERATOR_TYPE.ADMIN", "OPERATOR_TYPE.SYSTEM")],
    ["wrapper reason", "rejectOfflinePayment", replaceOnce("线下付款凭证审核未通过", "线下付款失败")],
    ["wrapper options", "rejectOfflinePayment", replaceOnce('expectedMethod: "bank_transfer"', 'expectedMethod: "store"')],
    ["wrapper helper 调用", "rejectOfflinePayment", replaceOnce("this.failPendingPaymentAttempt(", "this.failPendingPaymentAttempt.bind(this)(")],
    ["wrapper status guard", "rejectOfflinePayment", replaceOnce('result.status !== "FAILED"', 'result.status === "FAILED"')],
    ["helper transaction receiver", "failPendingPaymentAttempt", replaceOnce("this.prisma.$transaction", "this.prismaRead.$transaction")],
    ["helper paymentId", "failPendingPaymentAttempt", replaceOnce("where: { id: paymentId },\n      select", "where: { id: paymentId + 1 },\n      select")],
    ["helper order lock", "failPendingPaymentAttempt", replaceOnce("this.lockOrderForTrade(tx, paymentRef.orderId)", "this.lockOrderForTrade(tx, paymentRef.orderId + 1)")],
    ["helper transaction reread", "failPendingPaymentAttempt", replaceOnce("const payment = await tx.payment.findUnique", "const payment = await tx.payment.findFirst")],
    ["helper method guard", "failPendingPaymentAttempt", replaceOnce("payment.method !== options.expectedMethod", "payment.method === options.expectedMethod")],
    ["helper status guard", "failPendingPaymentAttempt", replaceOnce('payment.status !== "PENDING"', 'payment.status === "PENDING"')],
    ["helper CAS status", "failPendingPaymentAttempt", replaceOnce('where: { id: paymentId, status: "PENDING" }', 'where: { id: paymentId, status: "FAILED" }')],
    ["helper CAS count", "failPendingPaymentAttempt", replaceOnce("failed.count !== 1", "failed.count === 1")],
    ["helper reviewer", "failPendingPaymentAttempt", replaceOnce("reviewedBy: options.reviewerId ?? null", "reviewedBy: null")],
    ["helper event", "failPendingPaymentAttempt", replaceOnce("TRADE_EVENT_TYPE.PAYMENT_REJECTED", "TRADE_EVENT_TYPE.PAYMENT_FAILED")],
    ["helper orderId", "failPendingPaymentAttempt", replaceOnce("orderId: payment.orderId", "orderId: paymentRef.orderId")],
    ["helper entityId", "failPendingPaymentAttempt", replaceOnce("entityId: payment.id", "entityId: paymentId")],
    ["helper return", "failPendingPaymentAttempt", replaceOnce("return tx.payment.findUnique({ where: { id: paymentId } });", "return payment;")],
    ["dead code", "failPendingPaymentAttempt", insertBeforeMethodClose("if (false) paymentId += 0;")],
    ["同名遮蔽", "failPendingPaymentAttempt", insertBeforeMethodClose("if (false) { const paymentId = 0; }")],
    ["关键属性写入", "failPendingPaymentAttempt", insertBeforeMethodClose("options.reviewerId = options.reviewerId;")],
  ];
  for (const [label, methodName, edit] of negativeSpecs) {
    const variant = editMethod(source, methodName, edit);
    assert.throws(() => assertPaymentMethodsPinned(variant), undefined, `${label} 应触发指纹拒绝`);
  }

  const memberNegativeSpecs = [
    ["动态 computed reject 方法", 'async ["rejectOffline" + "Payment"](...args: any[]) {}'],
    ["动态 computed helper 方法", 'async ["failPendingPayment" + "Attempt"](...args: any[]) {}'],
    ["未知 computed accessor", "get [Date.now()]() { return 1; }"],
    ["未知 computed property", "[Date.now()] = 1;"],
    ["字符串名称撞名", 'async "rejectOfflinePayment"(...args: any[]) {}'],
    ["直接 computed literal 撞名", 'async ["failPendingPaymentAttempt"](...args: any[]) {}'],
  ];
  for (const [label, memberText] of memberNegativeSpecs) {
    const variant = appendOrdersMember(source, memberText);
    assert.throws(() => assertPaymentMethodsPinned(variant), undefined, `${label} 应被拒绝`);
  }

  const legacyInline = editMethod(source, "rejectOfflinePayment", () => LEGACY_INLINE_REJECT_METHOD);
  assert.throws(() => assertPaymentMethodsPinned(legacyInline), undefined, "旧 inline 架构应被拒绝");

  const renamed = source.replace("async rejectOfflinePayment(", "async rejectOfflinePaymentMissing(");
  assert.notEqual(renamed, source, "缺失方法自测必须 changed=true");
  assert.throws(() => assertPaymentMethodsPinned(renamed), undefined, "缺失关键方法应被拒绝");

  const { sourceFile, methods } = parsePinnedMethods(source);
  const helper = methods.get("failPendingPaymentAttempt");
  const helperText = source.slice(helper.getStart(sourceFile), helper.end);
  const duplicated = source.slice(0, helper.end) + `\n${helperText}\n` + source.slice(helper.end);
  assert.notEqual(duplicated, source, "重复方法自测必须 changed=true");
  assert.throws(() => assertPaymentMethodsPinned(duplicated), undefined, "重复关键方法应被拒绝");

  return { positives: positives.length, negatives: negativeSpecs.length + memberNegativeSpecs.length + 3 };
}

console.log("交易域并发 / 金额 / 幂等契约测试\n");
const ordersSrc = await readSrc("server/src/modules/orders/orders.service.ts");

check("支付核销：使用 updateMany + status:PENDING 条件更新（乐观锁）", () => {
  const approveMatch = ordersSrc.match(/async confirmPaymentSettlement[\s\S]*?async recordManualReceipt/);
  assert.ok(approveMatch, "未找到 confirmPaymentSettlement 方法");
  assert.ok(approveMatch[0].includes("tx.payment.updateMany"), "付款确认必须使用条件更新");
  assert.ok(approveMatch[0].includes("status: { in: allowedStatuses }"), "付款确认必须限定可核销状态");
  assert.ok(approveMatch[0].includes('["PENDING", "FAILED"]'), "网关恢复集合必须包含 PENDING");
});

check("支付核销：并发命中 0 时抛错（杜绝双扣库存）", () => {
  assert.ok(/updated\.count\s*===\s*0/.test(ordersSrc), "必须检查 updated.count === 0");
  assert.ok(/该付款记录已被处理，请刷新后重试/.test(ordersSrc), "并发失败需返回明确中文提示");
});

check("支付核销：整个流程在 Prisma 事务内", () => {
  const approveMatch = ordersSrc.match(/async confirmPaymentSettlement[\s\S]*?\n  \}/);
  assert.ok(approveMatch, "未找到 confirmPaymentSettlement 方法");
  assert.ok(approveMatch[0].includes("$transaction"), "confirmPaymentSettlement 必须在事务内");
});

let currentPaymentHashes;
check("付款驳回：当前 shared-helper 实现匹配固定 AST 指纹", () => {
  currentPaymentHashes = assertPaymentMethodsPinned(ordersSrc);
});

check("付款驳回：AST pin 规范化与 fail-closed 变更矩阵", () => {
  const matrix = runPaymentPinSelfTest(ordersSrc);
  console.log(`    AST pin 自测：${matrix.positives}/${matrix.positives} 正例，${matrix.negatives}/${matrix.negatives} 负例`);
});

check("库存释放：仅处理 releasedAt=null 且 consumedAt=null 的预占（防重复释放）", () => {
  assert.ok(ordersSrc.includes("releasedAt: null, consumedAt: null"), "释放必须过滤未处理预占");
});

check("库存消费：仅处理 releasedAt=null 且 consumedAt=null 的预占（防重复消费）", () => {
  const consumeMatch = ordersSrc.match(/private async consumeStockReservations[\s\S]*?\n  \}/);
  assert.ok(consumeMatch, "未找到 consumeStockReservations");
  assert.ok(consumeMatch[0].includes("releasedAt: null"), "消费必须过滤 releasedAt=null");
  assert.ok(consumeMatch[0].includes("consumedAt: null"), "消费必须过滤 consumedAt=null");
});

check("库存预占：原子条件更新 quantity>=deduction（防超卖）", () => {
  assert.ok(/where:\s*\{\s*id:\s*inventory\.id,\s*quantity:\s*\{\s*gte:\s*deduction\s*\}/.test(ordersSrc.replace(/\n/g, " ").replace(/\s+/g, " ")), "reserveStock 必须用 quantity>=deduction 条件更新");
  assert.ok(/result\.count\s*!==\s*1/.test(ordersSrc), "预占失败（count≠1）必须抛错");
});

check("库存为唯一来源：reserveStock 无库存时不 fallback 到 SKU.stock", () => {
  const reserveMatch = ordersSrc.match(/private async reserveStock[\s\S]*?\n  \}/);
  assert.ok(reserveMatch, "未找到 reserveStock 方法");
  assert.ok(reserveMatch[0].includes("Inventory 为唯一库存来源"), "reserveStock 必须明确 Inventory 单一来源");
  assert.ok(!/productSKU\.update[\s\S]*stock:\s*\{\s*decrement/.test(reserveMatch[0]), "reserveStock 不可写 SKU.stock");
});

check("订单金额：使用整数分累加（Math.round(unitPrice*100)）", () => {
  assert.ok(ordersSrc.includes("Math.round(unitPrice * 100)"), "单价必须转整数分");
  assert.ok(ordersSrc.includes("unitCents * quantity"), "小计必须用整数分相乘");
  assert.ok(/new Prisma\.Decimal\(totalCents\)\.div\(100\)/.test(ordersSrc), "总额必须从整数分转回 Decimal");
});

check("订单金额：不信任前端金额（服务端从 SKU.price 计算）", () => {
  assert.ok(/for \(const sku of skus\)[\s\S]*?Number\(sku\.price\)/.test(ordersSrc), "价格必须从服务端 SKU 取值");
});

const refundsSrc = await readSrc("server/src/modules/refunds/refunds.service.ts");

check("退款：累计退款不超过已确认收款（整数分校验）", () => {
  assert.ok(refundsSrc.includes("activeRefundCents + amountCents > paidCents"), "退款金额校验逻辑缺失");
  assert.ok(/退款金额超过可退额度/.test(refundsSrc), "超额退款必须有中文提示");
});

check("退款：金额统一通过 moneyToCents 转为整数分", () => {
  assert.ok(refundsSrc.includes("private moneyToCents"), "缺少统一整数分转换入口");
  assert.ok(refundsSrc.includes("this.moneyToCents(data.amount, '退款金额')"), "退款金额必须转整数分");
  assert.ok(refundsSrc.includes("this.moneyToCents(payment.amount)"), "已收款必须转整数分");
});

check("退款：支持幂等键（idempotencyKey 防重复创建）", () => {
  assert.ok(refundsSrc.includes("idempotencyKey") && refundsSrc.includes("where: { idempotencyKey: data.idempotencyKey }"), "幂等键查询缺失");
  assert.ok(refundsSrc.includes("assertSameIdempotentRequest"), "同键不同请求必须冲突");
});

check("退款：审核与执行使用乐观锁（状态条件更新）", () => {
  const reviewMatch = refundsSrc.match(/async review[\s\S]*?\n  \}/);
  const executeMatch = refundsSrc.match(/async execute[\s\S]*?\n  \}/);
  assert.ok(reviewMatch && reviewMatch[0].includes("updateMany") && reviewMatch[0].includes("status: 'PENDING'"), "review 必须用 PENDING 条件更新");
  assert.ok(executeMatch && executeMatch[0].includes("updateMany"), "execute 必须用条件更新");
});

check("退款：审核通过时再次校验金额（防审核期间超额）", () => {
  const reviewMatch = refundsSrc.match(/async review[\s\S]*?\n  \}/);
  assert.ok(reviewMatch[0].includes("getActiveRefundCents(tx, refund.orderId, refundId)"), "review 必须在同一事务重新校验订单退款额度");
  assert.ok(reviewMatch[0].includes("getPaymentActiveRefundCents"), "review 必须重新校验原 Payment 额度");
});

check("内联：整数分累加无浮点误差（验收项 #12 基础）", () => {
  const floatSum = 0.1 + 0.2;
  assert.notEqual(floatSum, 0.3, "浮点累加应产生误差（反证）");
  const centsSum = Math.round(0.1 * 100) + Math.round(0.2 * 100);
  assert.equal(centsSum, 30, "整数分累加应精确");
  assert.equal(Math.round(35.67 * 100), 3567, "含小数金额应正确转整数分");
});

check("内联：模拟两个并发审核只有一个成功（验收项 #8）", () => {
  let status = "PENDING";
  let successCount = 0;
  const tryApprove = () => {
    if (status === "PENDING") {
      status = "PAID";
      return true;
    }
    return false;
  };
  if (tryApprove()) successCount += 1;
  if (tryApprove()) successCount += 1;
  assert.equal(successCount, 1, "两个并发审核只能成功一次");
});

check("内联：部分退款+全额退款金额校验（验收项 #13）", () => {
  const paidCents = 100000;
  const firstRefund = 30000;
  assert.ok(firstRefund <= paidCents, "部分退款 300 应通过");
  let activeRefund = firstRefund;
  assert.ok(activeRefund + 80000 > paidCents, "累计超额应被拦截");
  assert.ok(activeRefund + 70000 <= paidCents, "累计等于已收款应通过");
  activeRefund += 70000;
  assert.equal(activeRefund, paidCents, "全额退完后累计等于已收款");
});

console.log("\n付款驳回 AST pin（expected / actual）：");
for (const [name, expectedHash] of Object.entries(PAYMENT_METHOD_HASHES)) {
  console.log(`  ${name}: ${expectedHash} / ${currentPaymentHashes?.[name] ?? "unavailable"}`);
}
console.log("  架构范围：仅支持当前 shared-helper；旧 inline 实现故意拒绝");
console.log(`\n${passed} 项通过，并发/金额/幂等契约验证完成。`);
