import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseCsvLine,
  readWechatBill,
  centsToLocalCents,
  reconcileBill,
  refundInitiationEventWhere,
} from "./payment-reconciliation";

test("CSV 解析支持引号包裹与转义", () => {
  assert.deepEqual(parseCsvLine('a,"b,c","d""e",f'), ["a", "b,c", 'd"e', "f"]);
  assert.deepEqual(parseCsvLine("中文,无引号"), ["中文", "无引号"]);
});

test("微信账单按官方“元”单位解析，退款使用商户退款单号和申请退款金额", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hc-recon-"));
  const file = join(dir, "bill.csv");
  writeFileSync(
    file,
    [
      "微信支付交易账单明细",
      "`交易时间,`微信订单号,`商户订单号,`交易状态,`商户退款单号,`订单金额,`退款金额,`申请退款金额",
      "`2026-09-02 10:00:00,`WX1,`PAY1,`SUCCESS,`,`100.00,`0.00,`0.00",
      "`2026-09-02 11:00:00,`WX1,`PAY1,`REFUND,`RFD1,`0.00,`29.00,`30.00",
      "总交易单数,总金额,,,,",
      "",
    ].join("\n"),
    "utf8",
  );
  try {
    const rows = await readWechatBill(file);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].paymentNo, "PAY1");
    assert.equal(rows[0].tradeState, "SUCCESS");
    assert.equal(rows[0].orderAmountCents, 10000);
    assert.equal(rows[1].tradeState, "REFUND");
    assert.equal(rows[1].paymentNo, "PAY1");
    assert.equal(rows[1].refundNo, "RFD1");
    assert.equal(rows[1].refundAmountCents, 3000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("对账同时检出渠道多单、本地收款缺失和本地已发起退款缺失", () => {
  const issues = reconcileBill(
    [
      {
        wechatOrderNo: "WX1",
        paymentNo: "PAY1",
        refundNo: "",
        tradeState: "SUCCESS",
        orderAmountCents: 10000,
        refundAmountCents: 0,
        rawLine: 3,
      },
      {
        wechatOrderNo: "WX1",
        paymentNo: "PAY1",
        refundNo: "RFD1",
        tradeState: "REFUND",
        orderAmountCents: 0,
        refundAmountCents: 3000,
        rawLine: 4,
      },
      {
        wechatOrderNo: "WX9",
        paymentNo: "PAY-CHANNEL-ONLY",
        refundNo: "",
        tradeState: "SUCCESS",
        orderAmountCents: 500,
        refundAmountCents: 0,
        rawLine: 5,
      },
    ],
    [
      { paymentNo: "PAY1", amount: "100.00" },
      { paymentNo: "PAY-LOCAL-ONLY", amount: "5.00" },
    ],
    [
      { refundNo: "RFD1", amount: "30.00" },
      { refundNo: "RFD-LOCAL-ONLY", amount: "2.00" },
    ],
  );

  assert.deepEqual(
    issues.map((issue) => issue.type).sort(),
    ["ENV_MISMATCH", "MISSING_IN_CHANNEL", "REFUND_MISMATCH"].sort(),
  );
  assert.match(
    issues.find((issue) => issue.type === "REFUND_MISMATCH")?.detail ?? "",
    /RFD-LOCAL-ONLY/,
  );
});

test("退款对账日只认不可变的首次 APPROVED→PROCESSING 发起事件", () => {
  const dayStart = new Date("2026-09-02T00:00:00+08:00");
  const dayEnd = new Date("2026-09-03T00:00:00+08:00");

  assert.deepEqual(refundInitiationEventWhere(dayStart, dayEnd), {
    entityType: "REFUND",
    eventType: "REFUND_PROCESSING",
    fromStatus: "APPROVED",
    toStatus: "PROCESSING",
    createdAt: { gte: dayStart, lt: dayEnd },
  });
});

test("非 ALL 账单缺少退款列时明确失败关闭", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hc-recon-"));
  const file = join(dir, "success-only.csv");
  writeFileSync(
    file,
    [
      "微信支付交易账单明细",
      "交易时间,微信订单号,商户订单号,交易状态,订单金额",
      "2026-09-02 10:00:00,WX1,PAY1,SUCCESS,100.00",
    ].join("\n"),
    "utf8",
  );
  try {
    await assert.rejects(readWechatBill(file), /bill_type=ALL/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("微信金额非法时失败关闭，不把坏数据当作 0 元对账", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hc-recon-"));
  const file = join(dir, "invalid-amount.csv");
  writeFileSync(
    file,
    [
      "微信支付交易账单明细",
      "交易时间,微信订单号,商户订单号,交易状态,商户退款单号,订单金额,退款金额,申请退款金额",
      "2026-09-02 10:00:00,WX1,PAY1,SUCCESS,,not-a-number,0.00,0.00",
    ].join("\n"),
    "utf8",
  );
  try {
    await assert.rejects(readWechatBill(file), /订单金额.*无效/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("账单缺少关键列时给出含实际表头的错误", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hc-recon-"));
  const file = join(dir, "bad.csv");
  writeFileSync(file, ["标题", "A,B,C", "1,2,3"].join("\n"), "utf8");
  try {
    await assert.rejects(readWechatBill(file), /缺少关键列/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("本地金额（元）转分保持整数精度", () => {
  assert.equal(centsToLocalCents(100), 10000);
  assert.equal(centsToLocalCents("12.34"), 1234);
  assert.equal(centsToLocalCents(0.01), 1);
  assert.throws(() => centsToLocalCents("12.345"), /最多保留两位小数/);
});
