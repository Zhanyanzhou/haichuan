/**
 * 资金对账 CLI：微信商户账单（CSV）与本地 Payment/Refund 逐笔核对。
 *
 * 用法：
 *   npm run build && node dist/cli/payment-reconciliation.js --file 微信账单.csv [--date 2026-09-02] [--verbose]
 *
 * 输入：微信商户平台导出的"交易账单"CSV（UTF-8；金额单位分）。
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
  tradeState: string;
  orderAmountCents: number;
  refundAmountCents: number;
  rawLine: number;
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

async function readWechatBill(path: string): Promise<BillRow[]> {
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(path, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 3) {
    throw new Error("账单行数过少，请确认导出的是微信商户平台“交易账单”CSV");
  }
  // 微信账单：首行标题、第二行表头、随后数据行、末尾为汇总（首列为`总交易单数`等）
  const header = parseCsvLine(lines[1]);
  const indexOf = (name: string) => header.indexOf(name);
  const iWechatNo = indexOf("微信订单号");
  const iPaymentNo = indexOf("商户订单号");
  const iState = indexOf("交易状态");
  const iOrderAmount = indexOf("订单金额");
  const iRefundAmount = indexOf("退款金额");
  if (iWechatNo < 0 || iPaymentNo < 0 || iState < 0 || iOrderAmount < 0) {
    throw new Error(`账单缺少关键列（微信订单号/商户订单号/交易状态/订单金额）。实际表头：${header.join(",")}`);
  }
  const rows: BillRow[] = [];
  for (let index = 2; index < lines.length; index += 1) {
    const fields = parseCsvLine(lines[index]);
    const paymentNo = fields[iPaymentNo];
    // 汇总行与空行跳过
    if (!paymentNo || paymentNo.startsWith("总") || fields.length < 3) continue;
    rows.push({
      wechatOrderNo: fields[iWechatNo],
      paymentNo,
      tradeState: fields[iState],
      orderAmountCents: Math.round(Number(fields[iOrderAmount]) || 0),
      refundAmountCents: iRefundAmount >= 0 ? Math.round(Number(fields[iRefundAmount]) || 0) : 0,
      rawLine: index + 1,
    });
  }
  return rows;
}

function centsToLocalCents(amount: unknown): number {
  return Math.round(Number(amount) * 100);
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args[args.indexOf("--file") + 1];
  const dateArg = args[args.indexOf("--date") + 1];
  const verbose = args.includes("--verbose");
  if (!fileArg) {
    console.error("用法：node dist/cli/payment-reconciliation.js --file <微信账单.csv> [--date YYYY-MM-DD] [--verbose]");
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

    const [payments, refunds] = await Promise.all([
      prisma.payment.findMany({
        where: {
          method: "wechat",
          paidAt: { gte: dayStart, lt: dayEnd },
          status: { in: ["PAID", "PARTIAL_REFUND", "REFUNDED"] },
        },
        select: { id: true, paymentNo: true, amount: true, status: true, gatewayTradeNo: true },
      }),
      prisma.refund.findMany({
        where: {
          status: "COMPLETED",
          completedAt: { gte: dayStart, lt: dayEnd },
          payment: { method: "wechat" },
        },
        select: { id: true, refundNo: true, amount: true, gatewayRefundNo: true },
      }),
    ]);

    const paymentByNo = new Map(payments.map((payment) => [payment.paymentNo, payment]));
    const refundByNo = new Map(refunds.map((refund) => [refund.refundNo, refund]));
    const issues: Array<{ type: string; detail: string }> = [];

    // 1) 渠道有、本地无；3) 金额不平；4) 退款差异
    for (const row of bill) {
      if (row.tradeState === "REFUND") {
        const refund = refundByNo.get(row.paymentNo);
        if (!refund) {
          issues.push({ type: "REFUND_MISMATCH", detail: `账单退款 ${row.paymentNo}（行${row.rawLine}）在本地无对应已完成 Refund` });
        } else if (centsToLocalCents(refund.amount) !== row.refundAmountCents) {
          issues.push({ type: "REFUND_MISMATCH", detail: `退款 ${row.paymentNo} 金额不等：渠道 ${row.refundAmountCents} 分 / 本地 ${centsToLocalCents(refund.amount)} 分` });
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

    // 2) 本地已核销、渠道无（当日 SUCCESS 不含该单号）
    const billSuccessNos = new Set(bill.filter((row) => row.tradeState === "SUCCESS").map((row) => row.paymentNo));
    for (const payment of payments) {
      if (!billSuccessNos.has(payment.paymentNo)) {
        issues.push({ type: "MISSING_IN_CHANNEL", detail: `本地已核销 ${payment.paymentNo}（¥${payment.amount}）在账单 SUCCESS 中缺失 —— 触发查单核对` });
      }
    }

    console.log(`对账完成：账单 ${bill.length} 行 / 本地当日微信收款 ${payments.length} 笔、完成退款 ${refunds.length} 笔`);
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
export { parseCsvLine, readWechatBill, centsToLocalCents };
export type { BillRow };
