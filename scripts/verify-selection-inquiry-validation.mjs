// 选款咨询提交前商品可见性复核 — 静态契约测试
// 验证 SelectionInquiryService.create 对客户端传入的每个 productId 做服务端复核，
// 只允许"当前提交者可见 + 已发布 + 未删除"的商品被写入咨询记录，
// 且商品名称 / 图片快照由服务端规范值覆盖，不信任客户端传入值。
//
// 三个场景（与任务要求一致）：
//   1. 正常：可见且已发布商品 → 以服务端名称与受控媒体地址写入；
//   2. 不可见商品：商品存在但越权（如游客提交 MEMBER / PARTNER）→ 整次提交拒绝；
//   3. 不存在商品：productId 在库中不存在 → 整次提交拒绝。
//
// 运行：node scripts/verify-selection-inquiry-validation.mjs
// 说明：本脚本通过静态分析后端源码验证安全契约；行为级测试（带数据库）
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

console.log("选款咨询商品可见性复核契约测试\n");

// 所有源码在顶层一次性读取，供下方同步断言使用。
const serviceSrc = await readSrc(
  "server/src/modules/selection-inquiry/selection-inquiry.service.ts",
);
const productsSrc = await readSrc(
  "server/src/modules/products/products.service.ts",
);
const moduleSrc = await readSrc(
  "server/src/modules/selection-inquiry/selection-inquiry.module.ts",
);
const controllerSrc = await readSrc(
  "server/src/modules/selection-inquiry/selection-inquiry.controller.ts",
);

// ── 前置：依赖接线 ──
check("SelectionInquiryModule 已导入 ProductsModule", () => {
  assert.ok(
    /ProductsModule/.test(moduleSrc),
    "模块未导入 ProductsModule，无法复用商品可见性规则",
  );
});

check("SelectionInquiryService 注入 ProductsService", () => {
  assert.ok(
    /private\s+productsService:\s*ProductsService/.test(serviceSrc),
    "未注入 ProductsService",
  );
});

// ── 服务端规范快照方法存在且可见性规则正确 ──
check("ProductsService 暴露 resolveVisibleProductSnapshots", () => {
  assert.ok(
    /async\s+resolveVisibleProductSnapshots\s*\(/.test(productsSrc),
    "缺少 resolveVisibleProductSnapshots 方法",
  );
});

check("快照查询同时满足 id / 已发布 / 未删除 / 可见范围 四条件", () => {
  // 不可见（越权）与不存在都表现为查询不命中，二者走同一条拒绝路径。
  const block = productsSrc.match(
    /批量解析提交商品[\s\S]*?(?=\n\s*publicChangeStream)/,
  );
  assert.ok(block, "未找到 resolveVisibleProductSnapshots 实现");
  assert.ok(/id:\s*\{\s*in:\s*ids\s*\}/.test(block[0]), "缺少 id in ids 过滤");
  assert.ok(/deletedAt:\s*null/.test(block[0]), "缺少 deletedAt:null 过滤");
  assert.ok(/status:\s*"PUBLISHED"/.test(block[0]), "缺少 status:PUBLISHED 过滤");
  assert.ok(
    /visibility:\s*\{\s*in:\s*visibilities\s*\}/.test(block[0]),
    "缺少 visibility in visibilities 过滤",
  );
});

check("游客（customer 为空）仅解析为 PUBLIC 可见范围", () => {
  const block = productsSrc.match(
    /批量解析提交商品[\s\S]*?(?=\n\s*publicChangeStream)/,
  );
  assert.ok(block, "未找到 resolveVisibleProductSnapshots 实现");
  assert.ok(
    /customer\s*\?[\s\S]*?:\s*\(\["PUBLIC"\]\s*as\s+ProductVisibility\[\]\)/.test(
      block[0],
    ),
    "游客未收敛到 ['PUBLIC']，会允许游客选 MEMBER 商品",
  );
});

check("快照只返回展示字段，不泄露存储路径或内部信息", () => {
  const block = productsSrc.match(
    /批量解析提交商品[\s\S]*?(?=\n\s*publicChangeStream)/,
  );
  assert.ok(block, "未找到 resolveVisibleProductSnapshots 实现");
  assert.ok(!/storageKey/.test(block[0]), "快照不得返回 storageKey");
  assert.ok(!/fileSize/.test(block[0]), "快照不得返回 fileSize");
  assert.ok(!/cropData/.test(block[0]), "快照不得返回 cropData");
});

check("媒体地址指向自有受控端点，不写入客户端外链", () => {
  const block = productsSrc.match(
    /批量解析提交商品[\s\S]*?(?=\n\s*publicChangeStream)/,
  );
  assert.ok(block, "未找到 resolveVisibleProductSnapshots 实现");
  assert.ok(
    /\/products\/catalog\/\$\{row\.id\}\/media\/\$\{imageId\}/.test(
      block[0],
    ),
    "mediaUrl 未指向自有 catalog 媒体端点",
  );
});

// ── 场景 1：正常 — 可见且已发布商品以服务端快照写入 ──
check("场景1 正常：写入的名称来自服务端快照而非客户端", () => {
  assert.ok(
    /productNameSnapshot:\s*snap\.name/.test(serviceSrc),
    "productNameSnapshot 未用服务端 snap.name 覆盖客户端值",
  );
});

check("场景1 正常：写入的图片来自服务端受控媒体地址而非客户端", () => {
  assert.ok(
    /productImageSnapshot:\s*snap\.mediaUrl/.test(serviceSrc),
    "productImageSnapshot 未用服务端 snap.mediaUrl 覆盖客户端值",
  );
});

check("场景1 正常：全部可见时放行 prisma.create", () => {
  assert.ok(
    /snapshots\.size\s*!==\s*distinctIds\.length/.test(serviceSrc),
    "缺少基于 snapshots.size 的放行/拒绝判定",
  );
  assert.ok(/prisma\.selectionInquiry\.create/.test(serviceSrc), "缺少写入调用");
});

// ── 场景 2：不可见商品 — 越权商品导致整次拒绝 ──
check("场景2 不可见商品：可见范围外的 ID 触发整次拒绝", () => {
  // 越权商品不会被 resolveVisibleProductSnapshots 命中 → size 不匹配 → 抛 BadRequestException
  const block = serviceSrc.match(
    /snapshots\.size\s*!==\s*distinctIds\.length[\s\S]*?throw\s+new\s+BadRequestException\(\s*"([^"]+)"/,
  );
  assert.ok(block, "不可见商品未触发 BadRequestException 拒绝");
  // 拒绝文案统一覆盖"不存在/不可选"，不向调用方区分具体原因，避免泄露内部状态
  assert.ok(
    /不存在|不可选/.test(block[1]),
    "拒绝文案应统一覆盖不存在/不可选，实际为：" + block[1],
  );
});

