import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCsvLine, readWechatBill, centsToLocalCents } from "./payment-reconciliation";

test("CSV 解析支持引号包裹与转义", () => {
  assert.deepEqual(parseCsvLine('a,"b,c","d""e",f'), ["a", "b,c", 'd"e', "f"]);
  assert.deepEqual(parseCsvLine("中文,无引号"), ["中文", "无引号"]);
});

test("微信账单解析提取单号/状态/金额并跳过汇总行", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hc-recon-"));
  const file = join(dir, "bill.csv");
  writeFileSync(
    file,
    [
      "微信支付交易账单明细",
      "交易时间,微信订单号,商户订单号,交易状态,订单金额,退款金额",
      "2026-09-02 10:00:00,WX1,PAY1,SUCCESS,10000,0",
      "2026-09-02 11:00:00,WX2,RFD1,REFUND,0,3000",
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
    assert.equal(rows[1].refundAmountCents, 3000);
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
});
