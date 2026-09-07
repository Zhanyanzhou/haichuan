// 反向代理信任边界静态合同：不连接生产，不读取 .env。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");
const [nginx, nginxMain, compose, dockerfile, serverMain, wechatController] = await Promise.all([
  read("client/nginx.conf"),
  read("client/nginx-main.conf"),
  read("docker-compose.yml"),
  read("client/Dockerfile"),
  read("server/src/main.ts"),
  read("server/src/modules/wechat-auth/wechat-auth.controller.ts"),
]);

const checks = [
  ["公网 8080 只承担 ACME 与 HTTPS 重定向", () => {
    assert.match(nginx, /server\s*\{\s*listen 8080;[\s\S]*?location \^~ \/\.well-known\/acme-challenge\/[\s\S]*?location \/\s*\{\s*return 308 https:\/\/\$host\$request_uri;/);
  }],
  ["可信 TLS 回源使用独立 8081 且不公开绑定", () => {
    assert.match(nginx, /server\s*\{\s*listen 8081;/);
    assert.match(compose, /"127\.0\.0\.1:8081:8081"/);
    assert.match(dockerfile, /^EXPOSE 8080 8081$/m);
  }],
  ["不再使用客户端可控协议头或追加式 XFF", () => {
    assert.doesNotMatch(nginx, /\$http_x_forwarded_proto/);
    assert.doesNotMatch(nginx, /\$proxy_add_x_forwarded_for/);
    assert.match(nginx, /proxy_set_header X-Forwarded-Proto https;/);
    assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/);
    assert.match(nginx, /proxy_set_header Forwarded "";/);
  }],
  ["可信入口使用 Nginx 内建 real-IP 解析并让非法值回退直接对端", () => {
    assert.doesNotMatch(nginx, /map\s+\$http_x_real_ip/);
    assert.match(nginx, /server\s*\{\s*listen 8081;[\s\S]*?set_real_ip_from 0\.0\.0\.0\/0;[\s\S]*?set_real_ip_from ::\/0;[\s\S]*?real_ip_header X-Real-IP;[\s\S]*?real_ip_recursive off;/);
    assert.match(nginx, /proxy_set_header X-Real-IP \$remote_addr;/);
  }],
  ["健康检查走可信入口且不伪造协议头", () => {
    assert.match(compose, /http:\/\/127\.0\.0\.1:8081\//);
    assert.doesNotMatch(compose, /wget[^\n]*X-Forwarded-Proto/);
  }],
  ["Nest 只信直接 Nginx 一跳", () => {
    assert.match(serverMain, /configureProxyTrust\(app\.getHttpAdapter\(\)\.getInstance\(\)\)/);
  }],
  ["两层访问日志都不保留查询串或 Referer", () => {
    assert.match(nginxMain, /\$request_method \$uri \$server_protocol/);
    assert.doesNotMatch(nginxMain, /\$request(?:[^_a-zA-Z]|$)/);
    assert.doesNotMatch(nginxMain, /\$http_referer/);
  }],
  ["临时凭证路径不会进入 Nginx 固定格式错误日志", () => {
    assert.match(nginx, /location = \/api\/customers\/wechat\/callback\s*\{\s*error_log \/dev\/null crit;/);
    assert.match(nginx, /location = \/customer\/reset\s*\{\s*error_log \/dev\/null crit;/);
  }],
  ["微信回调 CSP 只由服务端按已验证父 Origin 生成", () => {
    assert.match(nginx, /~\^\/api\/customers\/wechat\/callback\$ "";/);
    assert.match(wechatController, /frame-ancestors \$\{frameAncestor\}/);
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
console.log(`\n${checks.length} 项反向代理安全合同通过。`);
