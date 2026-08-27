// 选款咨询商品可见性服务端复核 —— 跨层静态契约测试
// 验证：POST /api/selection-inquiries 不再信任客户端 productId / 名称 / 图片，
//       提交前由服务端复用既有商品公开/目录可见性规则逐个复核，并以服务端规范快照覆盖客户端快照。
// 覆盖场景：合法公开商品、不存在商品、内部商品、合作商家商品、混合 ID。
// 运行：node scripts/verify-selection-inquiry-security.mjs
//
// 说明：本项目测试设施为零依赖 Node 脚本（见 verify-trade-contract.mjs），
//       本脚本沿用同一约定做静态契约校验；运行期行为/越权回归仍需后端联调（见交付说明）。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (rel) => readFile(path.join(root, rel), "utf8");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log("选款咨询商品可见性服务端复核 —— 静态契约测试\n");

// 仅校验实际代码，避免注释中的示例字段或 snapshot 文字触发断言。
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// 通过参数和花括号配对提取类方法，避免依赖固定缩进或跨大段源码正则。
const methodBody = (src, name) => {
  const signature = new RegExp(`\\b(?:async\\s+)?${name}\\s*\\(`).exec(src);
  if (!signature) return null;

  const openParen = src.indexOf("(", signature.index);
  let parenDepth = 0;
  let signatureEnd = -1;
  for (let index = openParen; index < src.length; index += 1) {
    if (src[index] === "(") parenDepth += 1;
    if (src[index] === ")" && --parenDepth === 0) {
      signatureEnd = index + 1;
      break;
    }
  }
  if (signatureEnd === -1) return null;

  let genericDepth = 0;
  let openBrace = -1;
  for (let index = signatureEnd; index < src.length; index += 1) {
    if (src[index] === "<") genericDepth += 1;
    if (src[index] === ">") genericDepth = Math.max(0, genericDepth - 1);
    if (src[index] === "{" && genericDepth === 0) {
      openBrace = index;
      break;
    }
  }
  if (openBrace === -1) return null;

  let braceDepth = 0;
  for (let index = openBrace; index < src.length; index += 1) {
    if (src[index] === "{") braceDepth += 1;
    if (src[index] === "}" && --braceDepth === 0) {
      return [src.slice(signature.index, index + 1)];
    }
  }
  return null;
};

const productsService = stripComments(await readSrc("server/src/modules/products/products.service.ts"));
const productEligibility = stripComments(await readSrc("server/src/modules/products/product-eligibility.ts"));
const selectionService = stripComments(await readSrc("server/src/modules/selection-inquiry/selection-inquiry.service.ts"));
const selectionController = stripComments(await readSrc("server/src/modules/selection-inquiry/selection-inquiry.controller.ts"));
const selectionModule = stripComments(await readSrc("server/src/modules/selection-inquiry/selection-inquiry.module.ts"));

const snapshotMethod = methodBody(productsService, "resolveVisibleProductSnapshots");

// ── 复用既有可见性规则（不另造判断）──
check("ProductsService：提供服务端规范快照解析 resolveVisibleProductSnapshots", () => {
  assert.ok(snapshotMethod, "缺少 resolveVisibleProductSnapshots 方法（选款咨询复核入口）");
});

check("可见性规则：resolveVisibleProductSnapshots 复用 resolveVisibleVisibilities（会员/合作商家分支）", () => {
  assert.ok(snapshotMethod, "未定位 resolveVisibleProductSnapshots 方法体");
  assert.ok(/resolveVisibleVisibilities/.test(snapshotMethod[0]), "必须复用 resolveVisibleVisibilities，不可另造可见性判断");
});

check("可见性规则：游客（customer 为空）降级为仅 PUBLIC", () => {
  assert.ok(snapshotMethod, "未定位 resolveVisibleProductSnapshots 方法体");
  assert.ok(/\[\s*"PUBLIC"\s*\]/.test(snapshotMethod[0]), "游客分支必须显式降级为 ['PUBLIC']");
});

check("可见性规则：同时校验 PUBLISHED + deletedAt IS NULL + visibility 命中范围", () => {
  assert.ok(snapshotMethod, "未定位 resolveVisibleProductSnapshots 方法体");
  assert.ok(/status:\s*"PUBLISHED"/.test(snapshotMethod[0]), "必须校验 status=PUBLISHED");
  assert.ok(/deletedAt:\s*null/.test(snapshotMethod[0]), "必须过滤软删除 deletedAt:null");
  assert.ok(/visibility:\s*\{\s*in:\s*visibilities\s*\}/.test(snapshotMethod[0]), "必须按可见范围 visibility:in 过滤");
});

