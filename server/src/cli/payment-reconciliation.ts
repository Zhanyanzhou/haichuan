/**
 * 资金对账 CLI：微信商户 ALL 交易账单（CSV）与本地 Payment/Refund 逐笔核对。
 *
 * 用法：
 *   npm run build && node dist/cli/payment-reconciliation.js --file 微信ALL交易账单.csv [--date 2026-09-02] [--verbose]
 *
 * 输入：微信商户平台导出的 bill_type=ALL "交易账单"CSV（UTF-8；官方账单金额单位元）。
 * SUCCESS/REFUND 单表不能同时证明收款与退款完整性，本 CLI 失败关闭。
 * 四类差错自动分类：
 *   1. ENV_MISMATCH       渠道有、本地无 —— 疑似环境错配或单号串库，人工确认
 *   2. MISSING_IN_CHANNEL 本地已核销、渠道无 —— 疑似掉单/长款，触发查单核对
 *   3. AMOUNT_MISMATCH    渠道金额与本地 Payment 不等 —— 冻结进人工对账
 *   4. REFUND_MISMATCH    退款事实差异（缺失/金额不等）—— 冻结进人工对账
 *
 * 只读数据库，不修改任何交易事实；退出码 0=平账、1=存在差错（可接值班流水线）。
 * 支付宝账单核对待其客户旅程接入后实现（当前明确拒绝，不做半吊子解析）。
 */
import { createReadStream } from "node:fs";
import { PrismaService } from "../common/prisma/prisma.service";

interface BillRow {
  wechatOrderNo: string;
  paymentNo: string;
  refundNo: string;
  tradeState: string;
  orderAmountCents: number;
  refundAmountCents: number;
  rawLine: number;
}

interface LocalPaymentRecord {
  paymentNo: string;
  amount: unknown;
}

interface LocalRefundRecord {
  refundNo: string;
  amount: unknown;
}

interface ReconciliationIssue {
  type: "ENV_MISMATCH" | "MISSING_IN_CHANNEL" | "AMOUNT_MISMATCH" | "REFUND_MISMATCH";
  detail: string;
}

