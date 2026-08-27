// 微信扫码回调跨窗口通信 —— 静态契约测试
// 运行：node scripts/verify-wechat-callback-origin.mjs
// 该脚本不连接数据库、不发起任何真实微信回调。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (rel) => readFile(path.join(root, rel), "utf8");
const [controller, service, api, account] = await Promise.all([
  readSrc("server/src/modules/wechat-auth/wechat-auth.controller.ts"),
  readSrc("server/src/modules/wechat-auth/wechat-auth.service.ts"),
  readSrc("client/src/services/api.ts"),
  readSrc("client/src/pages/public/CustomerCenter/AccountExperience.tsx"),
]);

const checks = [
  ["回调页不再使用通配 origin 回传", () => {
    assert.match(
      controller,
      /postMessage\(\s*\{\s*type:\s*["']wechat-login-result["'][\s\S]*?,\s*allowedOrigin\s*\)/,
    );
    assert.doesNotMatch(controller, /postMessage[\s\S]{0,200}?["']\*["']\s*\)/);
  }],
  ["回调页对缺失来源提供兜底提示且不投递", () => {
    assert.match(controller, /if\s*\(\s*target\s*&&\s*allowedOrigin\s*\)/);
    assert.match(controller, /无法确认来源页面/);
  }],
  ["config 接收 origin 查询并传入二维码构造", () => {
    assert.match(controller, /@Query\(["']origin["']\)\s+origin\?:\s*string/);
    assert.match(controller, /buildQrConnectUrl\(origin\)/);
  }],
  ["state 只关联 CORS 白名单内的父页 origin，并使用限时签名", () => {
    assert.match(service, /normalizeParentOrigin\(parentOrigin,\s*allowedOrigins\)/);
    assert.match(service, /\[["']http:["'],\s*["']https:["']\]\.includes\(url\.protocol\)/);
    assert.match(service, /url\.origin\s*!==\s*value/);
    assert.match(service, /allowedOrigins\.includes\(url\.origin\)/);
    assert.match(service, /buildSignedState\(normalizedOrigin,\s*allowedOrigins\)/);
    assert.match(service, /createHmac\(["']sha256["'],\s*stateSigningKey\(\)\)/);
    assert.match(service, /Date\.now\(\)\s*-\s*issuedAt\s*>\s*STATE_TTL_MS/);
    assert.match(service, /timingSafeEqual\(supplied,\s*expected\)/);
  }],
  ["回调校验 state 后取回父页 origin 并随结果返回", () => {
    assert.match(service, /parentOrigin\s*=\s*verifySignedState\(/);
    assert.match(
      service,
      /resolveCorsOrigins\(process\.env\.NODE_ENV,\s*process\.env\.CORS_ORIGIN\)/,
    );
    assert.match(service, /result:\s*\{\s*kind:\s*["']error["'],\s*message:\s*["']登录状态已失效，请重新扫码["']\s*\}[\s\S]*?parentOrigin:\s*null/);
    assert.doesNotMatch(service, /this\.states\.(get|set|delete)\(/);
    assert.match(service, /Promise<WechatCallbackOutcome>/);
  }],
  ["前端只接受自身嵌入的扫码 iframe 发来的消息", () => {
    assert.match(account, /event\.source\s*!==\s*iframeRef\.current\?\.contentWindow/);
    assert.match(account, /ref=\{\s*iframeRef\s*\}/);
  }],
  ["前端请求二维码时携带当前页面 origin", () => {
    assert.match(account, /wechatConfig\(window\.location\.origin\)/);
    assert.match(api, /wechatConfig:\s*\(origin\?:\s*string\)/);
  }],
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    run();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}
if (failed) process.exit(1);
console.log(`\n${checks.length} 项通过；该测试未连接数据库，也未发起任何真实回调。`);
