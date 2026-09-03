import * as assert from "node:assert/strict";
import { test } from "node:test";
import { VALID_TRANSITIONS } from "./orders.service";

/**
 * 订单状态机的行为级测试：导入服务真实导出的转换表断言其语义，
 * 取代 scripts/verify-trade-state-machine.mjs 中仅做源码文本字面匹配的检查方式。
 * 文本匹配脚本仍保留作为源码结构存在性的补充防线。
 */

type OrderStatusKey = keyof typeof VALID_TRANSITIONS;

const ALL_STATUSES: readonly OrderStatusKey[] = [
  "PENDING_PAYMENT",
  "PENDING_SHIP",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
];

test("状态机覆盖全部五个状态且不引入未知状态", () => {
  assert.deepEqual(
    (Object.keys(VALID_TRANSITIONS) as OrderStatusKey[]).sort(),
    [...ALL_STATUSES].sort(),
  );
  for (const targets of Object.values(VALID_TRANSITIONS)) {
    for (const next of targets) {
      assert.ok(
        (ALL_STATUSES as readonly string[]).includes(next),
        `状态机出现未知目标状态: ${next}`,
      );
    }
  }
});

test("合法转换表与资金/履约语义一致", () => {
  assert.deepEqual(VALID_TRANSITIONS.PENDING_PAYMENT, ["PENDING_SHIP", "CANCELLED"]);
  assert.deepEqual(VALID_TRANSITIONS.PENDING_SHIP, ["SHIPPED"]);
  assert.deepEqual(VALID_TRANSITIONS.SHIPPED, ["COMPLETED"]);
  // 终态不可迁出
  assert.deepEqual(VALID_TRANSITIONS.COMPLETED, []);
  assert.deepEqual(VALID_TRANSITIONS.CANCELLED, []);
});

test("资金未确认的订单不得跳过付款直达发货或完成", () => {
  assert.ok(!VALID_TRANSITIONS.PENDING_PAYMENT.includes("SHIPPED"));
  assert.ok(!VALID_TRANSITIONS.PENDING_PAYMENT.includes("COMPLETED"));
});

test("状态机不存在自环与环", () => {
  for (const status of ALL_STATUSES) {
    const targets = VALID_TRANSITIONS[status];
    assert.ok(!targets.includes(status), `${status} 不允许自环`);

    const visited = new Set<string>();
    const queue = [...targets];
    while (queue.length > 0) {
      const current = queue.shift() as OrderStatusKey;
      assert.ok(
        current !== status,
        `状态机存在环：${status} 可经过 ${current} 回到自身`,
      );
      if (!visited.has(current)) {
        visited.add(current);
        queue.push(...VALID_TRANSITIONS[current]);
      }
    }
  }
});

test("每个非终态都在有限步内到达终态", () => {
  for (const status of ALL_STATUSES) {
    const queue: Array<{ state: OrderStatusKey; depth: number }> = [
      { state: status, depth: 0 },
    ];
    const visited = new Set<string>([status]);
    let reachedTerminal = false;
    while (queue.length > 0) {
      const { state, depth } = queue.shift()!;
      if (VALID_TRANSITIONS[state].length === 0) {
        reachedTerminal = true;
        assert.ok(depth <= 3, `${status} 到达终态路径过长（${depth} 步）`);
        break;
      }
      for (const next of VALID_TRANSITIONS[state]) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push({ state: next, depth: depth + 1 });
        }
      }
    }
    assert.ok(reachedTerminal, `${status} 无法到达终态`);
  }
});