// ── 场景 3：不存在商品 — 库中无此 ID 同样拒绝 ──
check("场景3 不存在商品：未命中的 productId 走同一条 size 拒绝路径", () => {
  // 不存在的 id 同样不在 snapshots 中，与场景 2 共享同一条 size !== length 判定；
  // 断言该判定唯一，不存在另一条"放行不命中"的旁路。
  const rejects = serviceSrc.match(
    /snapshots\.size\s*!==\s*distinctIds\.length/g,
  );
  assert.ok(
    rejects && rejects.length === 1,
    "应只有一条基于 snapshots.size 的拒绝判定，避免存在旁路",
  );
});

// ── 防绕过：无 productId 的条目必须拒绝 ──
check("防绕过：条目缺少有效 productId 时整次拒绝（不静默落库客户端快照）", () => {
  assert.ok(
    /const\s+validItems\s*=\s*items\.filter\([\s\S]*?Number\.isInteger\(item\.productId\)[\s\S]*?if\s*\(validItems\.length\s*!==\s*items\.length\)/.test(serviceSrc),
    "未校验每个条目都必须带有效 productId，存在绕过风险",
  );
  const block = serviceSrc.match(
    /validItems\.length\s*!==\s*items\.length[\s\S]*?throw\s+new\s+BadRequestException/,
  );
  assert.ok(block, "缺少有效 productId 未抛 BadRequestException");
});

// ── 保持访客咨询能力与限流 ──
check("保持访客提交能力：controller POST 仍为 @Public + OptionalCustomerAuthGuard", () => {
  assert.ok(/@Public\(\)/.test(controllerSrc), "POST 提交未标注 @Public");
  assert.ok(
    /OptionalCustomerAuthGuard/.test(controllerSrc),
    "未使用 OptionalCustomerAuthGuard，游客提交能力被破坏",
  );
});

check("保持限流策略：POST 提交仍挂 @Throttle", () => {
  assert.ok(/@Throttle\(/.test(controllerSrc), "POST 提交未保留 @Throttle 限流");
});

console.log(`\n${passed} 项通过。`);
if (process.exitCode) {
  console.error("存在失败项，请检查选款咨询商品可见性复核实现。");
} else {
  console.log("全部通过。");
}