/** 简易 CSV 解析（支持双引号包裹与转义），避免引入依赖 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function normalizeWechatCell(value: string | undefined): string {
  return (value ?? "").replace(/^\uFEFF/, "").replace(/^`/, "").trim();
}

/** 微信交易账单金额是以元表示的最多两位小数；不用 Number * 100 避免浮点误差。 */
function yuanTextToCents(value: string, fieldName: string, rawLine?: number): number {
  const normalized = normalizeWechatCell(value);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  const suffix = rawLine === undefined ? "" : `（行${rawLine}）`;
  if (!match) {
    if (/^\d+\.\d{3,}$/.test(normalized)) {
      throw new Error(`${fieldName}${suffix}最多保留两位小数`);
    }
    throw new Error(`${fieldName}${suffix}无效：${normalized || "<空>"}`);
  }
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName}${suffix}超出可安全对账范围`);
  }
  return Number(cents);
}

async function readWechatBill(path: string): Promise<BillRow[]> {
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(path, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 3) {
    throw new Error("账单行数过少，请确认导出的是微信 bill_type=ALL 交易账单 CSV");
  }
  // 微信账单：首行标题、第二行表头、随后数据行、末尾为汇总（首列为`总交易单数`等）
  const header = parseCsvLine(lines[1]).map(normalizeWechatCell);
  const indexOf = (name: string) => header.indexOf(name);
  const iWechatNo = indexOf("微信订单号");
  const iPaymentNo = indexOf("商户订单号");
  const iRefundNo = indexOf("商户退款单号");
  const iState = indexOf("交易状态");
  const iOrderAmount = indexOf("订单金额");
  // 本地 Refund.amount 是商户申请的退款总额，应对齐“申请退款金额”；
  // “退款金额”是扣除部分券退款后的应结算金额，不是同一业务事实。
  const iRefundAmount = indexOf("申请退款金额");
  if (
    iWechatNo < 0 ||
    iPaymentNo < 0 ||
    iRefundNo < 0 ||
    iState < 0 ||
    iOrderAmount < 0 ||
    iRefundAmount < 0
  ) {
    throw new Error(`仅支持含收款与退款完整列的微信 bill_type=ALL 交易账单；当前缺少关键列（微信订单号/商户订单号/商户退款单号/交易状态/订单金额/申请退款金额）。实际表头：${header.join(",")}`);
  }
  const rows: BillRow[] = [];
  for (let index = 2; index < lines.length; index += 1) {
    const fields = parseCsvLine(lines[index]);
    const paymentNo = normalizeWechatCell(fields[iPaymentNo]);
    // 汇总行与空行跳过
    if (!paymentNo || paymentNo.startsWith("总") || fields.length < 3) continue;
    rows.push({
      wechatOrderNo: normalizeWechatCell(fields[iWechatNo]),
      paymentNo,
      refundNo: normalizeWechatCell(fields[iRefundNo]),
      tradeState: normalizeWechatCell(fields[iState]),
      orderAmountCents: yuanTextToCents(fields[iOrderAmount], "订单金额", index + 1),
      refundAmountCents: yuanTextToCents(fields[iRefundAmount], "申请退款金额", index + 1),
      rawLine: index + 1,
    });
  }
  return rows;
}

function centsToLocalCents(amount: unknown): number {
  return yuanTextToCents(String(amount), "本地金额");
}

function reconcileBill(
  bill: BillRow[],
  payments: LocalPaymentRecord[],
  refunds: LocalRefundRecord[],
): ReconciliationIssue[] {
  const paymentByNo = new Map(payments.map((payment) => [payment.paymentNo, payment]));
  const refundByNo = new Map(refunds.map((refund) => [refund.refundNo, refund]));
  const issues: ReconciliationIssue[] = [];

  // 渠道→本地：查环境串单、单号和金额差异。
  for (const row of bill) {
    if (row.tradeState === "REFUND") {
      if (!row.refundNo) {
        issues.push({
          type: "REFUND_MISMATCH",
          detail: `账单退款行${row.rawLine}缺少商户退款单号`,
        });
        continue;
      }
      const refund = refundByNo.get(row.refundNo);
      if (!refund) {
        issues.push({ type: "REFUND_MISMATCH", detail: `账单退款 ${row.refundNo}（行${row.rawLine}）在本地无对应已完成 Refund` });
      } else if (centsToLocalCents(refund.amount) !== row.refundAmountCents) {
        issues.push({ type: "REFUND_MISMATCH", detail: `退款 ${row.refundNo} 金额不等：渠道 ${row.refundAmountCents} 分 / 本地 ${centsToLocalCents(refund.amount)} 分` });
      }
      continue;
    }
    if (row.tradeState !== "SUCCESS") continue;
    const payment = paymentByNo.get(row.paymentNo);
    if (!payment) {
      issues.push({ type: "ENV_MISMATCH", detail: `渠道成功单 ${row.paymentNo}（行${row.rawLine}）本地不存在 —— 疑似环境错配，人工确认` });
    } else if (centsToLocalCents(payment.amount) !== row.orderAmountCents) {
      issues.push({ type: "AMOUNT_MISMATCH", detail: `付款 ${row.paymentNo} 金额不等：渠道 ${row.orderAmountCents} 分 / 本地 ${centsToLocalCents(payment.amount)} 分 —— 冻结人工对账` });
    }
  }

  // 本地→渠道：已核销收款和当日已发起退款都必须在对应交易日账单中存在。
  const billSuccessNos = new Set(bill.filter((row) => row.tradeState === "SUCCESS").map((row) => row.paymentNo));
  for (const payment of payments) {
    if (!billSuccessNos.has(payment.paymentNo)) {
      issues.push({ type: "MISSING_IN_CHANNEL", detail: `本地已核销 ${payment.paymentNo}（¥${payment.amount}）在账单 SUCCESS 中缺失 —— 触发查单核对` });
    }
  }
  const billRefundNos = new Set(
    bill.filter((row) => row.tradeState === "REFUND" && row.refundNo).map((row) => row.refundNo),
  );
  for (const refund of refunds) {
    if (!billRefundNos.has(refund.refundNo)) {
      issues.push({ type: "REFUND_MISMATCH", detail: `本地已发起退款 ${refund.refundNo}（¥${refund.amount}）在账单 REFUND 中缺失 —— 冻结并触发退款查单` });
    }
  }

  return issues;
}

/**
 * 微信退款按渠道发起日进入交易账单。Refund.processedAt 会在后续渠道 fact
 * 中被改写，completedAt 又可能跨日；因此只认不可变时间线上首次
 * APPROVED → PROCESSING 事件。该事件与本地发起状态同事务，后续重试/查单/完成不会漂移归属日。
 */
function refundInitiationEventWhere(dayStart: Date, dayEnd: Date) {
  return {
    entityType: "REFUND",
    eventType: "REFUND_PROCESSING",
    fromStatus: "APPROVED",
    toStatus: "PROCESSING",
    createdAt: { gte: dayStart, lt: dayEnd },
  } as const;
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args[args.indexOf("--file") + 1];
  const dateArg = args[args.indexOf("--date") + 1];
  const verbose = args.includes("--verbose");
  if (!fileArg) {
    console.error("用法：node dist/cli/payment-reconciliation.js --file <微信ALL交易账单.csv> [--date YYYY-MM-DD] [--verbose]");
    process.exit(2);
  }
  if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error("必须提供 --date YYYY-MM-DD（账单对应的交易日，用于本地侧过滤）");
    process.exit(2);
  }

  const bill = await readWechatBill(fileArg);
  const prisma = new PrismaService();
  try {
    const dayStart = new Date(`${dateArg}T00:00:00+08:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const [payments, refundInitiationEvents] = await Promise.all([
      prisma.payment.findMany({
        where: {
          method: "wechat",
          paidAt: { gte: dayStart, lt: dayEnd },
          status: { in: ["PAID", "PARTIAL_REFUND", "REFUNDED"] },
        },
        select: { id: true, paymentNo: true, amount: true, status: true, gatewayTradeNo: true },
      }),
      prisma.tradeEvent.findMany({
        where: refundInitiationEventWhere(dayStart, dayEnd),
        select: { entityId: true },
        distinct: ["entityId"],
      }),
    ]);
    const initiatedRefundIds = refundInitiationEvents.map((event) => event.entityId);
    const refunds = initiatedRefundIds.length === 0
      ? []
      : await prisma.refund.findMany({
        where: {
          id: { in: initiatedRefundIds },
          payment: { method: "wechat" },
        },
        select: { id: true, refundNo: true, amount: true, gatewayRefundNo: true },
      });

    const issues = reconcileBill(bill, payments, refunds);

    console.log(`对账完成：账单 ${bill.length} 行 / 本地当日微信收款 ${payments.length} 笔、发起退款 ${refunds.length} 笔`);
    if (issues.length === 0) {
      console.log("RESULT: RECONCILED（平账）");
      return;
    }
    for (const issue of issues) {
      console.log(`[ ${issue.type} ] ${issue.detail}`);
    }
    const summary = issues.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {});
    console.log(`RESULT: DISCREPANCY（${issues.length} 项）`, JSON.stringify(summary));
    if (verbose) {
      console.log("提示：ENV_MISMATCH 检查环境与商户号；MISSING_IN_CHANNEL 用后台“立即查单”核实；金额类差错冻结人工处理。");
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

// 直接运行时执行；被测试导入时只暴露纯函数
if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(`对账执行失败：${error instanceof Error ? error.message : error}`);
    process.exit(2);
  });
}

// 供测试消费的导出（不执行 main）
export {
  parseCsvLine,
  readWechatBill,
  centsToLocalCents,
  reconcileBill,
  refundInitiationEventWhere,
};
export type { BillRow, LocalPaymentRecord, LocalRefundRecord, ReconciliationIssue };