check("不泄露内部信息：仅 select 展示所需字段，不含价格/库存/存储键/销量等内部字段", () => {
  assert.ok(snapshotMethod, "未定位 resolveVisibleProductSnapshots 方法体");
  for (const leak of ["price", "storageKey", "cost", "supplier", "stock", "quantity", "salesCount", "viewCount", "description"]) {
    assert.ok(!new RegExp(`\\b${leak}\\s*:`, "i").test(snapshotMethod[0]), `不得查询或返回内部字段: ${leak}`);
  }
  assert.ok(/\bname\b/.test(snapshotMethod[0]), "应取 name 作为展示快照");
  assert.ok(/primaryImage/.test(snapshotMethod[0]), "应取 primaryImage 以构造受控媒体地址");
});

check("快照媒体地址：使用 /products/catalog/ 前缀（与 SecureImage 受控媒体识别一致，禁止 /api 双前缀导致 401）", () => {
  assert.ok(snapshotMethod, "未定位 resolveVisibleProductSnapshots 方法体");
  assert.ok(snapshotMethod[0].includes("/products/catalog/"), "mediaUrl 须使用 /products/catalog/ 前缀");
  assert.ok(snapshotMethod[0].includes("${row.id}/media/${imageId}"), "mediaUrl 须按 row.id + imageId 拼接受控媒体端点");
  assert.ok(!snapshotMethod[0].includes("/api/products/catalog/"), "mediaUrl 不得带 /api 前缀：SecureImage 自行拼接 API_BASE，双前缀会致鉴权失败 401");
});

check("一致性：filterVisibleProductIds 委托给 resolveVisibleProductSnapshots（同一可见性判定路径）", () => {
  const filterMethod = methodBody(productsService, "filterVisibleProductIds");
  assert.ok(filterMethod, "缺少 filterVisibleProductIds 方法");
  assert.ok(/resolveVisibleProductSnapshots/.test(filterMethod[0]), "filterVisibleProductIds 必须委托 resolveVisibleProductSnapshots，避免可见性逻辑重复");
});

check("可见性单一来源：ProductsService 委托共享 resolveCustomerProductVisibilities", () => {
  const resolveMethod = methodBody(productsService, "resolveVisibleVisibilities");
  assert.ok(resolveMethod, "未定位 resolveVisibleVisibilities 方法体");
  assert.ok(
    /import\s*\{[^}]*\bresolveCustomerProductVisibilities\b[^}]*\}\s*from\s*["']\.\/product-eligibility["']/.test(productsService),
    "ProductsService 必须从 product-eligibility 导入共享可见性 helper",
  );
  assert.ok(
    /return\s+resolveCustomerProductVisibilities\(customer\)/.test(resolveMethod[0]),
    "resolveVisibleVisibilities 必须直接委托共享 helper，不能复制合作商家判断",
  );
});

check("合作商家可见范围：共享 helper 仅在 accountType=PARTNER 且 partnerStatus=APPROVED 时含 PARTNER", () => {
  const helperMethod = methodBody(productEligibility, "resolveCustomerProductVisibilities");
  assert.ok(helperMethod, "未定位共享 resolveCustomerProductVisibilities 方法体");
  assert.ok(/accountType\s*===?\s*"PARTNER"/.test(helperMethod[0]), "必须判定 accountType=PARTNER");
  assert.ok(/partnerStatus\s*===?\s*"APPROVED"/.test(helperMethod[0]), "必须判定 partnerStatus=APPROVED");
  assert.ok(/\[\s*"PUBLIC",\s*"MEMBER",\s*"PARTNER"\s*\]/.test(helperMethod[0]), "合作商家可见范围含 PARTNER");
  assert.ok(/\[\s*"PUBLIC",\s*"MEMBER"\s*\]/.test(helperMethod[0]), "非合作商家降级为 PUBLIC+MEMBER");
});

// ── 选款咨询服务：提交前服务端复核 ──
check("依赖注入：SelectionInquiryService 注入 ProductsService", () => {
  assert.ok(/import\s+\{\s*ProductsService\s*\}\s+from\s+["']\.\.\/products\/products\.service["']/.test(selectionService),
    "必须从 products 模块导入 ProductsService");
  assert.ok(/productsService:\s*ProductsService/.test(selectionService), "构造函数必须注入 productsService");
});

check("强制每项带有效 productId：缺省 / 非正整数即整批拒绝（防绕过服务端复核）", () => {
  const createMethod = methodBody(selectionService, "create");
  assert.ok(createMethod, "未定位 SelectionInquiryService.create 方法体");
  assert.ok(/typeof\s+item\.productId\s*===\s*"number"/.test(createMethod[0]), "必须先将 productId 收窄为 number");
  assert.ok(/Number\.isInteger\(item\.productId\)/.test(createMethod[0]), "必须校验 productId 为整数");
  assert.ok(/item\.productId\s*>\s*0/.test(createMethod[0]), "必须校验 productId 为正数");
  const guardThrow = createMethod[0].match(/validItems\.length\s*!==\s*items\.length[\s\S]*?throw\s+new\s+BadRequestException\(\s*["'`]([^"'`]+)["'`]/);
  assert.ok(guardThrow, "未定位 productId 守卫抛错块");
  for (const leak of ["INTERNAL", "PARTNER", "MEMBER", "visibility", "越权", "权限"]) {
    assert.ok(!guardThrow[1].includes(leak), `守卫错误不得包含内部语义词: ${leak}`);
  }
});

check("复核时机：在 selectionInquiry.create 之前调用 resolveVisibleProductSnapshots", () => {
  const validateIdx = selectionService.indexOf("resolveVisibleProductSnapshots");
  const createIdx = selectionService.search(
    /(?:this\.prisma|transaction)\.selectionInquiry\.create/,
  );
  assert.ok(validateIdx !== -1, "未调用 resolveVisibleProductSnapshots");
  assert.ok(createIdx !== -1, "未找到 selectionInquiry.create");
  assert.ok(validateIdx < createIdx, "可见性复核必须在写入之前执行");
});

check("逐个复核：productId 去重后整体校验，入参为 distinctIds + 令牌 customer（覆盖混合 ID）", () => {
  assert.ok(/new\s+Set\(validItems\.map\([\s\S]*?productId/.test(selectionService), "必须从已收窄条目提取 productId 并去重");
  assert.ok(/resolveVisibleProductSnapshots\(\s*distinctIds\s*,\s*data\.customer\s*,?\s*\)/.test(selectionService),
    "复核入参必须是 productId 去重得到的 distinctIds 与令牌派生的 data.customer，不得使用客户端快照作为可见性依据");
});

check("拒绝整次提交：任一 ID 不可见即抛错（snapshots.size !== distinctIds.length）", () => {
  assert.ok(/snapshots\.size\s*!==\s*distinctIds\.length/.test(selectionService),
    "必须比较通过校验数量与提交去重数量；不等则整批拒绝");
  assert.ok(/throw\s+new\s+BadRequestException/.test(selectionService), "不可见时必须抛出 BadRequestException");
});

check("不泄露内部信息：拒绝错误不含 INTERNAL/PARTNER/visibility/status/越权 等内部语义", () => {
  const throwBlock = selectionService.match(/snapshots\.size\s*!==\s*distinctIds\.length[\s\S]*?throw\s+new\s+BadRequestException\(\s*["'`]([^"'`]+)["'`]/);
  assert.ok(throwBlock, "未定位可见性失败抛错块");
  const msg = throwBlock[1];
  for (const leak of ["INTERNAL", "PARTNER", "MEMBER", "visibility", "status", "越权", "权限", "下架", "未发布"]) {
    assert.ok(!msg.includes(leak), `拒绝错误不得包含内部语义词: ${leak}`);
  }
  assert.ok(/不存在|不可选|刷新/.test(msg), "拒绝错误应给出无信息泄漏的通用提示");
});

check("快照由服务端规范覆盖：写入用 snap.name / snap.mediaUrl，不接受客户端名称/图片作为快照真相", () => {
  const snapshotBlock = selectionService.match(/const createItems = distinctIds\.map\([\s\S]*?\n    \}\);/);
  assert.ok(snapshotBlock, "未定位服务端快照到 createItems 的映射");
  assert.ok(/productNameSnapshot:\s*snap\.name/.test(snapshotBlock[0]), "productNameSnapshot 应以服务端 snap.name 覆盖客户端值");
  assert.ok(/productImageSnapshot:\s*snap\.mediaUrl/.test(snapshotBlock[0]), "productImageSnapshot 应以服务端 snap.mediaUrl 覆盖客户端值");
  // 客户端名称/图片不得直接作为快照真相写入（即便 productId 合法也不允许覆盖服务端规范）
  assert.ok(!/productNameSnapshot:\s*item\.productNameSnapshot/.test(snapshotBlock[0]), "不得直接落库客户端 productNameSnapshot");
  assert.ok(!/productImageSnapshot:\s*item\.productImageSnapshot/.test(snapshotBlock[0]), "不得直接落库客户端 productImageSnapshot");
  assert.ok(/items:\s*\{\s*create:\s*createItems\s*\}/.test(selectionService), "写入必须使用已复核的 createItems");
});

check("productSkuSnapshot 保留为客户端展示文本（trim 后落库，不作为可见性或安全依据）", () => {
  const snapshotBlock = selectionService.match(/const createItems = distinctIds\.map\([\s\S]*?\n    \}\);/);
  assert.ok(snapshotBlock, "未定位服务端快照到 createItems 的映射");
  assert.ok(/productSkuSnapshot:\s*item\.productSkuSnapshot\?\.trim\(\)/.test(snapshotBlock[0]), "productSkuSnapshot 作为展示性文本保留客户端值");
});

check("访客/客户身份保留：create 仍把 request.customer 透传给 service", () => {
  assert.ok(/@Public\(\)/.test(selectionController), "create 必须保留 @Public() 旁通全局 JwtAuthGuard");
  assert.ok(/OptionalCustomerAuthGuard/.test(selectionController), "必须保留 OptionalCustomerAuthGuard（可选客户身份）");
  assert.ok(/customer:\s*request\.customer/.test(selectionController), "必须把 request.customer 透传给 service");
});

check("限流保留：公开提交仍受 5/min 限流约束", () => {
  const throttleMatch = selectionController.match(/@Throttle\(\s*\{\s*default:\s*\{\s*limit:\s*(\d+),\s*ttl:\s*(\d+)\s*\}\s*\}\s*\)/);
  assert.ok(throttleMatch, "未找到 @Throttle 配置");
  assert.ok(Number(throttleMatch[1]) <= 5, `公开提交限流应≤5/min，实际 ${throttleMatch[1]}`);
  assert.ok(Number(throttleMatch[2]) >= 60000, "限流窗口应≥60s");
});

check("草稿、内部、已删除商品不能用客户端快照绕过", () => {
  assert.ok(snapshotMethod, "未定位 resolveVisibleProductSnapshots 方法体");
  const query = snapshotMethod[0].match(/this\.prisma\.product\.findMany\(\{([\s\S]*?)\}\)/);
  assert.ok(query, "未定位实际商品可见性查询");
  assert.ok(/status:\s*"PUBLISHED"/.test(query[1]), "草稿商品不得进入服务端规范快照");
  assert.ok(/deletedAt:\s*null/.test(query[1]), "软删除商品不得进入服务端规范快照");
  assert.ok(/visibility:\s*\{\s*in:\s*visibilities\s*\}/.test(query[1]), "内部商品不得绕过可见性范围");

  const createMethod = methodBody(selectionService, "create");
  assert.ok(createMethod, "未定位 SelectionInquiryService.create 方法体");
  assert.ok(/resolveVisibleProductSnapshots\(\s*distinctIds\s*,\s*data\.customer\s*,?\s*\)/.test(createMethod[0]),
    "可见性复核只能以 productId 和已验证身份为输入，不能以客户端快照为依据");
  assert.ok(/snapshots\.size\s*!==\s*distinctIds\.length/.test(createMethod[0]),
    "未产生服务端规范快照的商品必须拒绝整次提交");
  assert.ok(/productNameSnapshot:\s*snap\.name/.test(createMethod[0]),
    "客户端名称快照不能替代服务端商品快照");
  assert.ok(/productImageSnapshot:\s*snap\.mediaUrl/.test(createMethod[0]),
    "客户端图片快照不能替代服务端商品快照");
});

check("模块接线：SelectionInquiryModule 引入 ProductsModule", () => {
  assert.ok(/import\s+\{\s*ProductsModule\s*\}\s+from\s+["']\.\.\/products\/products\.module["']/.test(selectionModule),
    "必须导入 ProductsModule");
  assert.ok(/imports:\s*\[[\s\S]*ProductsModule/.test(selectionModule), "imports 必须包含 ProductsModule");
});

// ── 场景覆盖说明（静态对应关系，运行期需后端联调）──
// - 合法公开商品：游客分支 ["PUBLIC"] + status=PUBLISHED → 命中，落库（name/mediaUrl 由服务端回填）；
// - 不存在商品：id 未命中 findMany → snapshots.size < distinctIds.length → 整批拒绝；
// - 内部商品：INTERNAL 不出现在任何可见列表（PUBLIC/MEMBER/PARTNER）→ 拒绝；
// - 合作商家商品：仅 APPROVED 合作商家 resolveVisibleVisibilities 含 PARTNER；会员/游客提交 PARTNER ID → 拒绝；
// - 混合 ID：去重后任一不可见 → snapshots.size !== distinctIds.length → 整批拒绝。

console.log(`\n${passed} 项通过，选款咨询商品可见性服务端复核静态契约验证完成。`);
console.log("注：运行期越权/混合 ID 回归需后端联调（需开发库与各身份令牌）。");
if (failed > 0) {
  console.error(`${failed} 项失败。`);
  process.exit(1);
}
